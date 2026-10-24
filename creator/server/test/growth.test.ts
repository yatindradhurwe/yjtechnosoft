import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { api, as, createCreator, signup, TestUser } from './helpers';
import { prisma } from '../src/lib/prisma';
import { testOutbox } from '../src/services/email';
import { runDueJobs } from '../src/services/jobs';
import { registerJobs, runSweeps } from '../src/jobs';
import { runDueExecutions } from '../src/modules/marketing/automation';
import { sendDueCampaigns } from '../src/modules/marketing/campaigns';
import { evaluate } from '../src/modules/tools/formula';

registerJobs();

// ---- External HTTP mocks: Razorpay orders and the Anthropic Messages API ----
let rzp = 0;
let anthropicReplies: unknown[] = [];
const realFetch = globalThis.fetch;
vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://api.razorpay.com/v1/orders')) {
    const b = JSON.parse(String(init?.body));
    return json({ id: `order_g${++rzp}`, amount: b.amount, currency: b.currency, status: 'created' });
  }
  if (url.startsWith('https://api.razorpay.com/v1/payments/')) return json({ id: `rfnd_${Date.now()}`, payment_id: 'x', amount: 1, status: 'processed' });
  if (url.startsWith('https://api.anthropic.com/')) {
    const reply = anthropicReplies.shift();
    if (!reply) throw new Error('no mocked AI reply');
    return json(reply);
  }
  return realFetch(input, init);
});

const drain = async () => {
  while ((await runDueJobs(50)) > 0) {
    /* drain */
  }
};

function paidWebhook(orderId: string, amount: number, paymentId = `pay_${crypto.randomUUID()}`) {
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } } });
  const sig = crypto.createHmac('sha256', 'whsec_razorpay_test').update(raw).digest('hex');
  return api().post('/api/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', sig).set('x-razorpay-event-id', crypto.randomUUID()).send(raw);
}

async function storeWithProduct(amount = 100000) {
  const { owner, tenant } = await createCreator();
  const o = as(owner, tenant);
  const c = await o.post('/api/courses').send({ title: 'Course' });
  const full = await o.get(`/api/courses/${c.body.course.id}`);
  await o.post(`/api/courses/modules/${full.body.modules[0].id}/lessons`).send({ title: 'L1', type: 'TEXT', body: 'x' });
  await o.post(`/api/courses/${c.body.course.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
  const p = await o.post('/api/products').send({ type: 'COURSE', title: 'Course', items: [{ resourceType: 'COURSE', resourceId: c.body.course.id }], prices: [{ currency: 'INR', amount }] });
  await o.post(`/api/products/${p.body.product.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
  return { owner, tenant, productId: p.body.product.id as string, priceId: p.body.product.prices[0].id as string };
}

async function buy(s: { tenant: { slug: string }; priceId: string }, buyer: TestUser, extra: Record<string, unknown> = {}) {
  const r = await as(buyer).post(`/api/store/${s.tenant.slug}/checkout`).send({ priceId: s.priceId, buyer: { name: 'Buyer Name', country: 'IN' }, ...extra });
  expect(r.status).toBe(201);
  if (r.body.provider === 'RAZORPAY') await paidWebhook(r.body.razorpay.orderId, r.body.razorpay.amount).expect(200);
  return r.body.orderId as string;
}

describe('affiliates', () => {
  it('attributes by click within the window, pays product-specific rates, blocks self-referral, reverses on refund', async () => {
    const s = await storeWithProduct(100000);
    const aff = await signup({ name: 'Priya Affiliate' });
    const join = await as(aff).post(`/api/store/${s.tenant.slug}/affiliates/join`);
    expect(join.status).toBe(201);
    const code = join.body.affiliate.code;
    // Unapproved affiliates do not track
    expect((await api().post(`/api/store/${s.tenant.slug}/affiliates/click`).send({ code, visitorId: 'visitor-0001' })).body.tracked).toBe(false);
    await as(s.owner, s.tenant).patch(`/api/affiliates/${join.body.affiliate.id}`).send({ status: 'APPROVED', commissionBps: 1000 }).expect(200);
    await as(s.owner, s.tenant).put(`/api/affiliates/rules/${s.productId}`).send({ commissionBps: 2000 }).expect(200);

    await api().post(`/api/store/${s.tenant.slug}/affiliates/click`).send({ code, visitorId: 'visitor-0002' }).expect(200);
    const buyer = await signup();
    const orderId = await buy(s, buyer, { visitorId: 'visitor-0002' });
    const commission = await prisma.commission.findUniqueOrThrow({ where: { orderId } });
    expect(commission.amount).toBe(20000); // 20% product rule on ₹1000

    // Self-referral earns nothing
    const selfOrder = await buy(s, aff, { affiliateCode: code });
    expect(await prisma.commission.findUnique({ where: { orderId: selfOrder } })).toBeNull();

    const dash = await as(aff).get('/api/affiliate');
    expect(dash.body.programs[0].conversions).toBe(1);
    expect(dash.body.programs[0].pending).toBe(20000);
    expect(JSON.stringify(dash.body)).not.toContain(buyer.email);

    await as(s.owner, s.tenant).post(`/api/orders/${orderId}/refund`).send({}).expect(201);
    const reversed = await prisma.commission.findUniqueOrThrow({ where: { orderId } });
    expect(reversed.status).toBe('REVERSED');
    // Cannot approve a commission on a refunded order
    expect((await as(s.owner, s.tenant).patch(`/api/affiliates/commissions/${reversed.id}`).send({ status: 'APPROVED' })).status).toBe(400);
  });
});

describe('marketing automation', () => {
  it('runs workflows once per event with delays, conditions and tags, respecting unsubscribes', async () => {
    const s = await storeWithProduct(50000);
    const o = as(s.owner, s.tenant);
    const wf = await o.post('/api/marketing/workflows').send({
      name: 'Welcome buyers',
      trigger: { event: 'order.paid', productId: s.productId },
      steps: [
        { type: 'send_email', subject: 'Welcome {{first_name}}!', body: 'Start here: {{store_url}}' },
        { type: 'add_tag', tag: 'onboarded' },
        { type: 'delay', minutes: 60 },
        { type: 'condition', check: 'has_tag', value: 'vip' },
        { type: 'send_email', subject: 'VIP only', body: 'secret' },
      ],
    });
    expect(wf.status).toBe(201);
    await o.put(`/api/marketing/workflows/${wf.body.workflow.id}`).send({ ...wf.body.workflow, status: 'ACTIVE' }).expect(200);

    const buyer = await signup({ name: 'Ravi Kumar' });
    await buy(s, buyer);
    await drain(); // order.paid job → dispatches the workflow
    await drain();
    await runDueExecutions();
    const welcome = testOutbox.filter((m) => m.to === buyer.email && m.subject === 'Welcome Buyer!');
    expect(welcome).toHaveLength(1);
    expect(welcome[0].text).toContain(`/s/${s.tenant.slug}`);
    expect(welcome[0].unsubscribeUrl).toBeTruthy();
    const exec = await prisma.automationExecution.findFirstOrThrow({ where: { workflowId: wf.body.workflow.id } });
    expect(exec.status).toBe('WAITING');
    const contact = await prisma.contact.findFirstOrThrow({ where: { tenantId: s.tenant.id, email: buyer.email }, include: { tags: { include: { tag: true } } } });
    expect(contact.tags.map((t) => t.tag.name)).toContain('onboarded');

    // Re-dispatching the same event does not start a second run
    const { dispatchAutomationEvent } = await import('../src/modules/marketing/automation');
    const order = await prisma.order.findFirstOrThrow({ where: { userId: buyer.id } });
    expect(await dispatchAutomationEvent(s.tenant.id, 'order.paid', contact.id, { productId: s.productId, orderId: order.id })).toBe(0);

    // Fast-forward the delay: condition (no vip tag) stops the run before the VIP email
    await prisma.automationExecution.update({ where: { id: exec.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await runDueExecutions();
    const done = await prisma.automationExecution.findUniqueOrThrow({ where: { id: exec.id } });
    expect(done.status).toBe('COMPLETED');
    expect(testOutbox.some((m) => m.to === buyer.email && m.subject === 'VIP only')).toBe(false);
  });

  it('sends campaigns only to consenting contacts and honours one-click unsubscribe', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    await o.post('/api/marketing/contacts').send({ email: 'yes@example.test', name: 'Yes', consentEmail: true, tags: ['newsletter'] }).expect(201);
    await o.post('/api/marketing/contacts').send({ email: 'no@example.test', name: 'No', consentEmail: false, tags: ['newsletter'] }).expect(201);
    const imp = await o.post('/api/marketing/contacts/import').send({ csv: 'email,name,tags\nimp@example.test,Imp,newsletter\nnot-an-email,Bad,\n', consentConfirmed: true });
    expect(imp.body).toMatchObject({ imported: 1, failed: 1 });
    const c = await o.post('/api/marketing/campaigns').send({ channel: 'EMAIL', name: 'Launch', subject: 'Hi {{first_name}}', body: 'News', audience: { tags: ['newsletter'] } });
    expect((await o.get(`/api/marketing/campaigns/${c.body.campaign.id}/audience`)).body.recipients).toBe(2);
    await o.post(`/api/marketing/campaigns/${c.body.campaign.id}/schedule`).send({}).expect(200);
    await sendDueCampaigns();
    const sent = testOutbox.filter((m) => m.campaignId === c.body.campaign.id);
    expect(sent.map((m) => m.to).sort()).toEqual(['imp@example.test', 'yes@example.test']);
    // Unsubscribe via the signed link, then a second campaign skips that address
    const unsub = new URL(sent.find((m) => m.to === 'yes@example.test')!.unsubscribeUrl!);
    expect((await api().get(`${unsub.pathname}?t=${unsub.searchParams.get('t')}&c=${unsub.searchParams.get('c')}&s=bad`)).status).toBe(400);
    await api().post(`${unsub.pathname}${unsub.search}`).expect(200);
    const c2 = await o.post('/api/marketing/campaigns').send({ channel: 'EMAIL', name: 'Second', subject: 'Again', body: 'x', audience: { tags: ['newsletter'] } });
    await o.post(`/api/marketing/campaigns/${c2.body.campaign.id}/schedule`).send({}).expect(200);
    await sendDueCampaigns();
    expect(testOutbox.filter((m) => m.campaignId === c2.body.campaign.id).map((m) => m.to)).toEqual(['imp@example.test']);
    // WhatsApp campaigns without a connected number are logged as skipped, never as sent
    await o.patch(`/api/marketing/contacts/${(await prisma.contact.findFirstOrThrow({ where: { email: 'imp@example.test' } })).id}`).send({ phone: '9876543210', consentWhatsapp: true }).expect(200);
    const wa = await o.post('/api/marketing/campaigns').send({ channel: 'WHATSAPP', name: 'WA', subject: 'en', body: 'launch_update', audience: {} });
    await o.post(`/api/marketing/campaigns/${wa.body.campaign.id}/schedule`).send({}).expect(200);
    await sendDueCampaigns();
    const logs = await prisma.messageLog.findMany({ where: { campaignId: wa.body.campaign.id } });
    expect(logs.map((l) => l.status)).toEqual(['SKIPPED']);
  });
});

describe('landing pages', () => {
  it('validates blocks, publishes immutable versions, rolls back, and renders only published content', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    const bad = await o.post('/api/pages').send({ title: 'X', slug: 'x', draft: { blocks: [{ type: 'html', id: 'a', html: '<script>' }] } });
    expect(bad.status).toBe(400);
    const page = await o.post('/api/pages').send({ title: 'Launch', slug: 'launch', draft: { blocks: [{ type: 'hero', id: 'h', heading: 'Version one' }] } });
    expect(page.status).toBe(201);
    expect((await api().get(`/api/store/${tenant.slug}/pages/launch`)).status).toBe(404);
    await o.post(`/api/pages/${page.body.page.id}/publish`).expect(200);
    await o.put(`/api/pages/${page.body.page.id}`).send({ title: 'Launch', slug: 'launch', draft: { blocks: [{ type: 'hero', id: 'h', heading: 'Version two (draft)' }] } }).expect(200);
    // Draft edits are not public until published
    expect((await api().get(`/api/store/${tenant.slug}/pages/launch`)).body.page.blocks[0].heading).toBe('Version one');
    await o.post(`/api/pages/${page.body.page.id}/publish`).expect(200);
    expect((await api().get(`/api/store/${tenant.slug}/pages/launch`)).body.page.blocks[0].heading).toBe('Version two (draft)');
    const detail = await o.get(`/api/pages/${page.body.page.id}`);
    const v1 = detail.body.versions.find((v: { version: number }) => v.version === 1);
    await o.post(`/api/pages/${page.body.page.id}/versions/${v1.id}/restore`).expect(200);
    await o.post(`/api/pages/${page.body.page.id}/publish`).expect(200);
    expect((await api().get(`/api/store/${tenant.slug}/pages/launch`)).body.page.blocks[0].heading).toBe('Version one');
  });

  it('only routes custom domains after DNS verification', async () => {
    const { owner, tenant } = await createCreator();
    const d = await as(owner, tenant).post('/api/pages/domains/all').send({ hostname: 'courses.example.invalid' });
    expect(d.status).toBe(201);
    const v = await as(owner, tenant).post(`/api/pages/domains/${d.body.domain.id}/verify`);
    expect(v.body.verified).toBe(false);
    expect((await api().get('/api/domains?host=courses.example.invalid')).status).toBe(404);
    expect((await api().get('/api/domains/tls-allowed?domain=courses.example.invalid')).status).toBe(404);
  });
});

describe('creator tools', () => {
  it('evaluates formulas safely without executing code', () => {
    expect(evaluate('round(weight / (height / 100) ^ 2, 1)', { weight: 70, height: 175 })).toBe(22.9);
    expect(evaluate('if(score >= 50, 1, 0)', { score: 60 })).toBe(1);
    expect(() => evaluate('constructor.constructor("return process")()', {})).toThrow();
    expect(() => evaluate('process', {})).toThrow(/Unknown field/);
    expect(() => evaluate('1/0', {})).toThrow();
  });

  it('publishes a calculator, hides formulas, enforces access and saves history', async () => {
    const { owner, tenant } = await createCreator();
    const def = {
      fields: [
        { key: 'weight', label: 'Weight (kg)', type: 'number', min: 20, max: 300 },
        { key: 'height', label: 'Height (cm)', type: 'number', min: 100, max: 250 },
      ],
      outputs: [{ key: 'bmi', label: 'BMI', formula: 'weight / (height/100)^2', decimals: 1 }],
      saveResults: true,
    };
    expect((await as(owner, tenant).post('/api/tools').send({ title: 'BMI', slug: 'bmi', access: 'MEMBERS', definition: { ...def, outputs: [{ key: 'x', label: 'X', formula: 'nope + 1' }] } })).status).toBe(400);
    const t = await as(owner, tenant).post('/api/tools').send({ title: 'BMI', slug: 'bmi', access: 'MEMBERS', definition: def });
    await as(owner, tenant).put(`/api/tools/${t.body.tool.id}`).send({ title: 'BMI', slug: 'bmi', access: 'MEMBERS', definition: def, status: 'PUBLISHED' }).expect(200);
    const pub = await api().get(`/api/store/${tenant.slug}/tools/bmi`);
    expect(pub.body.allowed).toBe(false);
    expect(JSON.stringify(pub.body)).not.toContain('formula');
    const m = await signup();
    expect((await as(m).post(`/api/store/${tenant.slug}/tools/bmi/run`).send({ inputs: { weight: 70, height: 175 } })).status).toBe(403);
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: m.id, roles: ['STUDENT'] } });
    const r = await as(m).post(`/api/store/${tenant.slug}/tools/bmi/run`).send({ inputs: { weight: 70, height: 175 } });
    expect(r.body.outputs.bmi).toBe(22.9);
    expect((await as(m).post(`/api/store/${tenant.slug}/tools/bmi/run`).send({ inputs: { weight: 5, height: 175 } })).status).toBe(400);
    expect((await as(m).get(`/api/store/${tenant.slug}/tools/bmi`)).body.history).toHaveLength(1);
  });
});

describe('AI assistant', () => {
  const msg = (content: unknown[], stop = 'end_turn', usage = { input_tokens: 1000, output_tokens: 500 }) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage,
  });

  it('is unavailable without a provider and never fakes output', async () => {
    const { owner, tenant } = await createCreator();
    const r = await as(owner, tenant).post('/api/ai/generate').send({ kind: 'email', prompt: 'Launch email for my yoga course' });
    expect(r.status).toBe(503);
  });

  it('uses tenant-scoped tools, meters credits, and only applies drafts on explicit approval', async () => {
    const { env } = await import('../src/config/env');
    Object.assign(env, { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test' });
    try {
      const s = await storeWithProduct(70000);
      await buy(s, await signup());
      const other = await storeWithProduct(990000);
      await buy(other, await signup());
      const o = as(s.owner, s.tenant);

      anthropicReplies = [
        msg([{ type: 'tool_use', id: 'tu_1', name: 'get_sales_summary', input: { days: 30 } }], 'tool_use'),
        msg([{ type: 'text', text: 'You made ₹700 this month.' }]),
      ];
      const chat = await o.post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'How are sales?' }] });
      expect(chat.status).toBe(200);
      expect(chat.body.toolsUsed).toEqual(['get_sales_summary']);
      // The tool result sent back to the model contains only this workspace's revenue
      const calls = (globalThis.fetch as unknown as { mock: { calls: [unknown, RequestInit?][] } }).mock.calls.filter(([u]) => String(u).startsWith('https://api.anthropic.com'));
      const second = JSON.parse(String(calls[calls.length - 1][1]?.body));
      const toolResult = JSON.stringify(second.messages[second.messages.length - 1]);
      expect(toolResult).toContain('70000');
      expect(toolResult).not.toContain('990000');
      expect(second.model).toBe('claude-opus-5-5');

      const usage = await o.get('/api/ai/usage');
      expect(usage.body.monthlyAllowance).toBe(100);
      expect(usage.body.balance).toBeLessThan(100);

      anthropicReplies = [msg([{ type: 'text', text: JSON.stringify({ title: 'Yoga 101', description: 'Basics', modules: [{ title: 'Start', lessons: [{ title: 'Breath', summary: 'Breathing basics' }] }] }) }])];
      const gen = await o.post('/api/ai/generate').send({ kind: 'course_outline', prompt: 'A beginner yoga course' });
      expect(gen.status).toBe(200);
      // Generating does not create anything
      expect(await prisma.course.count({ where: { tenantId: s.tenant.id, title: 'Yoga 101' } })).toBe(0);
      const applied = await o.post('/api/ai/apply/course-outline').send(gen.body.draft);
      expect(applied.status).toBe(201);
      expect(applied.body.course.status).toBe('DRAFT');

      // Landing pages from AI must pass the block schema
      anthropicReplies = [msg([{ type: 'text', text: '{"blocks":[{"type":"script","id":"x"}]}' }]), msg([{ type: 'text', text: '{"blocks":[{"type":"hero","id":"h","heading":"Join"}],"theme":{}}' }])];
      const page = await o.post('/api/ai/generate').send({ kind: 'landing_page', prompt: 'Webinar landing page' });
      expect(page.body.draft.blocks[0].type).toBe('hero');

      // Out of credits → blocked
      await prisma.aiCreditLedger.create({ data: { tenantId: s.tenant.id, delta: -10_000, reason: 'test' } });
      expect((await o.post('/api/ai/generate').send({ kind: 'email', prompt: 'Another email please' })).status).toBe(403);
    } finally {
      Object.assign(env, { AI_PROVIDER: 'none', ANTHROPIC_API_KEY: undefined });
    }
  });
});

describe('subscriptions', () => {
  it('extends on renewal, enters a grace period, then expires access', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    const comm = await o.post('/api/community-admin').send({ name: 'Inner circle', access: 'PAID' });
    const p = await o.post('/api/products').send({ type: 'MEMBERSHIP', title: 'Monthly membership', items: [{ resourceType: 'COMMUNITY', resourceId: comm.body.community.id }], prices: [{ currency: 'INR', amount: 29900, type: 'RECURRING', interval: 'MONTH' }] });
    await o.post(`/api/products/${p.body.product.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
    const s = { tenant, priceId: p.body.product.prices[0].id };
    const member = await signup();
    await buy(s, member);
    const sub = await prisma.customerSubscription.findFirstOrThrow({ where: { userId: member.id } });
    expect((await as(member).get(`/api/community/${comm.body.community.id}`)).status).toBe(200);

    // Renewal extends from the current period end
    await buy(s, member);
    const renewed = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(renewed.currentPeriodEnd.getTime() - sub.currentPeriodEnd.getTime()).toBe(30 * 86400_000);
    expect(await prisma.customerSubscription.count({ where: { userId: member.id } })).toBe(1);

    // Period ends → grace with access; grace ends → expired without access
    await prisma.customerSubscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await prisma.entitlement.updateMany({ where: { userId: member.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runSweeps();
    expect((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('GRACE');
    expect((await as(member).get(`/api/community/${comm.body.community.id}`)).status).toBe(200);
    await prisma.customerSubscription.update({ where: { id: sub.id }, data: { graceUntil: new Date(Date.now() - 1000) } });
    await prisma.entitlement.updateMany({ where: { userId: member.id, sourceType: 'SUBSCRIPTION' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await runSweeps();
    expect((await prisma.customerSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('EXPIRED');
    expect((await as(member).get(`/api/community/${comm.body.community.id}`)).status).toBe(403);
  });
});

describe('video feed', () => {
  it('serves public posts to anyone, members-only posts to members, and counts unique views', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    const mp4 = Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(64)]);
    const v = await o.post('/api/media').attach('file', mp4, { filename: 'clip.mp4', contentType: 'video/mp4' });
    const member = await signup();
    // Members cannot post unless the creator allows it
    expect((await as(member).post(`/api/store/${tenant.slug}/feed`).send({ mediaAssetId: v.body.asset.id })).status).toBe(403);
    await as(owner).post(`/api/store/${tenant.slug}/feed`).send({ mediaAssetId: v.body.asset.id, caption: 'Public tip', visibility: 'PUBLIC' }).expect(201);
    await as(owner).post(`/api/store/${tenant.slug}/feed`).send({ mediaAssetId: v.body.asset.id, caption: 'Members tip', visibility: 'MEMBERS' }).expect(201);
    const anon = await api().get(`/api/store/${tenant.slug}/feed`);
    const byCaption = (b: { items: { caption: string; locked: boolean; videoUrl: string | null; id: string }[] }, c: string) => b.items.find((i) => i.caption === c)!;
    expect(byCaption(anon.body, 'Public tip').videoUrl).toBeTruthy();
    expect(byCaption(anon.body, 'Members tip').locked).toBe(true);
    expect(byCaption(anon.body, 'Members tip').videoUrl).toBeNull();
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: member.id, roles: ['STUDENT'] } });
    const mine = await as(member).get(`/api/store/${tenant.slug}/feed`);
    expect(byCaption(mine.body, 'Members tip').locked).toBe(false);
    const postId = byCaption(mine.body, 'Public tip').id;
    for (let i = 0; i < 3; i++) await as(member).post(`/api/store/${tenant.slug}/feed/${postId}/view`).expect(200);
    expect((await prisma.feedPost.findUniqueOrThrow({ where: { id: postId } })).viewCount).toBe(1);
    expect((await as(member).post(`/api/store/${tenant.slug}/feed/${postId}/like`)).body.liked).toBe(true);
  });
});
