import type { Community } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePermissions } from '../../lib/permissions';
import { hasEntitlement } from '../../services/access';

export async function communityRole(userId: string, tenantId: string) {
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
  if (!m || m.status !== 'ACTIVE') return { member: false, staff: false, moderator: false };
  const perms = resolvePermissions(m.roles, m.permissions);
  return { member: true, staff: perms.has('community.write'), moderator: perms.has('community.moderate') };
}

/**
 * FREE communities: any active member of the workspace (joining creates a STUDENT membership).
 * PAID communities: an active COMMUNITY entitlement. Staff always have access.
 * Suspended members (bans) have none.
 */
export async function canAccessCommunity(userId: string, community: Pick<Community, 'id' | 'tenantId' | 'access'>) {
  const role = await communityRole(userId, community.tenantId);
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: community.tenantId, userId } } });
  if (m?.status === 'SUSPENDED') return false;
  if (role.staff || role.moderator) return true;
  if (community.access === 'FREE') return role.member;
  return hasEntitlement(userId, community.tenantId, 'COMMUNITY', community.id);
}
