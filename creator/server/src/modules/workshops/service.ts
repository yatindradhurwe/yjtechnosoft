import { env } from '../../config/env';
import { prisma, Tx } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { enqueueJob, registerJob } from '../../services/jobs';
import { sendEmail } from '../../services/email';

/**
 * Register a user. The workshop row is locked (SELECT … FOR UPDATE) so concurrent
 * registrations can never exceed capacity; overflow goes to the waitlist.
 */
export async function registerForWorkshop(tx: Tx, workshopId: string, userId: string) {
  const rows = await tx.$queryRaw<{ id: string; capacity: number | null; waitlistEnabled: boolean; status: string; tenantId: string }[]>`
    SELECT id, capacity, "waitlistEnabled", status, "tenantId" FROM "Workshop" WHERE id = ${workshopId}::uuid FOR UPDATE`;
  const w = rows[0];
  if (!w || w.status !== 'PUBLISHED') throw notFound('Workshop not found');
  const existing = await tx.workshopRegistration.findUnique({ where: { workshopId_userId: { workshopId, userId } } });
  if (existing && existing.status !== 'CANCELED') return existing;
  const taken = await tx.workshopRegistration.count({ where: { workshopId, status: 'REGISTERED' } });
  let status: 'REGISTERED' | 'WAITLISTED' = 'REGISTERED';
  if (w.capacity !== null && taken >= w.capacity) {
    if (!w.waitlistEnabled) throw conflict('This workshop is full');
    status = 'WAITLISTED';
  }
  const reg = existing
    ? await tx.workshopRegistration.update({ where: { id: existing.id }, data: { status } })
    : await tx.workshopRegistration.create({ data: { tenantId: w.tenantId, workshopId, userId, status } });
  await enqueueJob(tx, 'workshop.registration_email', { registrationId: reg.id }, `ws-reg-email:${reg.id}:${status}:${reg.updatedAt.getTime()}`);
  return reg;
}

/** Cancel and promote the earliest waitlisted attendee into the freed seat */
export async function cancelRegistration(tx: Tx, workshopId: string, userId: string) {
  await tx.$queryRaw`SELECT id FROM "Workshop" WHERE id = ${workshopId}::uuid FOR UPDATE`;
  const reg = await tx.workshopRegistration.findUnique({ where: { workshopId_userId: { workshopId, userId } } });
  if (!reg || reg.status === 'CANCELED') return null;
  await tx.workshopRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELED' } });
  if (reg.status === 'REGISTERED') {
    const next = await tx.workshopRegistration.findFirst({ where: { workshopId, status: 'WAITLISTED' }, orderBy: { createdAt: 'asc' } });
    if (next) {
      const promoted = await tx.workshopRegistration.update({ where: { id: next.id }, data: { status: 'REGISTERED' } });
      await enqueueJob(tx, 'workshop.registration_email', { registrationId: next.id }, `ws-reg-email:${next.id}:REGISTERED:${promoted.updatedAt.getTime()}`);
    }
  }
  return reg;
}

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 calendar invite */
export function workshopIcs(w: { id: string; title: string; description: string | null; startsAt: Date; endsAt: Date }, organiser: string) {
  const esc = (s: string) => s.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Creator Platform//Workshops//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${w.id}@creator-platform`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(w.startsAt)}`,
    `DTEND:${icsDate(w.endsAt)}`,
    `SUMMARY:${esc(w.title)}`,
    `DESCRIPTION:${esc(`${w.description ?? ''}\n\nJoin link: ${env.APP_URL}/learn/workshops`)}`,
    `ORGANIZER;CN=${esc(organiser)}:mailto:no-reply@invalid`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

registerJob('workshop.registration_email', async ({ registrationId }) => {
  const reg = await prisma.workshopRegistration.findUnique({ where: { id: String(registrationId) }, include: { workshop: true } });
  if (!reg || reg.status === 'CANCELED') return;
  const [user, tenant] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: reg.userId } }), prisma.tenant.findUniqueOrThrow({ where: { id: reg.tenantId } })]);
  const w = reg.workshop;
  const when = w.startsAt.toLocaleString('en-IN', { timeZone: w.timezone, dateStyle: 'full', timeStyle: 'short' });
  await sendEmail({
    tenantId: reg.tenantId,
    to: user.email,
    fromName: tenant.name,
    subject: reg.status === 'REGISTERED' ? `You're registered: ${w.title}` : `You're on the waitlist: ${w.title}`,
    text:
      reg.status === 'REGISTERED'
        ? `Hi ${user.name},\n\nYour seat is confirmed for "${w.title}" on ${when} (${w.timezone}).\nThe join link is in your dashboard: ${env.APP_URL}/learn/workshops\nYou can add it to your calendar from the same page.\n`
        : `Hi ${user.name},\n\n"${w.title}" is currently full. You're on the waitlist and we'll email you if a seat opens up.\n`,
  });
});

registerJob('workshop.reminder', async ({ registrationId, kind }) => {
  const reg = await prisma.workshopRegistration.findUnique({ where: { id: String(registrationId) }, include: { workshop: true } });
  if (!reg || reg.status !== 'REGISTERED' || reg.workshop.status !== 'PUBLISHED') return;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: reg.userId } });
  await sendEmail({
    tenantId: reg.tenantId,
    to: user.email,
    subject: `Reminder: ${reg.workshop.title} starts ${kind === '1h' ? 'in 1 hour' : 'tomorrow'}`,
    text: `Hi ${user.name},\n\n"${reg.workshop.title}" starts at ${reg.workshop.startsAt.toLocaleString('en-IN', { timeZone: reg.workshop.timezone })}.\nJoin from your dashboard: ${env.APP_URL}/learn/workshops\n`,
  });
});

/** Called from the sweep: queue 24h and 1h reminders exactly once per registration */
export async function sendWorkshopReminders() {
  const now = Date.now();
  for (const [kind, ms] of [['24h', 24 * 3600_000], ['1h', 3600_000]] as const) {
    const regs = await prisma.workshopRegistration.findMany({
      where: { status: 'REGISTERED', workshop: { status: 'PUBLISHED', startsAt: { gt: new Date(now), lte: new Date(now + ms) } } },
      select: { id: true },
      take: 1000,
    });
    for (const r of regs) await enqueueJob(prisma, 'workshop.reminder', { registrationId: r.id, kind }, `ws-remind:${kind}:${r.id}`);
  }
}
