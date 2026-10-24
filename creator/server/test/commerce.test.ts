import crypto from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { api, as, createCreator, signup, TestUser } from './helpers';
import { prisma } from '../src/lib/prisma';

// ---- Razorpay API mock (only api.razorpay.com is intercepted) ----
const rzpPayments = new Map<string, { id: string; order_id: string; amount: number; currency: string; status: string; fee: number }[]>();
let rzpOrderSeq = 0;
const realFetch = globalThis.fetch;
vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith('https://api.razorpay.com/')) return realFetch(input, init);
  const path = url.replace('https://api.razorpay.com/v1', '');
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (path === '/orders' && init?.method === 'POST') {
    const b = JSON.parse(String(init.body));
    return json({ id: `order_${++rzpOrderSeq}`, amount: b.amount, currency: b.currency, status: 'created' });
  }
  const m = path.match(/^\/orders\/(.+)\/payments$/);
  if (m) return json({ items: rzpPayments.get(m[1]) ?? [] });
  const r = path.match(/^\/payments\/(.+)\/refund$/);
  if (r) {
    const b = JSON.parse(String(init?.body));
    return json({ id: `rfnd_${Date.now()}`, payment_id: r[1], amount: b.amount, status: 'processed' });
  }
  return json({ error: { description: 'not mocked' } }, 404);
});

afterEach(() => rzpPayments.clear());

function rzpWebhook(event: string, entity: Record<string, unknown>, eventId: string = crypto.randomUUID(), secret = 'whsec_razorpay_test') {
  const payload = event.startsWith('refund') ? { refund: { entity } } : { payment: { entity } };
  const raw = JSON.stringify({ event, payload });
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return api().post('/api/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', sig).set('x-razorpay-event-id', eventId).send(raw);
}

interface Setup {
  owner: TestUser;
  tenant: { id: string; slug: string };
  courseId: string;
  lessonIds: string[];
  productId: string;
  productSlug: string;
  priceId: string;
}

async function setupStore(opts: { amount?: number; drip?: 'NONE' | 'SEQUENTIAL'; certificate?: boolean } = {}): Promise<Setup> {
  const { owner, tenant } = await createCreator();
  const o = as(owner, tenant);
  const course = await o.post('/api/courses').send({ title: 'Yoga Basics', dripMode: opts.drip ?? 'NONE', certificateEnabled: opts.certificate ?? true });
  expect(course.status).toBe(201);
  const full = await o.get(`/api/courses/${course.body.course.id}`);
  const moduleId = full.body.modules[0].id;
  const l1 = await o.post(`/api/courses/modules/${moduleId}/lessons`).send({ title: 'Welcome', type: 'TEXT', body: 'Hello', isPreview: true });
  const l2 = await o.post(`/api/courses/modules/${moduleId}/lessons`).send({ title: 'Breathing', type: 'TEXT', body: 'Secret content' });
  expect(l2.status).toBe(201);
  // Product cannot be published while the course is a draft
  const product = await o.post('/api/products').send({
    type: 'COURSE',
    title: 'Yoga Basics Course',
    items: [{ resourceType: 'COURSE', resourceId: course.body.course.id }],
    prices: [{ currency: 'INR', amount: opts.amount ?? 99900 }],
  });
  expect(product.status).toBe(201);
  expect((await o.post(`/api/products/${product.body.product.id}/status`).send({ status: 'PUBLISHED' })).status).toBe(400);
  await o.post(`/api/courses/${course.body.course.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
  await o.post(`/api/products/${product.body.product.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
  return {
    owner,
    tenant,
    courseId: course.body.course.id,
    lessonIds: [l1.body.lesson.id, l2.body.lesson.id],
    productId: product.body.product.id,
    productSlug: product.body.product.slug,
    priceId: product.body.product.prices[0].id,
  };
}

function checkout(s: Setup, buyer: TestUser, extra: Record<string, unknown> = {}) {
  return as(buyer).post(`/api/store/${s.tenant.slug}/checkout`).send({ priceId: s.priceId, buyer: { name: 'Asha Buyer', country: 'IN', state: '27' }, ...extra });
}

describe('storefront → checkout → verified payment → access', () => {
  let s: Setup;
  let buyer: TestUser;

  beforeAll(async () => {
    s = await setupStore();
    buyer = await signup({ name: 'Asha Buyer' });
  });

  it('lists published products and the curriculum outline publicly', async () => {
    const store = await api().get(`/api/store/${s.tenant.slug}`);
    expect(store.status).toBe(200);
    expect(store.body.products).toHaveLength(1);
    const p = await api().get(`/api/store/${s.tenant.slug}/products/${s.productSlug}`);
    expect(p.body.courses[0].modules[0].lessons.map((l: { title: string }) => l.title)).toEqual(['Welcome', 'Breathing']);
    // Lesson bodies are not exposed by the outline
    expect(JSON.stringify(p.body)).not.toContain('Secret content');
  });

  it('allows free-preview lessons but blocks paid lessons before purchase', async () => {
    expect((await as(buyer).get(`/api/learn/lessons/${s.lessonIds[0]}`)).status).toBe(200);
    expect((await as(buyer).get(`/api/learn/lessons/${s.lessonIds[1]}`)).status).toBe(403);
  });

  let orderId: string;
  let rzpOrderId: string;

  it('creates a pending order and a Razorpay order', async () => {
    const res = await checkout(s, buyer);
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('RAZORPAY');
    expect(res.body.razorpay.amount).toBe(99900);
    expect(res.body.razorpay.keyId).toBe('rzp_test_key');
    orderId = res.body.orderId;
    rzpOrderId = res.body.razorpay.orderId;
    const order = await as(buyer).get(`/api/store/${s.tenant.slug}/orders/${orderId}`);
    expect(order.body.order.status).toBe('PENDING');
  });

  it('never fulfils from a forged browser callback', async () => {
    const res = await as(buyer).post(`/api/store/${s.tenant.slug}/orders/${orderId}/razorpay/verify`).send({ razorpay_order_id: rzpOrderId, razorpay_payment_id: 'pay_fake', razorpay_signature: 'deadbeef' });
    expect(res.status).toBe(403);
    // Even a correctly signed callback is not enough unless Razorpay's API confirms capture
    const sig = crypto.createHmac('sha256', 'rzp_test_secret').update(`${rzpOrderId}|pay_x`).digest('hex');
    const res2 = await as(buyer).post(`/api/store/${s.tenant.slug}/orders/${orderId}/razorpay/verify`).send({ razorpay_order_id: rzpOrderId, razorpay_payment_id: 'pay_x', razorpay_signature: sig });
    expect(res2.body.status).toBe('PENDING');
    expect((await as(buyer).get(`/api/learn/lessons/${s.lessonIds[1]}`)).status).toBe(403);
  });

  it('rejects webhooks with an invalid signature', async () => {
    const res = await rzpWebhook('payment.captured', { id: 'pay_1', order_id: rzpOrderId, amount: 99900, currency: 'INR', status: 'captured' }, undefined, 'wrong-secret');
    expect(res.status).toBe(400);
    expect(await prisma.webhookEvent.count()).toBe(0);
  });

  it('does not fulfil when the paid amount does not match', async () => {
    const res = await rzpWebhook('payment.captured', { id: 'pay_low', order_id: rzpOrderId, amount: 100, currency: 'INR', status: 'captured' });
    expect(res.status).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('PENDING');
  });

  it('fulfils on a verified payment.captured webhook', async () => {
    const res = await rzpWebhook('payment.captured', { id: 'pay_good', order_id: rzpOrderId, amount: 99900, currency: 'INR', status: 'captured', fee: 2358 }, 'evt_capture_1');
    expect(res.status).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true, payments: true } });
    expect(order.status).toBe('PAID');
    expect(order.invoice?.number).toMatch(/^INV\/\d{4}-\d{2}\/00001$/);
    expect(order.payments[0].gatewayFee).toBe(2358);
    // 5% platform fee on starter plan, on the pre-tax amount (no GSTIN → no tax)
    expect(order.payments[0].platformFee).toBe(4995);
    expect((await as(buyer).get(`/api/learn/lessons/${s.lessonIds[1]}`)).status).toBe(200);
    const lib = await as(buyer).get('/api/learn/library');
    expect(lib.body.courses).toHaveLength(1);
    const contact = await prisma.contact.findFirst({ where: { tenantId: s.tenant.id, email: buyer.email } });
    expect(contact).toBeTruthy();
  });

  it('is idempotent for duplicate and replayed webhook deliveries', async () => {
    const ledgerBefore = await prisma.ledgerEntry.count({ where: { tenantId: s.tenant.id } });
    const dup = await rzpWebhook('payment.captured', { id: 'pay_good', order_id: rzpOrderId, amount: 99900, currency: 'INR', status: 'captured', fee: 2358 }, 'evt_capture_1');
    expect(dup.body.duplicate).toBe(true);
    // Different event (order.paid) for the same payment must not capture twice
    await rzpWebhook('order.paid', { id: 'pay_good', order_id: rzpOrderId, amount: 99900, currency: 'INR', status: 'captured' }, 'evt_order_paid_1');
    // Concurrent deliveries of a brand-new event id
    await Promise.all([1, 2, 3].map(() => rzpWebhook('payment.captured', { id: 'pay_good', order_id: rzpOrderId, amount: 99900, currency: 'INR', status: 'captured' }, 'evt_concurrent')));
    expect(await prisma.ledgerEntry.count({ where: { tenantId: s.tenant.id } })).toBe(ledgerBefore);
    expect(await prisma.invoice.count({ where: { tenantId: s.tenant.id } })).toBe(1);
  });

  it('prevents buying the same course twice', async () => {
    expect((await checkout(s, buyer)).status).toBe(409);
  });

  it('shows real revenue on the creator dashboard', async () => {
    const d = await as(s.owner, s.tenant).get('/api/dashboard');
    expect(d.status).toBe(200);
    expect(d.body.revenue).toBe(99900);
    expect(d.body.ordersPaid).toBe(1);
    expect(d.body.netEarnings).toBe(99900 - 4995 - 2358);
    expect(d.body.newEnrollments).toBe(1);
  });

  it('refunds through the provider, revokes access and reverses the ledger', async () => {
    const other = await createCreator();
    // Another workspace cannot refund this order
    expect((await as(other.owner, other.tenant).post(`/api/orders/${orderId}/refund`).send({})).status).toBe(404);
    const res = await as(s.owner, s.tenant).post(`/api/orders/${orderId}/refund`).send({ reason: 'Requested by student' });
    expect(res.status).toBe(201);
    expect(res.body.refund.status).toBe('PROCESSED');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('REFUNDED');
    expect((await as(buyer).get(`/api/learn/lessons/${s.lessonIds[1]}`)).status).toBe(403);
    const bal = await as(s.owner, s.tenant).get('/api/finance/balance');
    // Sale and refund cancel out; platform fee returned; gateway fee is lost
    expect(bal.body.balances[0].balance).toBe(-2358);
    // A later refund.processed webhook for the same refund is a no-op
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId } });
    await rzpWebhook('refund.processed', { id: refund.providerRefundId, payment_id: 'pay_good', amount: 99900, status: 'processed' });
    expect(await prisma.ledgerEntry.count({ where: { tenantId: s.tenant.id, type: 'REFUND' } })).toBe(1);
  });

  it('confirms payment via server-side Razorpay API lookup when the webhook is late', async () => {
    const buyer2 = await signup();
    const res = await checkout(s, buyer2);
    const rid = res.body.razorpay.orderId;
    rzpPayments.set(rid, [{ id: 'pay_api', order_id: rid, amount: 99900, currency: 'INR', status: 'captured', fee: 2000 }]);
    const sig = crypto.createHmac('sha256', 'rzp_test_secret').update(`${rid}|pay_api`).digest('hex');
    const v = await as(buyer2).post(`/api/store/${s.tenant.slug}/orders/${res.body.orderId}/razorpay/verify`).send({ razorpay_order_id: rid, razorpay_payment_id: 'pay_api', razorpay_signature: sig });
    expect(v.body.status).toBe('PAID');
    // Another user cannot read this order
    expect((await as(buyer).get(`/api/store/${s.tenant.slug}/orders/${res.body.orderId}`)).status).toBe(404);
  });
});

describe('pricing, coupons and tax', () => {
  it('extracts GST from tax-inclusive prices and splits CGST/SGST intra-state', async () => {
    const s = await setupStore({ amount: 118000 });
    await as(s.owner, s.tenant).patch('/api/workspaces/current').send({ gstin: '27AAAAA0000A1Z5', taxRateBps: 1800, pricesIncludeTax: true }).expect(200);
    const q = await api().post(`/api/store/${s.tenant.slug}/checkout/quote`).send({ priceId: s.priceId, country: 'IN' });
    expect(q.body.quote.total).toBe(118000);
    expect(q.body.quote.taxAmount).toBe(18000);
    // Export (non-India buyer) is zero-rated
    const intl = await api().post(`/api/store/${s.tenant.slug}/checkout/quote`).send({ priceId: s.priceId, country: 'US' });
    expect(intl.body.quote.taxAmount).toBe(0);
    const buyer = await signup();
    const c = await checkout(s, buyer);
    await rzpWebhook('payment.captured', { id: 'pay_gst', order_id: c.body.razorpay.orderId, amount: 118000, currency: 'INR', status: 'captured' });
    const inv = await prisma.invoice.findFirstOrThrow({ where: { tenantId: s.tenant.id } });
    expect(inv.cgst + inv.sgst).toBe(18000);
    expect(inv.igst).toBe(0);
    // Platform fee is on the pre-tax amount: 5% of 100000
    const pay = await prisma.payment.findFirstOrThrow({ where: { orderId: c.body.orderId } });
    expect(pay.platformFee).toBe(5000);
  });

  it('applies coupons, enforces limits, and fulfils 100%-off orders without payment', async () => {
    const s = await setupStore();
    const o = as(s.owner, s.tenant);
    await o.post('/api/coupons').send({ code: 'half', type: 'PERCENT', value: 5000 }).expect(201);
    await o.post('/api/coupons').send({ code: 'FREE100', type: 'PERCENT', value: 10000, maxRedemptions: 1 }).expect(201);
    const q = await api().post(`/api/store/${s.tenant.slug}/checkout/quote`).send({ priceId: s.priceId, couponCode: 'HALF' });
    expect(q.body.quote.total).toBe(49950);
    expect((await api().post(`/api/store/${s.tenant.slug}/checkout/quote`).send({ priceId: s.priceId, couponCode: 'NOPE' })).status).toBe(400);
    const b1 = await signup();
    const free = await checkout(s, b1, { couponCode: 'FREE100' });
    expect(free.status).toBe(201);
    expect(free.body.status).toBe('PAID');
    expect((await as(b1).get(`/api/learn/lessons/${s.lessonIds[1]}`)).status).toBe(200);
    const b2 = await signup();
    expect((await checkout(s, b2, { couponCode: 'FREE100' })).status).toBe(400);
  });
});

describe('tenant isolation on commerce and content', () => {
  it('blocks cross-tenant reads, writes and resource references', async () => {
    const a = await setupStore();
    const b = await createCreator();
    const ob = as(b.owner, b.tenant);
    expect((await ob.get(`/api/courses/${a.courseId}`)).status).toBe(404);
    expect((await ob.patch(`/api/courses/${a.courseId}`).send({ title: 'Stolen' })).status).toBe(404);
    expect((await ob.patch(`/api/courses/lessons/${a.lessonIds[1]}`).send({ title: 'x' })).status).toBe(404);
    expect((await ob.get(`/api/products/${a.productId}`)).status).toBe(404);
    // Cannot sell another workspace's course
    const steal = await ob.post('/api/products').send({ type: 'COURSE', title: 'Stolen', items: [{ resourceType: 'COURSE', resourceId: a.courseId }], prices: [{ currency: 'INR', amount: 100 }] });
    expect(steal.status).toBe(400);
    // Cannot check out with another store's price
    const buyer = await signup();
    const x = await as(buyer).post(`/api/store/${b.tenant.slug}/checkout`).send({ priceId: a.priceId, buyer: { name: 'Bo B', country: 'IN' } });
    expect(x.status).toBe(404);
    // Orders list only shows own orders
    const list = await ob.get('/api/orders');
    expect(list.body.total).toBe(0);
  });

  it('restricts students from the creator dashboard', async () => {
    const s = await setupStore({ amount: 0 });
    const student = await signup();
    await checkout(s, student).expect(201);
    expect((await as(student, s.tenant).get('/api/dashboard')).status).toBe(403);
    expect((await as(student, s.tenant).get('/api/orders')).status).toBe(403);
  });
});

describe('learning experience', () => {
  it('enforces sequential drip, grades quizzes server-side, issues certificates, awards points once', async () => {
    const s = await setupStore({ amount: 0, drip: 'SEQUENTIAL', certificate: true });
    const o = as(s.owner, s.tenant);
    const course = await o.get(`/api/courses/${s.courseId}`);
    const quizLesson = await o.post(`/api/courses/modules/${course.body.modules[0].id}/lessons`).send({ title: 'Check', type: 'QUIZ' });
    const quiz = await o.put(`/api/courses/lessons/${quizLesson.body.lesson.id}/quiz`).send({
      passPct: 100,
      questions: [{ prompt: '2+2?', type: 'SINGLE', options: ['3', '4'], correct: [1] }],
    });
    expect(quiz.status).toBe(200);
    const qid = quiz.body.quiz.questions[0].id;

    const student = await signup();
    await checkout(s, student).expect(201);
    const st = as(student);
    const outline = await st.get(`/api/learn/courses/${s.courseId}`);
    expect(outline.body.modules[0].lessons.map((l: { locked: boolean }) => l.locked)).toEqual([false, true, true]);
    expect((await st.get(`/api/learn/lessons/${s.lessonIds[1]}`)).status).toBe(403);

    await st.post(`/api/learn/lessons/${s.lessonIds[0]}/progress`).send({ completed: true }).expect(200);
    await st.post(`/api/learn/lessons/${s.lessonIds[0]}/progress`).send({ completed: true }).expect(200);
    await st.post(`/api/learn/lessons/${s.lessonIds[1]}/progress`).send({ completed: true }).expect(200);

    const lq = await st.get(`/api/learn/lessons/${quizLesson.body.lesson.id}`);
    expect(lq.status).toBe(200);
    expect(JSON.stringify(lq.body.lesson.quiz)).not.toContain('correct');
    // Cannot self-complete a quiz lesson
    expect((await st.post(`/api/learn/lessons/${quizLesson.body.lesson.id}/progress`).send({ completed: true })).status).toBe(400);
    const wrong = await st.post(`/api/learn/lessons/${quizLesson.body.lesson.id}/quiz`).send({ answers: { [qid]: [0] } });
    expect(wrong.body.passed).toBe(false);
    const right = await st.post(`/api/learn/lessons/${quizLesson.body.lesson.id}/quiz`).send({ answers: { [qid]: [1] } });
    expect(right.body.passed).toBe(true);
    expect(right.body.progressPct).toBe(100);

    const after = await st.get(`/api/learn/courses/${s.courseId}`);
    expect(after.body.enrollment.status).toBe('COMPLETED');
    const code = after.body.certificate.verificationCode;
    const verify = await api().get(`/api/public/certificates/${code}`);
    expect(verify.status).toBe(200);
    expect(verify.body.certificate.courseTitle).toBe('Yoga Basics');

    const points = await prisma.pointsLedger.aggregate({ where: { tenantId: s.tenant.id, userId: student.id }, _sum: { points: true } });
    expect(points._sum.points).toBe(3 * 10 + 100); // lesson 1 counted once despite two completions
  });

  it('reorders the curriculum only with ids from the same course', async () => {
    const s = await setupStore();
    const o = as(s.owner, s.tenant);
    const c = await o.get(`/api/courses/${s.courseId}`);
    const modId = c.body.modules[0].id;
    await o.put(`/api/courses/${s.courseId}/curriculum/order`).send({ modules: [{ id: modId, lessonIds: [...s.lessonIds].reverse() }] }).expect(200);
    const after = await o.get(`/api/courses/${s.courseId}`);
    expect(after.body.modules[0].lessons.map((l: { id: string }) => l.id)).toEqual([...s.lessonIds].reverse());
    const other = await setupStore();
    const bad = await o.put(`/api/courses/${s.courseId}/curriculum/order`).send({ modules: [{ id: modId, lessonIds: [s.lessonIds[0], other.lessonIds[0]] }] });
    expect(bad.status).toBe(400);
  });
});
