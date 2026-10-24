import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { body, parse } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { awardPoints, evaluateBadges, pointsFor } from './service';

const id = z.string().uuid();

// ---- Creator: badges, challenges, manual awards (X-Tenant) ----

export const gamificationAdminRouter = Router();
gamificationAdminRouter.use(requireAuth, requireTenantStaff, can('community.write'));

const ruleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('points_at_least'), value: z.number().int().min(1) }),
  z.object({ type: z.literal('courses_completed'), value: z.number().int().min(1) }),
]);

gamificationAdminRouter.get('/badges', async (req, res) => {
  const badges = await prisma.badge.findMany({ where: { tenantId: req.tenant!.id }, include: { _count: { select: { awards: true } } } });
  res.json({ badges });
});

gamificationAdminRouter.post('/badges', async (req, res) => {
  const input = body(req, z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(300).optional(), icon: z.string().max(40).optional(), rule: ruleSchema.nullable().optional() }));
  res.status(201).json({ badge: await prisma.badge.create({ data: { ...input, rule: input.rule ?? undefined, tenantId: req.tenant!.id } }) });
});

gamificationAdminRouter.post('/badges/:badgeId/award', async (req, res) => {
  const badge = await prisma.badge.findFirst({ where: { id: parse(id, req.params.badgeId), tenantId: req.tenant!.id } });
  if (!badge) throw notFound('Badge not found');
  const { userId } = body(req, z.object({ userId: z.string().uuid() }));
  const member = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: req.tenant!.id, userId } } });
  if (!member) throw badRequest('This person is not a member of your workspace');
  const r = await prisma.achievement.createMany({ data: [{ tenantId: req.tenant!.id, badgeId: badge.id, userId }], skipDuplicates: true });
  await audit({ action: 'badge.award', entityType: 'badge', entityId: badge.id, metadata: { userId }, req });
  res.json({ awarded: r.count === 1 });
});

gamificationAdminRouter.post('/points', async (req, res) => {
  const input = body(req, z.object({ userId: z.string().uuid(), points: z.number().int().min(-1000).max(1000), reason: z.string().trim().min(2).max(100), idempotencyKey: z.string().min(8).max(80) }));
  const member = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: req.tenant!.id, userId: input.userId } } });
  if (!member) throw badRequest('This person is not a member of your workspace');
  const awarded = await awardPoints(prisma, { tenantId: req.tenant!.id, userId: input.userId, points: input.points, reason: input.reason, sourceKey: `manual:${input.idempotencyKey}` });
  await audit({ action: 'points.manual', metadata: input, req });
  res.json({ awarded });
});

gamificationAdminRouter.post('/challenges', async (req, res) => {
  const input = body(
    req,
    z.object({ title: z.string().trim().min(2).max(120), description: z.string().max(2000).optional(), points: z.number().int().min(1).max(1000), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((c) => c.endsAt > c.startsAt, 'End must be after start'),
  );
  res.status(201).json({ challenge: await prisma.challenge.create({ data: { ...input, tenantId: req.tenant!.id } }) });
});

// ---- Member side (/api/engage/:tenantId) ----

export const engageRouter = Router();
engageRouter.use(requireAuth);

async function requireMember(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
  if (!m || m.status !== 'ACTIVE') throw forbidden('Join this community first');
}

engageRouter.get('/:tenantId', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  await requireMember(tenantId, req.user!.id);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [board, myPoints, badges, mine, challenges] = await Promise.all([
    prisma.pointsLedger.groupBy({ by: ['userId'], where: { tenantId, createdAt: { gte: since } }, _sum: { points: true }, orderBy: { _sum: { points: 'desc' } }, take: 20 }),
    pointsFor(prisma, tenantId, req.user!.id),
    prisma.badge.findMany({ where: { tenantId } }),
    prisma.achievement.findMany({ where: { tenantId, userId: req.user!.id } }),
    prisma.challenge.findMany({ where: { tenantId, endsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: board.map((b) => b.userId) } }, select: { id: true, name: true, avatarUrl: true } });
  const completed = await prisma.pointsLedger.findMany({ where: { tenantId, userId: req.user!.id, sourceKey: { in: challenges.map((c) => `challenge:${c.id}`) } } });
  res.json({
    myPoints,
    level: Math.floor(Math.sqrt(myPoints / 50)) + 1,
    leaderboard: board.map((b, i) => ({ rank: i + 1, user: users.find((u) => u.id === b.userId), points: b._sum.points ?? 0 })),
    badges: badges.map((b) => ({ id: b.id, name: b.name, description: b.description, icon: b.icon, earned: mine.some((m) => m.badgeId === b.id) })),
    challenges: challenges.map((c) => ({ ...c, completed: completed.some((x) => x.sourceKey === `challenge:${c.id}`) })),
  });
});

/** Completing a challenge awards its points once */
engageRouter.post('/:tenantId/challenges/:challengeId/complete', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  await requireMember(tenantId, req.user!.id);
  const c = await prisma.challenge.findFirst({ where: { id: parse(id, req.params.challengeId), tenantId } });
  if (!c) throw notFound('Challenge not found');
  const now = new Date();
  if (now < c.startsAt || now > c.endsAt) throw badRequest('This challenge is not active');
  const awarded = await awardPoints(prisma, { tenantId, userId: req.user!.id, points: c.points, reason: `Challenge: ${c.title}`, sourceKey: `challenge:${c.id}` });
  res.json({ awarded });
});

// ---- Habit tracker ----

function streak(days: string[], today: string) {
  const set = new Set(days);
  let d = DateTime.fromISO(today);
  if (!set.has(today)) d = d.minus({ days: 1 });
  let n = 0;
  while (set.has(d.toISODate()!)) {
    n++;
    d = d.minus({ days: 1 });
  }
  return n;
}

engageRouter.get('/:tenantId/habits', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  await requireMember(tenantId, req.user!.id);
  const tz = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  const today = DateTime.now().setZone(tz).toISODate()!;
  const habits = await prisma.habit.findMany({ where: { tenantId, userId: req.user!.id }, include: { logs: { orderBy: { day: 'desc' }, take: 120 } } });
  res.json({ today, habits: habits.map((h) => ({ id: h.id, title: h.title, doneToday: h.logs.some((l) => l.day === today), streak: streak(h.logs.map((l) => l.day), today), days: h.logs.map((l) => l.day) })) });
});

engageRouter.post('/:tenantId/habits', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  await requireMember(tenantId, req.user!.id);
  const { title } = body(req, z.object({ title: z.string().trim().min(1).max(100) }));
  if ((await prisma.habit.count({ where: { tenantId, userId: req.user!.id } })) >= 20) throw badRequest('You can track up to 20 habits');
  res.status(201).json({ habit: await prisma.habit.create({ data: { tenantId, userId: req.user!.id, title } }) });
});

engageRouter.post('/:tenantId/habits/:habitId/check', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  const habit = await prisma.habit.findFirst({ where: { id: parse(id, req.params.habitId), tenantId, userId: req.user!.id } });
  if (!habit) throw notFound('Habit not found');
  const { done } = body(req, z.object({ done: z.boolean() }));
  const tz = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone;
  const today = DateTime.now().setZone(tz).toISODate()!;
  if (done) {
    await prisma.habitLog.createMany({ data: [{ habitId: habit.id, day: today }], skipDuplicates: true });
    await awardPoints(prisma, { tenantId, userId: req.user!.id, points: 1, reason: 'Habit check-in', sourceKey: `habit:${habit.id}:${today}` });
  } else {
    await prisma.habitLog.deleteMany({ where: { habitId: habit.id, day: today } });
  }
  await evaluateBadges(prisma, tenantId, req.user!.id);
  res.json({ ok: true });
});

engageRouter.delete('/:tenantId/habits/:habitId', async (req, res) => {
  const r = await prisma.habit.deleteMany({ where: { id: parse(id, req.params.habitId), tenantId: parse(id, req.params.tenantId), userId: req.user!.id } });
  if (!r.count) throw notFound('Habit not found');
  res.json({ ok: true });
});
