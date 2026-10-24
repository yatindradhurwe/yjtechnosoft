import type { TenantRole } from '@prisma/client';

/**
 * Granular workspace permissions. Roles map to default sets; a membership can
 * be granted extra permissions individually (Membership.permissions).
 */
export const PERMISSIONS = [
  'workspace.manage', // branding, tax, domains, danger zone
  'team.manage',
  'billing.manage', // payouts, platform plan
  'courses.read',
  'courses.write',
  'products.read',
  'products.write',
  'orders.read',
  'orders.refund',
  'customers.read',
  'customers.write',
  'media.write',
  'analytics.read',
  'community.moderate',
  'community.write',
  'workshops.write',
  'consultations.write',
  'marketing.write',
  'affiliates.manage',
  'pages.write',
  'ai.use',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== 'billing.manage'),
  TEAM_MEMBER: ['courses.read', 'products.read', 'orders.read', 'customers.read', 'analytics.read'],
  INSTRUCTOR: ['courses.read', 'courses.write', 'media.write', 'workshops.write', 'consultations.write', 'community.write', 'customers.read'],
  MODERATOR: ['community.moderate', 'community.write', 'customers.read'],
  AFFILIATE: [],
  STUDENT: [],
};

/** Roles that count as "staff" – allowed into the creator dashboard */
export const STAFF_ROLES: TenantRole[] = ['OWNER', 'ADMIN', 'TEAM_MEMBER', 'INSTRUCTOR', 'MODERATOR'];

export function resolvePermissions(roles: TenantRole[], extra: string[] = []): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  for (const p of extra) if ((PERMISSIONS as readonly string[]).includes(p)) set.add(p as Permission);
  return set;
}
