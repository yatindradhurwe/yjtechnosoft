import { prisma, Db } from '../lib/prisma';
import { forbidden } from '../lib/errors';

export interface PlanLimits {
  maxCourses?: number | null;
  maxProducts?: number | null;
  maxTeamMembers?: number | null;
  storageMb?: number | null;
  aiCreditsMonthly?: number | null;
  customDomain?: boolean;
  affiliates?: boolean;
  automations?: boolean;
}

export async function tenantPlan(tenantId: string, db: Db = prisma) {
  const sub = await db.tenantSubscription.findFirst({
    where: { tenantId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
  return {
    plan: sub?.plan ?? null,
    limits: (sub?.plan.limits ?? {}) as PlanLimits,
    platformFeeBps: sub?.plan.platformFeeBps ?? 1000,
  };
}

/** Throws 403 when creating one more `resource` would exceed the plan limit */
export async function assertWithinLimit(tenantId: string, key: 'maxCourses' | 'maxProducts' | 'maxTeamMembers', current: number) {
  const { limits, plan } = await tenantPlan(tenantId);
  const max = limits[key];
  if (typeof max === 'number' && current >= max) {
    throw forbidden(`Your ${plan?.name ?? 'current'} plan allows ${max} ${key.replace('max', '').toLowerCase()}. Upgrade to add more.`);
  }
}

export async function assertFeature(tenantId: string, key: 'customDomain' | 'affiliates' | 'automations') {
  const { limits, plan } = await tenantPlan(tenantId);
  if (limits[key] === false) throw forbidden(`This feature is not included in the ${plan?.name ?? 'current'} plan`);
}
