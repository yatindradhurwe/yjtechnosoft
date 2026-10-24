import { Router } from 'express';
import { z } from 'zod';
import { IntegrationKind, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { body, pageArgs, pagination, parse, query, slug } from '../../lib/validate';
import { blocksSchema, seoSchema } from '../../lib/blocks';
import { requireAuth, requirePlatformRole } from '../../middleware/auth';
import { audit } from '../../services/audit';
import { describeIntegration, saveIntegration, SECRET_FIELDS } from '../../services/integrations';
import { revokeAllSessions } from '../auth/service';

/**
 * Super Admin API. SUPPORT staff get read access to platform-level lists;
 * every write requires SUPER_ADMIN and is audited.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requirePlatformRole('SUPPORT'));

const superOnly = requirePlatformRole('SUPER_ADMIN');

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

adminRouter.get('/overview', async (_req, res) => {
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const [tenants, activeTenants, users, newUsers30, paid, paid30, failedWebhooks, failedJobs, openTickets, byPlan] = await Promise.all([
    prisma.tenant.count({ where: { deletedAt: null } }),
    prisma.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: since30 } } }),
    prisma.payment.aggregate({ where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true, platformFee: true, refundedAmount: true } }),
    prisma.payment.aggregate({ where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, capturedAt: { gte: since30 } }, _sum: { amount: true, platformFee: true } }),
    prisma.webhookEvent.count({ where: { status: 'FAILED' } }),
    prisma.backgroundJob.count({ where: { status: 'FAILED' } }),
    prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
    prisma.tenantSubscription.groupBy({ by: ['planId'], where: { status: { in: ['ACTIVE', 'TRIALING'] } }, _count: true }),
  ]);
  const plans = await prisma.subscriptionPlan.findMany({ select: { id: true, name: true } });
  const recentTenants = await prisma.tenant.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, name: true, slug: true, status: true, createdAt: true } });
  res.json({
    tenants,
    activeTenants,
    users,
    newUsers30,
    // GMV is reported in minor units; mixed currencies are summed per currency in /admin/payments
    gmv: paid._sum.amount ?? 0,
    gmv30: paid30._sum.amount ?? 0,
    platformFees: paid._sum.platformFee ?? 0,
    platformFees30: paid30._sum.platformFee ?? 0,
    refunded: paid._sum.refundedAmount ?? 0,
    failedWebhooks,
    failedJobs,
    openTickets,
    tenantsByPlan: byPlan.map((b) => ({ plan: plans.find((p) => p.id === b.planId)?.name ?? 'Unknown', count: b._count })),
    recentTenants,
  });
});

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

adminRouter.get('/tenants', async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional() }));
  const where: Prisma.TenantWhereInput = {
    deletedAt: null,
    status: p.status,
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: 'insensitive' } }, { slug: { contains: p.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(p),
      include: {
        owner: { select: { id: true, name: true, email: true } },
        subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, include: { plan: { select: { name: true, key: true } } }, take: 1 },
        _count: { select: { courses: true, products: true, orders: true, memberships: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

adminRouter.get('/tenants/:id', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: parse(z.string().uuid(), req.params.id) },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
      customDomains: true,
      _count: { select: { courses: true, products: true, orders: true, memberships: true, mediaAssets: true } },
    },
  });
  if (!tenant) throw notFound();
  const [revenue, storage] = await Promise.all([
    prisma.payment.aggregate({ where: { tenantId: tenant.id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } }, _sum: { amount: true, platformFee: true } }),
    prisma.mediaAsset.aggregate({ where: { tenantId: tenant.id, deletedAt: null }, _sum: { sizeBytes: true } }),
  ]);
  res.json({ tenant, revenue: revenue._sum.amount ?? 0, platformFees: revenue._sum.platformFee ?? 0, storageBytes: storage._sum.sizeBytes ?? 0 });
});

adminRouter.patch('/tenants/:id/status', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const input = body(req, z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().max(300).optional() }));
  if (input.status === 'SUSPENDED' && !input.reason) throw badRequest('A reason is required to suspend a workspace');
  const tenant = await prisma.tenant.update({ where: { id }, data: { status: input.status, suspendedReason: input.status === 'SUSPENDED' ? input.reason : null } });
  await audit({ action: `admin.tenant.${input.status === 'SUSPENDED' ? 'suspend' : 'activate'}`, tenantId: id, entityType: 'tenant', entityId: id, metadata: input, req });
  res.json({ tenant });
});

adminRouter.patch('/tenants/:id/plan', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const input = body(req, z.object({ planId: z.string().uuid() }));
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
  if (!plan) throw notFound('Plan not found');
  await prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.updateMany({ where: { tenantId: id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, data: { status: 'CANCELED' } });
    await tx.tenantSubscription.create({ data: { tenantId: id, planId: plan.id, status: 'ACTIVE' } });
    await audit({ action: 'admin.tenant.plan_change', tenantId: id, entityType: 'tenant', entityId: id, metadata: { plan: plan.key }, req }, tx);
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

adminRouter.get('/users', async (req, res) => {
  const p = query(req, pagination.extend({ role: z.enum(['USER', 'SUPPORT', 'SUPER_ADMIN']).optional() }));
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    platformRole: p.role,
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: 'insensitive' } }, { email: { contains: p.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(p),
      select: { id: true, name: true, email: true, platformRole: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, _count: { select: { memberships: true, orders: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

adminRouter.patch('/users/:id', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const input = body(req, z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), platformRole: z.enum(['USER', 'SUPPORT', 'SUPER_ADMIN']).optional() }));
  if (id === req.user!.id) throw forbidden('You cannot change your own account here');
  const user = await prisma.user.update({ where: { id }, data: input, select: { id: true, email: true, status: true, platformRole: true } });
  if (input.status === 'SUSPENDED') await revokeAllSessions(id);
  await audit({ action: 'admin.user.update', entityType: 'user', entityId: id, metadata: input, req });
  res.json({ user });
});

// ---------------------------------------------------------------------------
// Plans & entitlements
// ---------------------------------------------------------------------------

const planSchema = z.object({
  key: slug,
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  priceMonthly: z.number().int().min(0),
  priceYearly: z.number().int().min(0),
  platformFeeBps: z.number().int().min(0).max(5000),
  limits: z.object({
    maxCourses: z.number().int().min(0).nullable().optional(),
    maxProducts: z.number().int().min(0).nullable().optional(),
    maxTeamMembers: z.number().int().min(0).nullable().optional(),
    storageMb: z.number().int().min(0).nullable().optional(),
    aiCreditsMonthly: z.number().int().min(0).nullable().optional(),
    customDomain: z.boolean().optional(),
    affiliates: z.boolean().optional(),
    automations: z.boolean().optional(),
  }),
  isPublic: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

adminRouter.get('/plans', async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { tenantSubscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] } } } } } } });
  res.json({ plans });
});

adminRouter.post('/plans', superOnly, async (req, res) => {
  const input = body(req, planSchema);
  const plan = await prisma.subscriptionPlan.create({ data: input });
  await audit({ action: 'admin.plan.create', entityType: 'plan', entityId: plan.id, metadata: { key: plan.key }, req });
  res.status(201).json({ plan });
});

adminRouter.put('/plans/:id', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const input = body(req, planSchema);
  const plan = await prisma.subscriptionPlan.update({ where: { id }, data: input });
  await audit({ action: 'admin.plan.update', entityType: 'plan', entityId: id, metadata: input, req });
  res.json({ plan });
});

// ---------------------------------------------------------------------------
// Provider integrations (secrets are write-only)
// ---------------------------------------------------------------------------

adminRouter.get('/integrations', async (_req, res) => {
  const kinds = Object.values(IntegrationKind);
  res.json({ integrations: await Promise.all(kinds.map((k) => describeIntegration('platform', k))), secretFields: SECRET_FIELDS });
});

adminRouter.put('/integrations/:kind', superOnly, async (req, res) => {
  const kind = parse(z.nativeEnum(IntegrationKind), req.params.kind);
  const input = body(
    req,
    z.object({
      enabled: z.boolean(),
      config: z.record(z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
      secrets: z.record(z.string().max(4000)).default({}),
    }),
  );
  for (const key of Object.keys(input.config)) {
    if (SECRET_FIELDS[kind].includes(key)) throw badRequest(`${key} must be sent as a secret`);
  }
  await saveIntegration('platform', kind, input, req.user!.id);
  // Audit which secret fields changed – never their values
  await audit({ action: 'admin.integration.update', entityType: 'integration', entityId: kind, metadata: { enabled: input.enabled, configKeys: Object.keys(input.config), secretsChanged: Object.keys(input.secrets).filter((k) => input.secrets[k]) }, req });
  res.json(await describeIntegration('platform', kind));
});

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

const flagSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.-]{2,60}$/),
  description: z.string().max(300).nullable().optional(),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100),
  tenantAllowlist: z.array(z.string().uuid()).max(500).default([]),
});

adminRouter.get('/feature-flags', async (_req, res) => {
  res.json({ flags: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) });
});

adminRouter.put('/feature-flags/:key', superOnly, async (req, res) => {
  const input = body(req, flagSchema.omit({ key: true }));
  const key = parse(flagSchema.shape.key, req.params.key);
  const flag = await prisma.featureFlag.upsert({ where: { key }, create: { key, ...input }, update: input });
  await audit({ action: 'admin.flag.update', entityType: 'feature_flag', entityId: key, metadata: input, req });
  res.json({ flag });
});

adminRouter.delete('/feature-flags/:key', superOnly, async (req, res) => {
  await prisma.featureFlag.delete({ where: { key: String(req.params.key) } });
  await audit({ action: 'admin.flag.delete', entityType: 'feature_flag', entityId: String(req.params.key), req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Marketing CMS
// ---------------------------------------------------------------------------

const cmsPageSchema = z.object({
  slug: z.string().regex(/^(home|[a-z0-9]+(?:[-/][a-z0-9]+)*)$/, 'Use lowercase letters, numbers, dashes'),
  title: z.string().trim().min(1).max(120),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  sections: blocksSchema,
  seo: seoSchema,
  showInNav: z.boolean().default(false),
  navOrder: z.number().int().default(0),
});

adminRouter.get('/cms/pages', async (_req, res) => {
  res.json({ pages: await prisma.cmsPage.findMany({ orderBy: [{ navOrder: 'asc' }, { slug: 'asc' }], select: { id: true, slug: true, title: true, status: true, showInNav: true, navOrder: true, updatedAt: true } }) });
});

adminRouter.get('/cms/pages/:id', async (req, res) => {
  const page = await prisma.cmsPage.findUnique({ where: { id: parse(z.string().uuid(), req.params.id) } });
  if (!page) throw notFound();
  res.json({ page });
});

adminRouter.post('/cms/pages', superOnly, async (req, res) => {
  const input = body(req, cmsPageSchema);
  const page = await prisma.cmsPage.create({ data: { ...input, updatedById: req.user!.id } });
  await audit({ action: 'admin.cms.create', entityType: 'cms_page', entityId: page.id, metadata: { slug: page.slug }, req });
  res.status(201).json({ page });
});

adminRouter.put('/cms/pages/:id', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const input = body(req, cmsPageSchema);
  const page = await prisma.cmsPage.update({ where: { id }, data: { ...input, updatedById: req.user!.id } });
  await audit({ action: 'admin.cms.update', entityType: 'cms_page', entityId: id, metadata: { slug: page.slug, status: page.status }, req });
  res.json({ page });
});

adminRouter.delete('/cms/pages/:id', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const page = await prisma.cmsPage.delete({ where: { id } });
  await audit({ action: 'admin.cms.delete', entityType: 'cms_page', entityId: id, metadata: { slug: page.slug }, req });
  res.json({ ok: true });
});

export const siteSettingsSchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160).default(''),
  logoUrl: z.string().max(2000).default(''),
  announcement: z.string().max(200).default(''),
  footerText: z.string().max(500).default(''),
  contactEmail: z.string().max(200).default(''),
  footerLinks: z.array(z.object({ label: z.string().max(40), href: z.string().max(300).regex(/^(https?:\/\/|\/)/) })).max(20).default([]),
  social: z.record(z.string().max(300).regex(/^https?:\/\//)).default({}),
  analytics: z.object({ plausibleDomain: z.string().max(200).optional(), gaMeasurementId: z.string().regex(/^G-[A-Z0-9]+$/).optional() }).default({}),
});

adminRouter.get('/cms/settings', async (_req, res) => {
  const row = await prisma.siteSetting.findUnique({ where: { key: 'site' } });
  res.json({ settings: row?.value ?? null });
});

adminRouter.put('/cms/settings', superOnly, async (req, res) => {
  const input = body(req, siteSettingsSchema);
  await prisma.siteSetting.upsert({ where: { key: 'site' }, create: { key: 'site', value: input }, update: { value: input } });
  await audit({ action: 'admin.cms.settings', entityType: 'site_settings', entityId: 'site', req });
  res.json({ settings: input });
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

adminRouter.get('/announcements', async (_req, res) => {
  res.json({ announcements: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) });
});

adminRouter.post('/announcements', superOnly, async (req, res) => {
  const input = body(req, z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(1).max(2000), audience: z.enum(['creators', 'everyone']).default('creators'), endsAt: z.coerce.date().optional() }));
  const a = await prisma.announcement.create({ data: input });
  await audit({ action: 'admin.announcement.create', entityType: 'announcement', entityId: a.id, req });
  res.status(201).json({ announcement: a });
});

adminRouter.delete('/announcements/:id', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  await prisma.announcement.delete({ where: { id } });
  await audit({ action: 'admin.announcement.delete', entityType: 'announcement', entityId: id, req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Audit, webhooks, jobs, system health
// ---------------------------------------------------------------------------

adminRouter.get('/audit-logs', async (req, res) => {
  const p = query(req, pagination.extend({ tenantId: z.string().uuid().optional(), action: z.string().max(80).optional(), actorId: z.string().uuid().optional() }));
  const where: Prisma.AuditLogWhereInput = {
    tenantId: p.tenantId,
    actorId: p.actorId,
    ...(p.action ? { action: { startsWith: p.action } } : {}),
  };
  const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p) }), prisma.auditLog.count({ where })]);
  const actorIds = [...new Set(items.map((i) => i.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true, name: true } });
  res.json({ items: items.map((i) => ({ ...i, actor: actors.find((a) => a.id === i.actorId) ?? null })), total, page: p.page, pageSize: p.pageSize });
});

adminRouter.get('/webhooks', async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED']).optional() }));
  const where = { status: p.status };
  const [items, total] = await Promise.all([
    prisma.webhookEvent.findMany({ where, orderBy: { receivedAt: 'desc' }, ...pageArgs(p), select: { id: true, provider: true, eventId: true, type: true, status: true, error: true, attempts: true, receivedAt: true, processedAt: true } }),
    prisma.webhookEvent.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

adminRouter.get('/jobs', async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']).optional() }));
  const where = { status: p.status };
  const [items, total, counts] = await Promise.all([
    prisma.backgroundJob.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p) }),
    prisma.backgroundJob.count({ where }),
    prisma.backgroundJob.groupBy({ by: ['status'], _count: true }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
});

adminRouter.post('/jobs/:id/retry', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const job = await prisma.backgroundJob.update({ where: { id }, data: { status: 'QUEUED', attempts: 0, runAt: new Date(), lastError: null, lockedAt: null } });
  await audit({ action: 'admin.job.retry', entityType: 'job', entityId: id, req });
  res.json({ job });
});

adminRouter.get('/system', async (_req, res) => {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - started;
  const [dbSize] = await prisma.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
  const storage = await prisma.mediaAsset.aggregate({ where: { deletedAt: null }, _sum: { sizeBytes: true } });
  const ai = await prisma.aiUsage.aggregate({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, _sum: { costMicros: true, inputTokens: true, outputTokens: true } });
  res.json({
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    dbLatencyMs,
    dbSize: dbSize?.size,
    storageBytes: storage._sum.sizeBytes ?? 0,
    ai30: { costMicros: ai._sum.costMicros ?? 0, inputTokens: ai._sum.inputTokens ?? 0, outputTokens: ai._sum.outputTokens ?? 0 },
  });
});

// ---------------------------------------------------------------------------
// Payments, refunds, payouts (platform finance)
// ---------------------------------------------------------------------------

adminRouter.get('/payments', async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(), tenantId: z.string().uuid().optional() }));
  const where = { status: p.status, tenantId: p.tenantId };
  const [items, total, byCurrency] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p), include: { order: { select: { number: true, buyerEmail: true, tenant: { select: { name: true, slug: true } } } } } }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ['currency'], where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true, platformFee: true, gatewayFee: true, refundedAmount: true } }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize, totals: byCurrency.map((b) => ({ currency: b.currency, ...b._sum })) });
});

adminRouter.get('/payouts', async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['REQUESTED', 'APPROVED', 'PAID', 'REJECTED']).optional() }));
  const where = { status: p.status };
  const [items, total] = await Promise.all([prisma.payout.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p) }), prisma.payout.count({ where })]);
  const tenants = await prisma.tenant.findMany({ where: { id: { in: items.map((i) => i.tenantId) } }, select: { id: true, name: true, slug: true } });
  res.json({ items: items.map((i) => ({ ...i, tenant: tenants.find((t) => t.id === i.tenantId) })), total, page: p.page, pageSize: p.pageSize });
});

/** Payout workflow: REQUESTED → APPROVED → PAID (ledger debit), or REJECTED */
adminRouter.patch('/payouts/:id', superOnly, async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const input = body(req, z.object({ status: z.enum(['APPROVED', 'PAID', 'REJECTED']), reference: z.string().trim().max(120).optional(), notes: z.string().trim().max(500).optional() }));
  const allowedFrom = { APPROVED: ['REQUESTED'], PAID: ['APPROVED'], REJECTED: ['REQUESTED', 'APPROVED'] } as const;
  if (input.status === 'PAID' && !input.reference) throw badRequest('Enter the bank transfer reference');
  const payout = await prisma.$transaction(async (tx) => {
    const updated = await tx.payout.updateMany({
      where: { id, status: { in: [...allowedFrom[input.status]] } },
      data: { status: input.status, reference: input.reference, notes: input.notes, reviewedById: req.user!.id },
    });
    if (!updated.count) throw badRequest('This payout cannot move to that status');
    const p = await tx.payout.findUniqueOrThrow({ where: { id } });
    if (input.status === 'PAID') {
      await tx.ledgerEntry.create({ data: { tenantId: p.tenantId, type: 'PAYOUT', amount: -p.amount, currency: p.currency, payoutId: p.id, memo: `Payout ${input.reference}` } });
    }
    await audit({ action: `admin.payout.${input.status.toLowerCase()}`, tenantId: p.tenantId, entityType: 'payout', entityId: id, metadata: input, req }, tx);
    return p;
  });
  res.json({ payout });
});

/** Reconciliation: captured payments vs ledger, per tenant and currency */
adminRouter.get('/reconciliation', async (req, res) => {
  const q = query(req, z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }));
  const rows = await prisma.$queryRaw<{ tenantId: string; currency: string; captured: bigint; refunded: bigint; platform_fee: bigint; ledger_sales: bigint; ledger_refunds: bigint }[]>`
    SELECT p."tenantId", p.currency,
      SUM(p.amount)::bigint AS captured,
      SUM(p."refundedAmount")::bigint AS refunded,
      SUM(p."platformFee")::bigint AS platform_fee,
      COALESCE((SELECT SUM(amount) FROM "LedgerEntry" l WHERE l."tenantId" = p."tenantId" AND l.currency = p.currency AND l.type = 'SALE'
        AND l."createdAt" BETWEEN ${q.from ?? new Date(0)} AND ${q.to ?? new Date()}), 0)::bigint AS ledger_sales,
      COALESCE((SELECT -SUM(amount) FROM "LedgerEntry" l WHERE l."tenantId" = p."tenantId" AND l.currency = p.currency AND l.type = 'REFUND'
        AND l."createdAt" BETWEEN ${q.from ?? new Date(0)} AND ${q.to ?? new Date()}), 0)::bigint AS ledger_refunds
    FROM "Payment" p
    WHERE p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND p.amount > 0
      AND p."capturedAt" BETWEEN ${q.from ?? new Date(0)} AND ${q.to ?? new Date()}
    GROUP BY p."tenantId", p.currency`;
  res.json({
    rows: rows.map((r) => {
      const captured = Number(r.captured);
      const ledgerSales = Number(r.ledger_sales);
      return { tenantId: r.tenantId, currency: r.currency, captured, refunded: Number(r.refunded), platformFee: Number(r.platform_fee), ledgerSales, ledgerRefunds: Number(r.ledger_refunds), matches: captured === ledgerSales };
    }),
  });
});
