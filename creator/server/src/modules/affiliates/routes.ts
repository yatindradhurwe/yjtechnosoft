import { Router } from 'express';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { sha256 } from '../../lib/crypto';
import { body, parse } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff, resolvePublicTenant } from '../../middleware/tenant';
import { publicWriteLimiter } from '../../middleware/rateLimit';
import { audit } from '../../services/audit';
import { assertFeature } from '../../services/plans';
import { env } from '../../config/env';
import { ATTRIBUTION_WINDOW_DAYS } from './attribution';

const id = z.string().uuid();

// ---------------------------------------------------------------------------
// Creator management (X-Tenant)
// ---------------------------------------------------------------------------

export const affiliatesAdminRouter = Router();
affiliatesAdminRouter.use(requireAuth, requireTenantStaff, can('affiliates.manage'));

affiliatesAdminRouter.get('/', async (req, res) => {
  const tenantId = req.tenant!.id;
  const affiliates = await prisma.affiliate.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  const [users, clicks, commissions] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: affiliates.map((a) => a.userId) } }, select: { id: true, name: true, email: true } }),
    prisma.referralClick.groupBy({ by: ['affiliateId'], where: { tenantId }, _count: true }),
    prisma.commission.groupBy({ by: ['affiliateId', 'status'], where: { tenantId }, _sum: { amount: true }, _count: true }),
  ]);
  const rules = await prisma.affiliateProductRule.findMany({ where: { tenantId } });
  res.json({
    affiliates: affiliates.map((a) => {
      const c = commissions.filter((x) => x.affiliateId === a.id);
      return {
        ...a,
        user: users.find((u) => u.id === a.userId),
        clicks: clicks.find((x) => x.affiliateId === a.id)?._count ?? 0,
        conversions: c.filter((x) => x.status !== 'REVERSED' && x.status !== 'REJECTED').reduce((s, x) => s + x._count, 0),
        earned: Object.fromEntries(c.map((x) => [x.status.toLowerCase(), x._sum.amount ?? 0])),
      };
    }),
    productRules: rules,
    attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
  });
});

affiliatesAdminRouter.patch('/:affiliateId', async (req, res) => {
  const a = await prisma.affiliate.findFirst({ where: { id: parse(id, req.params.affiliateId), tenantId: req.tenant!.id } });
  if (!a) throw notFound('Affiliate not found');
  const input = body(req, z.object({ status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']).optional(), commissionBps: z.number().int().min(0).max(9000).optional() }));
  if (input.status === 'APPROVED') await assertFeature(req.tenant!.id, 'affiliates');
  const updated = await prisma.affiliate.update({ where: { id: a.id }, data: input });
  await audit({ action: 'affiliate.update', entityType: 'affiliate', entityId: a.id, metadata: input, req });
  res.json({ affiliate: updated });
});

affiliatesAdminRouter.put('/rules/:productId', async (req, res) => {
  const productId = parse(id, req.params.productId);
  if (!(await prisma.product.findFirst({ where: { id: productId, tenantId: req.tenant!.id } }))) throw notFound('Product not found');
  const input = body(req, z.object({ commissionBps: z.number().int().min(0).max(9000).nullable() }));
  const key = { tenantId_productId: { tenantId: req.tenant!.id, productId } };
  if (input.commissionBps === null) await prisma.affiliateProductRule.deleteMany({ where: { tenantId: req.tenant!.id, productId } });
  else await prisma.affiliateProductRule.upsert({ where: key, create: { tenantId: req.tenant!.id, productId, commissionBps: input.commissionBps }, update: { commissionBps: input.commissionBps } });
  res.json({ ok: true });
});

affiliatesAdminRouter.get('/commissions', async (req, res) => {
  const status = parse(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'REVERSED']).optional(), req.query.status);
  const items = await prisma.commission.findMany({ where: { tenantId: req.tenant!.id, status }, orderBy: { createdAt: 'desc' }, take: 500, include: { affiliate: true } });
  const orders = await prisma.order.findMany({ where: { id: { in: items.map((i) => i.orderId) } }, select: { id: true, number: true, total: true, status: true, buyerEmail: true } });
  res.json({ items: items.map((i) => ({ ...i, order: orders.find((o) => o.id === i.orderId) })) });
});

/** PENDING → APPROVED → PAID, or REJECTED. Commissions on refunded orders cannot be approved. */
affiliatesAdminRouter.patch('/commissions/:commissionId', async (req, res) => {
  const input = body(req, z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PAID']) }));
  const c = await prisma.commission.findFirst({ where: { id: parse(id, req.params.commissionId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Commission not found');
  const from = { APPROVED: ['PENDING'], REJECTED: ['PENDING', 'APPROVED'], PAID: ['APPROVED'] }[input.status];
  if (!from.includes(c.status)) throw badRequest(`A ${c.status.toLowerCase()} commission cannot be marked ${input.status.toLowerCase()}`);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: c.orderId } });
  if (input.status === 'APPROVED' && order.status === 'REFUNDED') throw badRequest('The order was refunded');
  await prisma.$transaction(async (tx) => {
    await tx.commission.update({ where: { id: c.id }, data: { status: input.status } });
    if (input.status === 'REJECTED') {
      await tx.ledgerEntry.create({ data: { tenantId: c.tenantId, type: 'AFFILIATE_COMMISSION', amount: c.amount, currency: c.currency, orderId: c.orderId, memo: 'Commission rejected' } });
    }
    await audit({ action: `commission.${input.status.toLowerCase()}`, entityType: 'commission', entityId: c.id, metadata: { amount: c.amount }, req }, tx);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Public: join program, click tracking (/api/store/:tenantSlug/affiliates)
// ---------------------------------------------------------------------------

export const affiliatesPublicRouter = Router({ mergeParams: true });
affiliatesPublicRouter.use(resolvePublicTenant);

/**
 * Record a referral click. Fraud controls: unknown/unapproved codes ignored, at
 * most one click per visitor per affiliate per hour, and per-IP rate limiting.
 */
affiliatesPublicRouter.post('/click', publicWriteLimiter, async (req, res) => {
  const input = body(req, z.object({ code: z.string().trim().max(40), visitorId: z.string().min(8).max(64), path: z.string().max(300).optional() }));
  const a = await prisma.affiliate.findUnique({ where: { tenantId_code: { tenantId: req.tenant!.id, code: input.code.toUpperCase() } } });
  if (!a || a.status !== 'APPROVED') return res.json({ tracked: false });
  const recent = await prisma.referralClick.findFirst({ where: { affiliateId: a.id, visitorId: input.visitorId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (!recent) await prisma.referralClick.create({ data: { tenantId: a.tenantId, affiliateId: a.id, visitorId: input.visitorId, landingPath: input.path } });
  res.json({ tracked: true });
});

affiliatesPublicRouter.post('/join', requireAuth, async (req, res) => {
  const tenantId = req.tenant!.id;
  const base = req.user!.name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'REF';
  const code = `${base}${sha256(`${tenantId}:${req.user!.id}`).slice(0, 4).toUpperCase()}`;
  try {
    const a = await prisma.affiliate.create({ data: { tenantId, userId: req.user!.id, code } });
    const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: req.user!.id } } });
    if (!m) await prisma.membership.create({ data: { tenantId, userId: req.user!.id, roles: ['AFFILIATE'] } });
    else if (!m.roles.includes('AFFILIATE')) await prisma.membership.update({ where: { id: m.id }, data: { roles: [...m.roles, 'AFFILIATE'] } });
    res.status(201).json({ affiliate: a });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('You have already applied to this affiliate program');
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Affiliate's own dashboard (/api/affiliate)
// ---------------------------------------------------------------------------

export const affiliateSelfRouter = Router();
affiliateSelfRouter.use(requireAuth);

affiliateSelfRouter.get('/', async (req, res) => {
  const programs = await prisma.affiliate.findMany({ where: { userId: req.user!.id } });
  const tenants = await prisma.tenant.findMany({ where: { id: { in: programs.map((p) => p.tenantId) } }, select: { id: true, name: true, slug: true } });
  const out = await Promise.all(
    programs.map(async (p) => {
      const [clicks, commissions] = await Promise.all([
        prisma.referralClick.count({ where: { affiliateId: p.id } }),
        prisma.commission.findMany({ where: { affiliateId: p.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      ]);
      const tenant = tenants.find((t) => t.id === p.tenantId)!;
      const sum = (s: string) => commissions.filter((c) => c.status === s).reduce((a, c) => a + c.amount, 0);
      return {
        id: p.id,
        status: p.status,
        code: p.code,
        commissionBps: p.commissionBps,
        tenant,
        link: `${env.APP_URL}/s/${tenant.slug}?ref=${p.code}`,
        clicks,
        conversions: commissions.filter((c) => !['REVERSED', 'REJECTED'].includes(c.status)).length,
        pending: sum('PENDING'),
        approved: sum('APPROVED'),
        paid: sum('PAID'),
        // Buyer identities are not shared with affiliates
        commissions: commissions.map((c) => ({ id: c.id, amount: c.amount, currency: c.currency, status: c.status, createdAt: c.createdAt })),
      };
    }),
  );
  res.json({ programs: out });
});
