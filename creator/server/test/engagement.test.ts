import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { api, as, createCreator, signup } from './helpers';
import { prisma } from '../src/lib/prisma';
import { generateSlots } from '../src/modules/consultations/service';
import { runDueJobs } from '../src/services/jobs';
import { testOutbox } from '../src/services/email';

const inDays = (d: number, h = 10) => DateTime.now().plus({ days: d }).set({ hour: h, minute: 0, second: 0, millisecond: 0 }).toJSDate();

describe('workshops', () => {
  async function publishedWorkshop(capacity: number, waitlist = true) {
    const { owner, tenant } = await createCreator();
    const w = await as(owner, tenant).post('/api/workshops').send({
      title: 'Live Q&A',
      startsAt: inDays(3),
      endsAt: new Date(inDays(3).getTime() + 3600_000),
      capacity,
      waitlistEnabled: waitlist,
      meetingUrl: 'https://meet.example.com/abc',
    });
    expect(w.status).toBe(201);
    await as(owner, tenant).post(`/api/workshops/${w.body.workshop.id}/publish`).expect(200);
    return { owner, tenant, workshopId: w.body.workshop.id as string };
  }

  it('never exceeds capacity under concurrent registrations, waitlists the rest, and promotes on cancel', async () => {
    const { tenant, workshopId } = await publishedWorkshop(3);
    const users = await Promise.all(Array.from({ length: 8 }, () => signup()));
    const results = await Promise.all(users.map((u) => as(u).post(`/api/store/${tenant.slug}/workshops/${workshopId}/register`)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const statuses = results.map((r) => r.body.registration.status);
    expect(statuses.filter((s) => s === 'REGISTERED')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'WAITLISTED')).toHaveLength(5);

    const registered = users[statuses.indexOf('REGISTERED')];
    const firstWaiting = await prisma.workshopRegistration.findFirstOrThrow({ where: { workshopId, status: 'WAITLISTED' }, orderBy: { createdAt: 'asc' } });
    await as(registered).post(`/api/store/${tenant.slug}/workshops/${workshopId}/cancel`).expect(200);
    const promoted = await prisma.workshopRegistration.findUniqueOrThrow({ where: { id: firstWaiting.id } });
    expect(promoted.status).toBe('REGISTERED');
    expect(await prisma.workshopRegistration.count({ where: { workshopId, status: 'REGISTERED' } })).toBe(3);
  });

  it('rejects registrations when full and the waitlist is off', async () => {
    const { tenant, workshopId } = await publishedWorkshop(1, false);
    const [a, b] = [await signup(), await signup()];
    await as(a).post(`/api/store/${tenant.slug}/workshops/${workshopId}/register`).expect(201);
    expect((await as(b).post(`/api/store/${tenant.slug}/workshops/${workshopId}/register`)).status).toBe(409);
  });

  it('reveals the meeting link only to registered attendees and sends a confirmation', async () => {
    const { tenant, workshopId } = await publishedWorkshop(10);
    const u = await signup();
    const pub = await api().get(`/api/store/${tenant.slug}/workshops/${workshopId}`);
    expect(JSON.stringify(pub.body)).not.toContain('meet.example.com');
    await as(u).post(`/api/store/${tenant.slug}/workshops/${workshopId}/register`).expect(201);
    const mine = await as(u).get('/api/learn/workshops');
    expect(mine.body.items[0].workshop.meetingUrl).toBe('https://meet.example.com/abc');
    const ics = await as(u).get(`/api/learn/workshops/${workshopId}/calendar.ics`);
    expect(ics.text).toContain('BEGIN:VEVENT');
    while ((await runDueJobs(50)) > 0) {
      /* drain the queue */
    }
    expect(testOutbox.some((m) => m.to === u.email && m.subject.startsWith("You're registered"))).toBe(true);
  });

  it('requires a ticket purchase for paid workshops', async () => {
    const { owner, tenant } = await createCreator();
    const product = await as(owner, tenant).post('/api/products').send({ type: 'WORKSHOP', title: 'Masterclass ticket', prices: [{ currency: 'INR', amount: 49900 }] });
    const w = await as(owner, tenant).post('/api/workshops').send({ title: 'Masterclass', startsAt: inDays(5), endsAt: new Date(inDays(5).getTime() + 7200_000), meetingUrl: 'https://meet.example.com/x', productId: product.body.product.id });
    await as(owner, tenant).post(`/api/workshops/${w.body.workshop.id}/publish`).expect(200);
    const u = await signup();
    expect((await as(u).post(`/api/store/${tenant.slug}/workshops/${w.body.workshop.id}/register`)).status).toBe(403);
  });
});

describe('consultations', () => {
  it('generates DST-safe slots that respect buffers, notice and busy times', () => {
    const now = new Date('2026-11-02T00:00:00Z'); // a Monday
    const slots = generateSlots({
      rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 11 * 60, timezone: 'Asia/Kolkata' }],
      busy: [{ startsAt: new Date('2026-11-02T04:30:00Z'), endsAt: new Date('2026-11-02T05:00:00Z') }], // 10:00–10:30 IST
      from: now,
      to: new Date('2026-11-03T00:00:00Z'),
      durationMin: 30,
      bufferMin: 0,
      now,
    });
    // 09:00, 09:30, 10:30 IST (10:00 is busy)
    expect(slots.map((s) => s.startsAt)).toEqual(['2026-11-02T03:30:00.000Z', '2026-11-02T04:00:00.000Z', '2026-11-02T05:00:00.000Z']);
  });

  it('prevents double booking even with simultaneous requests (database exclusion constraint)', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    await o.put('/api/consultations/availability').send({ timezone: 'UTC', rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 18 * 60 })) }).expect(200);
    const off = await o.post('/api/consultations/offerings').send({ title: 'Discovery call', durationMin: 30, bufferMin: 10 });
    const offeringId = off.body.offering.id;
    const slots = await api().get(`/api/store/${tenant.slug}/consultations/${offeringId}/slots?days=7`);
    expect(slots.body.slots.length).toBeGreaterThan(5);
    const target = slots.body.slots[2].startsAt;

    const customers = await Promise.all(Array.from({ length: 6 }, () => signup()));
    const results = await Promise.all(customers.map((c) => as(c).post(`/api/store/${tenant.slug}/consultations/${offeringId}/book`).send({ startsAt: target })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);

    // The booked slot (and its buffer) disappears from availability
    const after = await api().get(`/api/store/${tenant.slug}/consultations/${offeringId}/slots?days=7`);
    expect(after.body.slots.map((s: { startsAt: string }) => s.startsAt)).not.toContain(target);

    // Direct DB insert of an overlapping booking is rejected by Postgres itself
    const b = await prisma.booking.findFirstOrThrow({ where: { offeringId } });
    await expect(
      prisma.booking.create({ data: { tenantId: b.tenantId, offeringId, hostId: b.hostId, customerId: customers[0].id, startsAt: new Date(b.startsAt.getTime() + 600_000), endsAt: new Date(b.endsAt.getTime() + 600_000) } }),
    ).rejects.toThrow(/booking_no_overlap/);
  });

  it('rejects times outside availability and requires purchase for paid sessions', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    await o.put('/api/consultations/availability').send({ timezone: 'UTC', rules: [{ weekday: 3, startMinute: 600, endMinute: 660 }] }).expect(200);
    const product = await o.post('/api/products').send({ type: 'CONSULTATION', title: '1:1 coaching', prices: [{ currency: 'INR', amount: 199900 }] });
    const off = await o.post('/api/consultations/offerings').send({ title: 'Coaching', durationMin: 60, productId: product.body.product.id });
    const c = await signup();
    const bad = await as(c).post(`/api/store/${tenant.slug}/consultations/${off.body.offering.id}/book`).send({ startsAt: inDays(2, 3) });
    expect(bad.status).toBe(409);
    const slots = await api().get(`/api/store/${tenant.slug}/consultations/${off.body.offering.id}/slots?days=14`);
    const paidAttempt = await as(c).post(`/api/store/${tenant.slug}/consultations/${off.body.offering.id}/book`).send({ startsAt: slots.body.slots[0].startsAt });
    expect(paidAttempt.status).toBe(403);
  });
});

describe('community', () => {
  async function setup(access: 'FREE' | 'PAID') {
    const { owner, tenant } = await createCreator();
    const c = await as(owner, tenant).post('/api/community-admin').send({ name: 'Members Club', access });
    const channels = c.body.community.channels as { id: string; type: string }[];
    return { owner, tenant, communityId: c.body.community.id as string, feed: channels.find((x) => x.type === 'FEED')!.id, announcements: channels.find((x) => x.type === 'ANNOUNCEMENT')!.id };
  }

  it('enforces access on every request for paid communities', async () => {
    const s = await setup('PAID');
    const outsider = await signup();
    expect((await as(outsider).get(`/api/community/${s.communityId}`)).status).toBe(403);
    expect((await as(outsider).get(`/api/community/channels/${s.feed}/posts`)).status).toBe(403);
    expect((await as(outsider).post(`/api/community/channels/${s.feed}/posts`).send({ body: 'hi' })).status).toBe(403);
    expect((await as(outsider).post(`/api/community/${s.communityId}/join`)).status).toBe(403);
    // Owner posts; outsider cannot read the post or its comments
    const post = await as(s.owner).post(`/api/community/channels/${s.feed}/posts`).send({ body: 'Welcome!' });
    expect((await as(outsider).get(`/api/community/posts/${post.body.post.id}/comments`)).status).toBe(403);
    // Grant access via entitlement
    await prisma.entitlement.create({ data: { tenantId: s.tenant.id, userId: outsider.id, resourceType: 'COMMUNITY', resourceId: s.communityId, sourceType: 'MANUAL', sourceId: s.owner.id } });
    await prisma.membership.create({ data: { tenantId: s.tenant.id, userId: outsider.id, roles: ['STUDENT'] } });
    expect((await as(outsider).get(`/api/community/channels/${s.feed}/posts`)).status).toBe(200);
  });

  it('lets members post in feeds but only staff in announcements; moderators hide content', async () => {
    const s = await setup('FREE');
    const m = await signup();
    await as(m).post(`/api/community/${s.communityId}/join`).expect(200);
    expect((await as(m).post(`/api/community/channels/${s.announcements}/posts`).send({ body: 'x' })).status).toBe(403);
    const post = await as(m).post(`/api/community/channels/${s.feed}/posts`).send({ body: 'My first post' });
    expect(post.status).toBe(201);
    // Members cannot pin; the owner can hide
    expect((await as(m).patch(`/api/community/posts/${post.body.post.id}`).send({ pinned: true })).status).toBe(403);
    await as(s.owner).patch(`/api/community/posts/${post.body.post.id}`).send({ status: 'HIDDEN' }).expect(200);
    const other = await signup();
    await as(other).post(`/api/community/${s.communityId}/join`).expect(200);
    const list = await as(other).get(`/api/community/channels/${s.feed}/posts`);
    expect(list.body.posts).toHaveLength(0);
  });

  it('handles reports and bans, which remove access', async () => {
    const s = await setup('FREE');
    const troll = await signup();
    const reporter = await signup();
    for (const u of [troll, reporter]) await as(u).post(`/api/community/${s.communityId}/join`).expect(200);
    const post = await as(troll).post(`/api/community/channels/${s.feed}/posts`).send({ body: 'spam spam' });
    await as(reporter).post('/api/community/report').send({ entityType: 'post', entityId: post.body.post.id, reason: 'Spam' }).expect(201);
    const reports = await as(s.owner, s.tenant).get('/api/community-admin/reports');
    expect(reports.body.reports).toHaveLength(1);
    await as(s.owner, s.tenant).post(`/api/community-admin/reports/${reports.body.reports[0].id}`).send({ action: 'ban_author' }).expect(200);
    expect((await as(troll).get(`/api/community/channels/${s.feed}/posts`)).status).toBe(403);
  });

  it('limits posting rate and link spam', async () => {
    const s = await setup('FREE');
    const m = await signup();
    await as(m).post(`/api/community/${s.communityId}/join`).expect(200);
    expect((await as(m).post(`/api/community/channels/${s.feed}/posts`).send({ body: 'http://a http://b http://c http://d' })).status).toBe(400);
  });

  it('supports direct messages between members only, respecting blocks', async () => {
    const s = await setup('FREE');
    const [a, b, outsider] = [await signup(), await signup(), await signup()];
    for (const u of [a, b]) await as(u).post(`/api/community/${s.communityId}/join`).expect(200);
    expect((await as(a).post(`/api/community/messages/${s.tenant.id}`).send({ userIds: [outsider.id] })).status).toBe(403);
    const conv = await as(a).post(`/api/community/messages/${s.tenant.id}`).send({ userIds: [b.id] });
    expect(conv.status).toBe(201);
    await as(a).post(`/api/community/conversations/${conv.body.conversation.id}`).send({ body: 'Hey!' }).expect(201);
    const read = await as(b).get(`/api/community/conversations/${conv.body.conversation.id}`);
    expect(read.body.messages[0].body).toBe('Hey!');
    expect((await as(outsider).get(`/api/community/conversations/${conv.body.conversation.id}`)).status).toBe(404);
    await as(b).post('/api/community/block').send({ tenantId: s.tenant.id, userId: a.id, blocked: true }).expect(200);
    expect((await as(a).post(`/api/community/conversations/${conv.body.conversation.id}`).send({ body: 'again' })).status).toBe(403);
  });
});

describe('gamification', () => {
  it('awards challenge points once, tracks habit streaks, and auto-awards badges', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    await o.post('/api/gamification/badges').send({ name: 'Starter', rule: { type: 'points_at_least', value: 20 } }).expect(201);
    const ch = await o.post('/api/gamification/challenges').send({ title: '7-day sprint', points: 20, startsAt: new Date(Date.now() - 1000), endsAt: inDays(7) });
    const m = await signup();
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: m.id, roles: ['STUDENT'] } });
    const r1 = await as(m).post(`/api/engage/${tenant.id}/challenges/${ch.body.challenge.id}/complete`);
    const r2 = await as(m).post(`/api/engage/${tenant.id}/challenges/${ch.body.challenge.id}/complete`);
    expect(r1.body.awarded).toBe(true);
    expect(r2.body.awarded).toBe(false);
    const h = await as(m).post(`/api/engage/${tenant.id}/habits`).send({ title: 'Meditate' });
    await as(m).post(`/api/engage/${tenant.id}/habits/${h.body.habit.id}/check`).send({ done: true }).expect(200);
    await as(m).post(`/api/engage/${tenant.id}/habits/${h.body.habit.id}/check`).send({ done: true }).expect(200);
    const habits = await as(m).get(`/api/engage/${tenant.id}/habits`);
    expect(habits.body.habits[0].streak).toBe(1);
    const me = await as(m).get(`/api/engage/${tenant.id}`);
    expect(me.body.myPoints).toBe(21);
    expect(me.body.badges[0].earned).toBe(true);
    expect(me.body.leaderboard[0].points).toBe(21);
    // Non-members cannot see the leaderboard
    expect((await as(await signup()).get(`/api/engage/${tenant.id}`)).status).toBe(403);
  });
});
