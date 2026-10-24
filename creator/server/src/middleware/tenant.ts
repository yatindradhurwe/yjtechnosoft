import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { Permission, resolvePermissions, STAFF_ROLES } from '../lib/permissions';
import { env } from '../config/env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dashboard requests identify the workspace with the `X-Tenant` header (id or slug).
 * The caller must be an active staff member of that workspace, or a support user
 * holding an unexpired support-access grant from the workspace owner.
 */
export async function requireTenantStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  const ref = String(req.get('x-tenant') ?? '').trim();
  if (!ref) throw notFound('Workspace not specified');
  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null, ...(UUID_RE.test(ref) ? { id: ref } : { slug: ref.toLowerCase() }) },
  });
  if (!tenant) throw notFound('Workspace not found');

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: req.user.id } },
  });

  if (membership && membership.status === 'ACTIVE' && membership.roles.some((r) => STAFF_ROLES.includes(r))) {
    if (tenant.status === 'SUSPENDED') throw forbidden(`This workspace is suspended${tenant.suspendedReason ? `: ${tenant.suspendedReason}` : ''}`);
    req.tenant = tenant;
    req.membership = membership;
    req.permissions = resolvePermissions(membership.roles, membership.permissions);
    return next();
  }

  // Restricted support access – read-only, explicitly granted by the workspace owner, time-boxed.
  if (req.user.platformRole !== 'USER') {
    const grant = await prisma.supportAccessGrant.findFirst({
      where: { tenantId: tenant.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (grant) {
      req.tenant = tenant;
      req.membership = null;
      req.permissions = new Set<Permission>(['courses.read', 'products.read', 'orders.read', 'customers.read', 'analytics.read', 'audit.read']);
      return next();
    }
  }
  throw forbidden('You are not a member of this workspace');
}

/** Requires every listed permission in the current workspace */
export function can(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.permissions) throw forbidden();
    for (const p of perms) if (!req.permissions.has(p)) throw forbidden(`Missing permission: ${p}`);
    next();
  };
}

/**
 * Public storefront resolution: custom domain → platform subdomain → :tenantSlug param.
 * Suspended or deleted workspaces are not served.
 */
export async function resolvePublicTenant(req: Request, _res: Response, next: NextFunction) {
  const host = (req.get('x-forwarded-host') ?? req.hostname ?? '').toLowerCase().split(':')[0];
  let tenant = null;
  const slugParam = typeof req.params.tenantSlug === 'string' ? req.params.tenantSlug.toLowerCase() : undefined;
  if (slugParam) {
    tenant = await prisma.tenant.findFirst({ where: { slug: slugParam, deletedAt: null } });
  } else if (host) {
    const domain = await prisma.customDomain.findFirst({ where: { hostname: host, status: 'VERIFIED' }, include: { tenant: true } });
    if (domain) tenant = domain.tenant;
    else if (env.PLATFORM_DOMAIN && host.endsWith(`.${env.PLATFORM_DOMAIN}`)) {
      const sub = host.slice(0, -(env.PLATFORM_DOMAIN.length + 1));
      tenant = await prisma.tenant.findFirst({ where: { slug: sub, deletedAt: null } });
    }
  }
  if (!tenant || tenant.deletedAt || tenant.status !== 'ACTIVE') throw notFound('Store not found');
  req.tenant = tenant;
  next();
}
