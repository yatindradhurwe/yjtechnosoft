import type { Db } from '../../lib/prisma';

/**
 * Award points exactly once per (tenant, user, sourceKey). Repeated calls – retries,
 * double clicks, re-completing a lesson – are no-ops thanks to the unique key.
 */
export async function awardPoints(db: Db, a: { tenantId: string; userId: string; points: number; reason: string; sourceKey: string }) {
  const r = await db.pointsLedger.createMany({ data: [a], skipDuplicates: true });
  if (r.count) await evaluateBadges(db, a.tenantId, a.userId);
  return r.count === 1;
}

export async function pointsFor(db: Db, tenantId: string, userId: string) {
  const agg = await db.pointsLedger.aggregate({ where: { tenantId, userId }, _sum: { points: true } });
  return agg._sum.points ?? 0;
}

/** Automatic badge rules: {"type":"points_at_least","value":N} | {"type":"courses_completed","value":N} */
export async function evaluateBadges(db: Db, tenantId: string, userId: string) {
  const badges = await db.badge.findMany({ where: { tenantId, rule: { not: undefined } } });
  if (!badges.length) return;
  const owned = new Set((await db.achievement.findMany({ where: { tenantId, userId }, select: { badgeId: true } })).map((a) => a.badgeId));
  let points: number | null = null;
  let completed: number | null = null;
  for (const b of badges) {
    if (owned.has(b.id) || !b.rule) continue;
    const rule = b.rule as { type?: string; value?: number };
    let earned = false;
    if (rule.type === 'points_at_least') {
      points ??= await pointsFor(db, tenantId, userId);
      earned = points >= (rule.value ?? Infinity);
    } else if (rule.type === 'courses_completed') {
      completed ??= await db.enrollment.count({ where: { tenantId, userId, status: 'COMPLETED' } });
      earned = completed >= (rule.value ?? Infinity);
    }
    if (earned) {
      const r = await db.achievement.createMany({ data: [{ tenantId, badgeId: b.id, userId }], skipDuplicates: true });
      if (r.count) await db.notification.create({ data: { tenantId, userId, type: 'badge.awarded', title: `You earned the "${b.name}" badge` } });
    }
  }
}
