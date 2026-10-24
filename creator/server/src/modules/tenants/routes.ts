import { Router } from 'express';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { body, email, hexColor, safeUrl, slug } from '../../lib/validate';
import { PERMISSIONS, resolvePermissions } from '../../lib/permissions';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { assertWithinLimit, tenantPlan } from '../../services/plans';
import { sendEmail } from '../../services/email';
import { env } from '../../config/env';

export const tenantRouter = Router();

const RESERVED = new Set(['www', 'app', 'api', 'admin', 'static', 'assets', 'mail', 'support', 'help', 'login', 'signup', 'learn', 'blog', 'status']);

tenantRouter.get('/slug-available/:slug', requireAuth, async (req, res) => {
  const s = String(req.params.slug).toLowerCase();
  const valid = slug.safeParse(s).success && !RESERVED.has(s);
  const taken = valid ? !!(await prisma.tenant.findUnique({ where: { slug: s } })) : true;
  res.json({ slug: s, available: valid && !taken });
});

/** Onboarding: create a workspace. The creator becomes its OWNER on the default plan. */
tenantRouter.post('/', requireAuth, async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(80),
      slug,
      tagline: z.string().trim().max(160).optional(),
      primaryColor: hexColor.optional(),
      currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
    }),
  );
  if (!req.user!.emailVerifiedAt) throw forbidden('Verify your email address before creating a workspace');
  if (RESERVED.has(input.slug)) throw badRequest('This address is reserved, please choose another');
  const owned = await prisma.tenant.count({ where: { ownerId: req.user!.id, deletedAt: null } });
  if (owned >= 5) throw forbidden('You can own up to 5 workspaces');

  const plan = await prisma.subscriptionPlan.findFirst({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }] });
  try {
    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          tagline: input.tagline,
          primaryColor: input.primaryColor ?? '#6d28d9',
          currency: input.currency,
          country: input.currency === 'INR' ? 'IN' : 'US',
          ownerId: req.user!.id,
          supportEmail: req.user!.email,
        },
      });
      await tx.membership.create({ data: { tenantId: t.id, userId: req.user!.id, roles: ['OWNER'] } });
      if (plan) await tx.tenantSubscription.create({ data: { tenantId: t.id, planId: plan.id, status: 'ACTIVE' } });
      await audit({ action: 'tenant.create', tenantId: t.id, entityType: 'tenant', entityId: t.id, req }, tx);
      return t;
    });
    res.status(201).json({ workspace: tenant });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('This address is already taken');
    throw e;
  }
});

// ---- Everything below is scoped to the X-Tenant workspace ----

tenantRouter.get('/current', requireAuth, requireTenantStaff, async (req, res) => {
  const { plan, limits, platformFeeBps } = await tenantPlan(req.tenant!.id);
  res.json({
    workspace: req.tenant,
    roles: req.membership?.roles ?? [],
    permissions: [...(req.permissions ?? [])],
    supportSession: !req.membership,
    plan: plan ? { key: plan.key, name: plan.name, limits, platformFeeBps } : null,
  });
});

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160).nullable(),
  about: z.string().trim().max(5000).nullable(),
  logoUrl: safeUrl.nullable(),
  faviconUrl: safeUrl.nullable(),
  socialImageUrl: safeUrl.nullable(),
  primaryColor: hexColor,
  accentColor: hexColor,
  fontFamily: z.enum(['Inter', 'Poppins', 'Lora', 'Playfair Display', 'DM Sans', 'Space Grotesk']),
  supportEmail: email.nullable(),
  timezone: z.string().max(60),
  legalName: z.string().trim().max(150).nullable(),
  address: z.string().trim().max(500).nullable(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
    .nullable(),
  gstStateCode: z.string().regex(/^\d{2}$/).nullable(),
  taxRateBps: z.number().int().min(0).max(5000),
  pricesIncludeTax: z.boolean(),
});

tenantRouter.patch('/current', requireAuth, requireTenantStaff, can('workspace.manage'), async (req, res) => {
  const input = body(req, settingsSchema.partial());
  if (input.gstin && !input.gstStateCode) input.gstStateCode = input.gstin.slice(0, 2);
  const tenant = await prisma.tenant.update({ where: { id: req.tenant!.id }, data: input });
  await audit({ action: 'tenant.update', entityType: 'tenant', entityId: tenant.id, metadata: { fields: Object.keys(input) }, req });
  res.json({ workspace: tenant });
});

// ---- Team ----

tenantRouter.get('/current/team', requireAuth, requireTenantStaff, can('team.manage'), async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { tenantId: req.tenant!.id, roles: { hasSome: ['OWNER', 'ADMIN', 'TEAM_MEMBER', 'INSTRUCTOR', 'MODERATOR'] } },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    members: members.map((m) => ({
      id: m.id,
      user: m.user,
      roles: m.roles,
      permissions: m.permissions,
      effectivePermissions: [...resolvePermissions(m.roles, m.permissions)],
      status: m.status,
    })),
    availablePermissions: PERMISSIONS,
  });
});

const staffRole = z.enum(['ADMIN', 'TEAM_MEMBER', 'INSTRUCTOR', 'MODERATOR']);

tenantRouter.post('/current/team', requireAuth, requireTenantStaff, can('team.manage'), async (req, res) => {
  const input = body(
    req,
    z.object({
      email,
      name: z.string().trim().min(2).max(100).optional(),
      roles: z.array(staffRole).min(1),
      permissions: z.array(z.enum(PERMISSIONS)).default([]),
    }),
  );
  const tenantId = req.tenant!.id;
  const staffCount = await prisma.membership.count({ where: { tenantId, roles: { hasSome: ['ADMIN', 'TEAM_MEMBER', 'INSTRUCTOR', 'MODERATOR'] } } });
  await assertWithinLimit(tenantId, 'maxTeamMembers', staffCount);
  if (input.roles.includes('ADMIN') && !req.membership?.roles.includes('OWNER')) throw forbidden('Only the owner can add admins');

  let user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    // Account without password: the invitee signs in with an email code and can set a password later
    user = await prisma.user.create({ data: { email: input.email, name: input.name ?? input.email.split('@')[0] } });
  }
  const existing = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
  const roles = Array.from(new Set([...(existing?.roles.filter((r) => r === 'STUDENT' || r === 'AFFILIATE') ?? []), ...input.roles]));
  const membership = await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: { tenantId, userId: user.id, roles, permissions: input.permissions },
    update: { roles, permissions: input.permissions, status: 'ACTIVE' },
  });
  await audit({ action: 'team.add', entityType: 'membership', entityId: membership.id, metadata: { email: input.email, roles }, req });
  await sendEmail({
    tenantId,
    to: user.email,
    subject: `You've been added to ${req.tenant!.name}`,
    text: `${req.user!.name} added you to the ${req.tenant!.name} workspace on ${env.BRAND_NAME}.\n\nSign in with this email address at ${env.APP_URL}/login (you can use a one-time email code).`,
  });
  res.status(201).json({ membership });
});

tenantRouter.patch('/current/team/:membershipId', requireAuth, requireTenantStaff, can('team.manage'), async (req, res) => {
  const input = body(req, z.object({ roles: z.array(staffRole).min(1).optional(), permissions: z.array(z.enum(PERMISSIONS)).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() }));
  const m = await prisma.membership.findFirst({ where: { id: String(req.params.membershipId), tenantId: req.tenant!.id } });
  if (!m) throw notFound('Member not found');
  if (m.roles.includes('OWNER')) throw forbidden('The owner cannot be changed here');
  if ((input.roles?.includes('ADMIN') || m.roles.includes('ADMIN')) && !req.membership?.roles.includes('OWNER')) throw forbidden('Only the owner can change admins');
  const keep = m.roles.filter((r) => r === 'STUDENT' || r === 'AFFILIATE');
  const updated = await prisma.membership.update({
    where: { id: m.id },
    data: { roles: input.roles ? Array.from(new Set([...keep, ...input.roles])) : undefined, permissions: input.permissions, status: input.status },
  });
  await audit({ action: 'team.update', entityType: 'membership', entityId: m.id, metadata: input, req });
  res.json({ membership: updated });
});

tenantRouter.delete('/current/team/:membershipId', requireAuth, requireTenantStaff, can('team.manage'), async (req, res) => {
  const m = await prisma.membership.findFirst({ where: { id: String(req.params.membershipId), tenantId: req.tenant!.id } });
  if (!m) throw notFound('Member not found');
  if (m.roles.includes('OWNER')) throw forbidden('The owner cannot be removed');
  if (m.roles.includes('ADMIN') && !req.membership?.roles.includes('OWNER')) throw forbidden('Only the owner can remove admins');
  const keep = m.roles.filter((r) => r === 'STUDENT' || r === 'AFFILIATE');
  if (keep.length) await prisma.membership.update({ where: { id: m.id }, data: { roles: keep, permissions: [] } });
  else await prisma.membership.delete({ where: { id: m.id } });
  await audit({ action: 'team.remove', entityType: 'membership', entityId: m.id, req });
  res.json({ ok: true });
});

// ---- Support access (owner grants time-boxed, read-only access to platform support) ----

tenantRouter.get('/current/support-access', requireAuth, requireTenantStaff, can('workspace.manage'), async (req, res) => {
  const grants = await prisma.supportAccessGrant.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' }, take: 20 });
  res.json({ grants });
});

tenantRouter.post('/current/support-access', requireAuth, requireTenantStaff, async (req, res) => {
  if (!req.membership?.roles.includes('OWNER')) throw forbidden('Only the owner can grant support access');
  const input = body(req, z.object({ hours: z.number().int().min(1).max(72), reason: z.string().trim().max(300).optional() }));
  const grant = await prisma.supportAccessGrant.create({
    data: { tenantId: req.tenant!.id, grantedById: req.user!.id, reason: input.reason, expiresAt: new Date(Date.now() + input.hours * 3600_000) },
  });
  await audit({ action: 'support_access.grant', entityType: 'support_access', entityId: grant.id, metadata: input, req });
  res.status(201).json({ grant });
});

tenantRouter.delete('/current/support-access/:id', requireAuth, requireTenantStaff, can('workspace.manage'), async (req, res) => {
  await prisma.supportAccessGrant.updateMany({ where: { id: String(req.params.id), tenantId: req.tenant!.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ action: 'support_access.revoke', entityType: 'support_access', entityId: String(req.params.id), req });
  res.json({ ok: true });
});

tenantRouter.get('/current/audit-logs', requireAuth, requireTenantStaff, can('audit.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const where = { tenantId: req.tenant!.id };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, total, page, pageSize: 50 });
});
