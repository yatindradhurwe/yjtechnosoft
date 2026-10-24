import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden } from '../../lib/errors';
import { blocksSchema } from '../../lib/blocks';
import { body, slugify } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { aiLimiter } from '../../middleware/rateLimit';
import { audit } from '../../services/audit';
import { tenantPlan } from '../../services/plans';
import { chat, estimateCostMicros, ToolDef } from './providers';
import { pageDocSchema } from '../pages/routes';

/**
 * AI creator assistant.
 *  - Every call is scoped to the X-Tenant workspace and the caller's permissions.
 *  - The model never queries the database directly: it can only call the
 *    read-only tools below, each of which filters by the current tenant.
 *  - Output is always a draft. Nothing is created or sent until the creator
 *    explicitly applies it (POST /apply/*), which is the human approval step.
 *  - Usage is metered in credits (1 credit = US$0.001 of estimated provider cost)
 *    against the plan's monthly allowance.
 */
export const aiRouter = Router();
aiRouter.use(requireAuth, requireTenantStaff, can('ai.use'), aiLimiter);

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

const monthKey = () => new Date().toISOString().slice(0, 7);

async function creditBalance(tenantId: string) {
  // Lazily grant the plan's monthly allowance once per calendar month
  const reason = `monthly_grant:${monthKey()}`;
  const granted = await prisma.aiCreditLedger.findFirst({ where: { tenantId, reason } });
  if (!granted) {
    const { limits } = await tenantPlan(tenantId);
    const allowance = limits.aiCreditsMonthly ?? 0;
    if (allowance > 0) {
      // Unused credits from previous months expire
      const prev = await prisma.aiCreditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
      const carry = prev._sum.delta ?? 0;
      await prisma.aiCreditLedger.createMany({
        data: [
          ...(carry > 0 ? [{ tenantId, delta: -carry, reason: `expire:${monthKey()}` }] : []),
          { tenantId, delta: allowance, reason },
        ],
      });
    }
  }
  const agg = await prisma.aiCreditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

async function metered<T extends { inputTokens: number; outputTokens: number; model: string; provider: string }>(tenantId: string, userId: string, feature: string, run: () => Promise<T>) {
  if ((await creditBalance(tenantId)) <= 0) throw forbidden('You have used all AI credits for this month. Upgrade your plan or wait for next month’s allowance.');
  const result = await run();
  const costMicros = estimateCostMicros(result.model, result.inputTokens, result.outputTokens);
  const credits = Math.max(1, Math.ceil(costMicros / 1000));
  await prisma.$transaction(async (tx) => {
    const usage = await tx.aiUsage.create({ data: { tenantId, userId, feature, provider: result.provider, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costMicros, credits } });
    await tx.aiCreditLedger.create({ data: { tenantId, delta: -credits, reason: `usage:${feature}`, usageId: usage.id } });
  });
  return { ...result, credits };
}

aiRouter.get('/usage', async (req, res) => {
  const tenantId = req.tenant!.id;
  const balance = await creditBalance(tenantId);
  const since = new Date(`${monthKey()}-01T00:00:00Z`);
  const [byFeature, recent] = await Promise.all([
    prisma.aiUsage.groupBy({ by: ['feature'], where: { tenantId, createdAt: { gte: since } }, _sum: { credits: true }, _count: true }),
    prisma.aiUsage.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20, select: { feature: true, credits: true, model: true, createdAt: true } }),
  ]);
  const { limits } = await tenantPlan(tenantId);
  res.json({ balance, monthlyAllowance: limits.aiCreditsMonthly ?? 0, byFeature: byFeature.map((f) => ({ feature: f.feature, credits: f._sum.credits ?? 0, requests: f._count })), recent });
});

// ---------------------------------------------------------------------------
// Draft generators (structured output, validated before returning)
// ---------------------------------------------------------------------------

const outlineSchema = z.object({
  title: z.string().max(150),
  subtitle: z.string().max(250).optional(),
  description: z.string().max(5000),
  modules: z.array(z.object({ title: z.string().max(150), lessons: z.array(z.object({ title: z.string().max(200), summary: z.string().max(2000) })).min(1).max(20) })).min(1).max(20),
});

const quizSchema = z.object({
  questions: z.array(z.object({ prompt: z.string().max(1000), options: z.array(z.string().max(300)).min(2).max(6), correct: z.number().int().min(0) })).min(1).max(20),
});

const copySchema = z.object({ title: z.string().max(200).optional(), subject: z.string().max(200).optional(), body: z.string().max(20000) });

const KINDS = {
  course_outline: { schema: outlineSchema, ask: 'a complete course outline with modules and lessons. JSON shape: {"title","subtitle","description","modules":[{"title","lessons":[{"title","summary"}]}]}' },
  quiz: { schema: quizSchema, ask: 'a multiple-choice quiz. JSON shape: {"questions":[{"prompt","options":[...],"correct":<index of the right option>}]}' },
  email: { schema: copySchema, ask: 'a marketing email in plain text. You may use the merge fields {{first_name}} and {{store_url}}. JSON shape: {"subject","body"}' },
  whatsapp_template: { schema: copySchema, ask: 'a WhatsApp message template under 1024 characters, suitable for Meta template approval, using {{1}} for the first name. JSON shape: {"title","body"}' },
  product_description: { schema: copySchema, ask: 'a persuasive product description for a storefront, plain text with short paragraphs and bullet lines starting with "• ". JSON shape: {"title","body"}' },
  lesson_draft: { schema: copySchema, ask: 'a lesson script in plain text with headings on their own lines. JSON shape: {"title","body"}' },
  launch_plan: { schema: copySchema, ask: 'a dated launch plan (workshop or course launch) as a plain-text checklist. JSON shape: {"title","body"}' },
  pricing_ideas: { schema: copySchema, ask: 'pricing and marketing experiment ideas for the Indian creator market with reasoning, plain text. JSON shape: {"title","body"}' },
  landing_page: {
    schema: pageDocSchema,
    ask:
      'a landing page as a JSON document {"blocks":[...],"theme":{"primaryColor","background","text","font","radius"}}. Allowed block types and fields: ' +
      'hero{id,heading,subheading,eyebrow,primary:{label,href},secondary:{label,href}}, features{id,heading,subheading,columns,items:[{icon,title,body}]}, text{id,heading,body}, ' +
      'testimonials{id,heading,items:[{quote,name,role}]}, faq{id,heading,items:[{q,a}]}, pricing{id,heading,source:"manual",items:[{name,price,period,features:[],cta:{label,href},highlighted}]}, ' +
      'cta{id,heading,body,button:{label,href}}, stats{id,items:[{value,label}]}, products{id,heading,productIds:[]}, lead_form{id,heading,body,buttonLabel,collectPhone}. ' +
      'Every block needs a short unique "id". hrefs must start with "/" or "https://". Colours are #rrggbb. font is one of Inter, Poppins, Lora, Playfair Display, DM Sans, Space Grotesk. radius is none|sm|md|lg|full.',
  },
} as const;

type Kind = keyof typeof KINDS;

function extractJson(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON');
  return JSON.parse(text.slice(start, end + 1));
}

aiRouter.post('/generate', async (req, res) => {
  const input = body(req, z.object({ kind: z.enum(Object.keys(KINDS) as [Kind, ...Kind[]]), prompt: z.string().trim().min(5).max(4000) }));
  const tenant = req.tenant!;
  const spec = KINDS[input.kind];
  const system =
    `You help the creator "${tenant.name}"${tenant.tagline ? ` (${tenant.tagline})` : ''} run their online education business. ` +
    `Write in clear, warm, practical English for an Indian and international audience. Do not invent testimonials, statistics or credentials – leave placeholders like [add a student quote] instead. ` +
    `Respond with only a JSON object, no prose.`;
  const out = await metered(tenant.id, req.user!.id, `generate:${input.kind}`, async () => {
    let r = await chat(system, [{ role: 'user', content: `Create ${spec.ask}\n\nCreator's request:\n${input.prompt}` }]);
    let parsed = r.refused ? null : spec.schema.safeParse((() => { try { return extractJson(r.text); } catch { return null; } })());
    // One repair attempt when the output does not match the schema
    if (!r.refused && !parsed?.success) {
      const retry = await chat(system, [
        { role: 'user', content: `Create ${spec.ask}\n\nCreator's request:\n${input.prompt}` },
        { role: 'assistant', content: r.text.slice(0, 20000) },
        { role: 'user', content: `That did not match the required JSON shape (${parsed && !parsed.success ? parsed.error.issues[0]?.message : 'invalid JSON'}). Reply with only the corrected JSON object.` },
      ]);
      r = { ...retry, inputTokens: r.inputTokens + retry.inputTokens, outputTokens: r.outputTokens + retry.outputTokens };
      parsed = retry.refused ? null : spec.schema.safeParse((() => { try { return extractJson(retry.text); } catch { return null; } })());
    }
    return { ...r, draft: parsed?.success ? parsed.data : null };
  });
  if (out.refused) throw badRequest('The AI declined this request. Try rephrasing it.');
  if (!out.draft) throw badRequest('The AI response could not be used. Please try again.');
  res.json({ kind: input.kind, draft: out.draft, credits: out.credits });
});

// ---------------------------------------------------------------------------
// Business assistant with read-only, tenant-scoped tools
// ---------------------------------------------------------------------------

const obj = (properties: Record<string, unknown>, required: string[] = []): ToolDef['parameters'] => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS: ToolDef[] = [
  { name: 'get_sales_summary', description: 'Revenue, paid orders, refunds and top products for the last N days (amounts in minor units, e.g. paise).', parameters: obj({ days: { type: 'integer', minimum: 1, maximum: 365 } }, ['days']) },
  { name: 'get_course_engagement', description: 'Per-course enrollments, completion rate and average progress.', parameters: obj({}) },
  { name: 'get_inactive_learners', description: 'Learners with no lesson activity in the last N days (names and emails, max 50).', parameters: obj({ days: { type: 'integer', minimum: 3, maximum: 180 } }, ['days']) },
  { name: 'list_products', description: 'Published and draft products with prices.', parameters: obj({}) },
  { name: 'get_community_activity', description: 'Posts, comments and active members in the last 30 days.', parameters: obj({}) },
];

function toolExecutor(tenantId: string, perms: Set<string>) {
  return async (name: string, raw: unknown) => {
    const args = (raw ?? {}) as { days?: number };
    switch (name) {
      case 'get_sales_summary': {
        if (!perms.has('orders.read')) return { error: 'No permission to read sales' };
        const days = Math.min(365, Math.max(1, Number(args.days) || 30));
        const since = new Date(Date.now() - days * 86400_000);
        const [paid, refunds, top] = await Promise.all([
          prisma.order.aggregate({ where: { tenantId, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paidAt: { gte: since } }, _sum: { total: true }, _count: true }),
          prisma.refund.aggregate({ where: { tenantId, status: 'PROCESSED', processedAt: { gte: since } }, _sum: { amount: true } }),
          prisma.orderItem.groupBy({ by: ['title'], where: { order: { tenantId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: since } } }, _sum: { total: true }, _count: true, orderBy: { _sum: { total: 'desc' } }, take: 5 }),
        ]);
        return { days, revenue: paid._sum.total ?? 0, paidOrders: paid._count, refunded: refunds._sum.amount ?? 0, topProducts: top.map((t) => ({ title: t.title, revenue: t._sum.total, sales: t._count })) };
      }
      case 'get_course_engagement': {
        if (!perms.has('courses.read')) return { error: 'No permission' };
        const courses = await prisma.course.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, title: true, status: true } });
        const stats = await prisma.enrollment.groupBy({ by: ['courseId', 'status'], where: { tenantId }, _count: true, _avg: { progressPct: true } });
        return courses.map((c) => {
          const s = stats.filter((x) => x.courseId === c.id);
          const total = s.reduce((a, x) => a + x._count, 0);
          return { title: c.title, status: c.status, enrollments: total, completed: s.find((x) => x.status === 'COMPLETED')?._count ?? 0, avgProgressPct: Math.round(s.reduce((a, x) => a + (x._avg.progressPct ?? 0) * x._count, 0) / (total || 1)) };
        });
      }
      case 'get_inactive_learners': {
        if (!perms.has('customers.read')) return { error: 'No permission' };
        const days = Math.min(180, Math.max(3, Number(args.days) || 14));
        const cutoff = new Date(Date.now() - days * 86400_000);
        const idle = await prisma.enrollment.findMany({
          where: { tenantId, status: 'ACTIVE', enrolledAt: { lte: cutoff }, progress: { none: { updatedAt: { gt: cutoff } } } },
          include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } },
          take: 50,
        });
        return idle.map((e) => ({ name: e.user.name, email: e.user.email, course: e.course.title, progressPct: e.progressPct }));
      }
      case 'list_products': {
        if (!perms.has('products.read')) return { error: 'No permission' };
        return prisma.product.findMany({ where: { tenantId, deletedAt: null }, select: { title: true, type: true, status: true, prices: { where: { active: true }, select: { amount: true, currency: true, type: true, interval: true } } } });
      }
      case 'get_community_activity': {
        const since = new Date(Date.now() - 30 * 86400_000);
        const [posts, comments, authors] = await Promise.all([
          prisma.post.count({ where: { tenantId, createdAt: { gte: since } } }),
          prisma.comment.count({ where: { tenantId, createdAt: { gte: since } } }),
          prisma.post.findMany({ where: { tenantId, createdAt: { gte: since } }, distinct: ['authorId'], select: { authorId: true } }),
        ]);
        return { posts, comments, activeMembers: authors.length };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  };
}

aiRouter.post('/chat', async (req, res) => {
  const input = body(req, z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(30) }));
  if (input.messages[input.messages.length - 1].role !== 'user') throw badRequest('The last message must be from you');
  const tenant = req.tenant!;
  const system =
    `You are the business assistant for "${tenant.name}", an online creator business on a course/community platform. Today is ${new Date().toISOString().slice(0, 10)}. Currency: ${tenant.currency}; amounts from tools are in minor units (divide by 100). ` +
    `Use the tools to answer questions with the creator's real data – never guess numbers. If data is missing, say so. ` +
    `You cannot change anything or send messages yourself: suggest concrete next steps (e.g. a re-engagement email) that the creator can review and send from the dashboard. Keep answers concise.`;
  const out = await metered(tenant.id, req.user!.id, 'assistant', () => chat(system, input.messages, TOOLS, toolExecutor(tenant.id, req.permissions as Set<string>)));
  if (out.refused) throw badRequest('The AI declined this request. Try rephrasing it.');
  res.json({ reply: out.text, toolsUsed: out.toolCalls.map((t) => t.name), credits: out.credits });
});

// ---------------------------------------------------------------------------
// Apply drafts (explicit human approval → creates DRAFT content only)
// ---------------------------------------------------------------------------

aiRouter.post('/apply/course-outline', can('courses.write'), async (req, res) => {
  const outline = body(req, outlineSchema);
  const tenantId = req.tenant!.id;
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.create({
      data: { tenantId, title: outline.title, subtitle: outline.subtitle, description: outline.description, slug: `${slugify(outline.title)}-${Date.now().toString(36)}`, createdById: req.user!.id, status: 'DRAFT' },
    });
    for (const [mi, m] of outline.modules.entries()) {
      const mod = await tx.courseModule.create({ data: { tenantId, courseId: c.id, title: m.title, position: mi } });
      await tx.lesson.createMany({ data: m.lessons.map((l, li) => ({ tenantId, courseId: c.id, moduleId: mod.id, title: l.title, body: l.summary, type: 'TEXT' as const, position: li, published: false })) });
    }
    return c;
  });
  await audit({ action: 'ai.apply.course_outline', entityType: 'course', entityId: course.id, req });
  res.status(201).json({ course });
});

aiRouter.post('/apply/landing-page', can('pages.write'), async (req, res) => {
  const input = body(req, z.object({ title: z.string().trim().min(1).max(120), doc: pageDocSchema }));
  blocksSchema.parse(input.doc.blocks);
  const page = await prisma.landingPage.create({ data: { tenantId: req.tenant!.id, title: input.title, slug: `${slugify(input.title)}-${Date.now().toString(36)}`, draft: input.doc } });
  await audit({ action: 'ai.apply.landing_page', entityType: 'page', entityId: page.id, req });
  res.status(201).json({ page });
});
