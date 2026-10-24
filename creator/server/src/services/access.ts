import type { ResourceType } from '@prisma/client';
import { prisma, Db } from '../lib/prisma';
import { Permission, resolvePermissions } from '../lib/permissions';

/** True when the user holds an active, unexpired entitlement to the resource */
export async function hasEntitlement(userId: string, tenantId: string, resourceType: ResourceType, resourceId: string, db: Db = prisma) {
  const now = new Date();
  const ent = await db.entitlement.findFirst({
    where: {
      tenantId,
      userId,
      resourceType,
      resourceId,
      status: 'ACTIVE',
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });
  return !!ent;
}

/** Staff with the given permission can always preview content in their workspace */
export async function isStaffWith(userId: string, tenantId: string, permission: Permission) {
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
  if (!m || m.status !== 'ACTIVE') return false;
  return resolvePermissions(m.roles, m.permissions).has(permission);
}

export async function canAccessCourse(userId: string, tenantId: string, courseId: string) {
  return (await hasEntitlement(userId, tenantId, 'COURSE', courseId)) || (await isStaffWith(userId, tenantId, 'courses.read'));
}
