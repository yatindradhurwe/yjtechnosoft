import { Router } from 'express';
import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
import { prisma, isConstraintViolation } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { body, parse, query, safeUrl } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff, resolvePublicTenant } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { sendEmail } from '../../services/email';
import { upsertContact } from '../customers/service';
import { generateSlots } from './service';

const id = z.string().uuid();
const tz = z.string().refine((v) => IANAZone.isValidZone(v), 'Unknown timezone');

// ---------------------------------------------------------------------------
// Creator side
// ---------------------------------------------------------------------------

export const consultationsRouter = Router();
consultationsRouter.use(requireAuth, requireTenantStaff);

const offeringSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(5000).nullable().optional(),
  durationMin: z.number().int().min(10).max(480),
  bufferMin: z.number().int().min(0).max(120).default(0),
  productId: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

consultationsRouter.get('/offerings', can('consultations.write'), async (req, res) => {
  res.json({ offerings: await prisma.consultationOffering.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' } }) });
});

consultationsRouter.post('/offerings', can('consultations.write'), async (req, res) => {
  const input = body(req, offeringSchema);
  if (input.productId && !(await prisma.product.findFirst({ where: { id: input.productId, tenantId: req.tenant!.id } }))) throw badRequest('Product not found');
  const o = await prisma.consultationOffering.create({ data: { ...input, tenantId: req.tenant!.id, hostId: req.user!.id } });
  if (input.productId) {
    await prisma.productItem.upsert({
      where: { productId_resourceType_resourceId: { productId: input.productId, resourceType: 'CONSULTATION', resourceId: o.id } },
      create: { productId: input.productId, resourceType: 'CONSULTATION', resourceId: o.id },
      update: {},
    });
  }
  res.status(201).json({ offering: o });
});

consultationsRouter.put('/offerings/:offeringId', can('consultations.write'), async (req, res) => {
  const o = await prisma.consultationOffering.findFirst({ where: { id: parse(id, req.params.offeringId), tenantId: req.tenant!.id } });
  if (!o) throw notFound('Offering not found');
  res.json({ offering: await prisma.consultationOffering.update({ where: { id: o.id }, data: body(req, offeringSchema) }) });
});

consultationsRouter.get('/availability', can('consultations.write'), async (req, res) => {
  res.json({ rules: await prisma.availabilityRule.findMany({ where: { tenantId: req.tenant!.id, hostId: req.user!.id }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] }) });
});

/** Replace the host's weekly availability */
consultationsRouter.put('/availability', can('consultations.write'), async (req, res) => {
  const input = body(
    req,
    z.object({
      timezone: tz,
      rules: z
        .array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine((r) => r.endMinute > r.startMinute, 'End must be after start'))
        .max(50),
    }),
  );
  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { tenantId: req.tenant!.id, hostId: req.user!.id } }),
    prisma.availabilityRule.createMany({ data: input.rules.map((r) => ({ ...r, timezone: input.timezone, tenantId: req.tenant!.id, hostId: req.user!.id })) }),
  ]);
  res.json({ ok: true });
});

consultationsRouter.get('/bookings', can('consultations.write'), async (req, res) => {
  const q = query(req, z.object({ from: z.coerce.date().optional(), status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'CANCELED', 'COMPLETED', 'NO_SHOW']).optional() }));
  const bookings = await prisma.booking.findMany({
    where: { tenantId: req.tenant!.id, status: q.status, startsAt: { gte: q.from ?? new Date(Date.now() - 30 * 86400_000) } },
    orderBy: { startsAt: 'asc' },
    include: { offering: { select: { title: true } } },
    take: 500,
  });
  const users = await prisma.user.findMany({ where: { id: { in: bookings.map((b) => b.customerId) } }, select: { id: true, name: true, email: true } });
  res.json({ bookings: bookings.map((b) => ({ ...b, customer: users.find((u) => u.id === b.customerId) })) });
});

consultationsRouter.patch('/bookings/:bookingId', can('consultations.write'), async (req, res) => {
  const b = await prisma.booking.findFirst({ where: { id: parse(id, req.params.bookingId), tenantId: req.tenant!.id } });
  if (!b) throw notFound('Booking not found');
  const input = body(req, z.object({ status: z.enum(['CONFIRMED', 'CANCELED', 'COMPLETED', 'NO_SHOW']).optional(), meetingUrl: safeUrl.nullable().optional(), notes: z.string().max(2000).optional() }));
  const updated = await prisma.booking.update({ where: { id: b.id }, data: input });
  await audit({ action: 'booking.update', entityType: 'booking', entityId: b.id, metadata: input, req });
  if (input.status === 'CANCELED') {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: b.customerId } });
    await sendEmail({ tenantId: b.tenantId, to: u.email, subject: 'Your session was cancelled', text: `Hi ${u.name},\n\nYour session on ${b.startsAt.toUTCString()} was cancelled by the host. If you paid, the creator will arrange your refund or a new time.` });
  }
  res.json({ booking: updated });
});

// ---------------------------------------------------------------------------
// Customer side: /api/store/:tenantSlug/consultations
// ---------------------------------------------------------------------------

export const consultationsPublicRouter = Router({ mergeParams: true });
consultationsPublicRouter.use(resolvePublicTenant);

consultationsPublicRouter.get('/', async (req, res) => {
  const offerings = await prisma.consultationOffering.findMany({ where: { tenantId: req.tenant!.id, active: true }, select: { id: true, title: true, description: true, durationMin: true, productId: true } });
  const products = await prisma.product.findMany({ where: { id: { in: offerings.map((o) => o.productId).filter(Boolean) as string[] }, status: 'PUBLISHED' }, select: { id: true, slug: true } });
  res.json({ offerings: offerings.map((o) => ({ ...o, productSlug: products.find((p) => p.id === o.productId)?.slug ?? null })) });
});

consultationsPublicRouter.get('/:offeringId/slots', async (req, res) => {
  const o = await prisma.consultationOffering.findFirst({ where: { id: parse(id, req.params.offeringId), tenantId: req.tenant!.id, active: true } });
  if (!o) throw notFound('Offering not found');
  const q = query(req, z.object({ from: z.coerce.date().optional(), days: z.coerce.number().int().min(1).max(60).default(14) }));
  const from = q.from && q.from > new Date() ? q.from : new Date();
  const to = new Date(from.getTime() + q.days * 86400_000);
  const [rules, busy] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { tenantId: o.tenantId, hostId: o.hostId } }),
    prisma.booking.findMany({ where: { hostId: o.hostId, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] }, endsAt: { gt: from }, startsAt: { lt: to } }, select: { startsAt: true, endsAt: true } }),
  ]);
  res.json({ slots: generateSlots({ rules, busy, from, to, durationMin: o.durationMin, bufferMin: o.bufferMin }), timezone: rules[0]?.timezone ?? req.tenant!.timezone });
});

/** An unused paid booking credit: an order entitlement for this offering with no active booking */
async function unusedCredit(tenantId: string, userId: string, offeringId: string) {
  const ents = await prisma.entitlement.findMany({ where: { tenantId, userId, resourceType: 'CONSULTATION', resourceId: offeringId, status: 'ACTIVE', sourceType: 'ORDER' } });
  for (const e of ents) {
    const used = await prisma.booking.count({ where: { orderId: e.sourceId, offeringId, status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'PENDING_PAYMENT'] } } });
    if (!used) return e.sourceId;
  }
  return null;
}

consultationsPublicRouter.post('/:offeringId/book', requireAuth, async (req, res) => {
  const o = await prisma.consultationOffering.findFirst({ where: { id: parse(id, req.params.offeringId), tenantId: req.tenant!.id, active: true } });
  if (!o) throw notFound('Offering not found');
  const input = body(req, z.object({ startsAt: z.coerce.date(), notes: z.string().trim().max(1000).optional() }));
  const endsAt = new Date(input.startsAt.getTime() + o.durationMin * 60_000);

  // The requested time must be one of the generated slots (availability + notice rules)
  const rules = await prisma.availabilityRule.findMany({ where: { tenantId: o.tenantId, hostId: o.hostId } });
  const busy = await prisma.booking.findMany({ where: { hostId: o.hostId, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] }, endsAt: { gt: input.startsAt }, startsAt: { lt: endsAt } }, select: { startsAt: true, endsAt: true } });
  const slots = generateSlots({ rules, busy, from: new Date(input.startsAt.getTime() - 60_000), to: new Date(endsAt.getTime() + 60_000), durationMin: o.durationMin, bufferMin: o.bufferMin });
  if (!slots.some((s) => new Date(s.startsAt).getTime() === input.startsAt.getTime())) throw conflict('This time is no longer available. Please pick another slot.');

  let orderId: string | null = null;
  if (o.productId) {
    orderId = await unusedCredit(o.tenantId, req.user!.id, o.id);
    if (!orderId) throw forbidden('Purchase this session before booking a time');
  }
  try {
    // The exclusion constraint booking_no_overlap rejects any overlapping active
    // booking for this host, even under concurrent requests.
    const booking = await prisma.booking.create({
      data: { tenantId: o.tenantId, offeringId: o.id, hostId: o.hostId, customerId: req.user!.id, startsAt: input.startsAt, endsAt, status: 'CONFIRMED', orderId, notes: input.notes },
    });
    await upsertContact(prisma, o.tenantId, { email: req.user!.email, name: req.user!.name, userId: req.user!.id, source: 'booking' });
    const [host, tenant] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: o.hostId } }), prisma.tenant.findUniqueOrThrow({ where: { id: o.tenantId } })]);
    const when = DateTime.fromJSDate(input.startsAt, { zone: rules[0]?.timezone ?? tenant.timezone }).toFormat("cccc d LLL yyyy, h:mm a ZZZZ");
    await sendEmail({ tenantId: o.tenantId, to: req.user!.email, fromName: tenant.name, subject: `Booked: ${o.title}`, text: `Hi ${req.user!.name},\n\nYour ${o.title} with ${host.name} is confirmed for ${when}.\nThe meeting link will appear in your dashboard.` });
    await sendEmail({ tenantId: o.tenantId, to: host.email, subject: `New booking: ${o.title}`, text: `${req.user!.name} (${req.user!.email}) booked ${o.title} for ${when}.${input.notes ? `\n\nNotes: ${input.notes}` : ''}` });
    res.status(201).json({ booking });
  } catch (e) {
    if (isConstraintViolation(e, 'booking_no_overlap')) throw conflict('This time was just booked by someone else. Please pick another slot.');
    throw e;
  }
});

/** Customer's bookings across workspaces */
export const myBookingsRouter = Router();

myBookingsRouter.get('/', requireAuth, async (req, res) => {
  const bookings = await prisma.booking.findMany({ where: { customerId: req.user!.id }, orderBy: { startsAt: 'desc' }, include: { offering: { select: { title: true, durationMin: true } } }, take: 200 });
  res.json({ bookings: bookings.map((b) => ({ ...b, meetingUrl: b.status === 'CONFIRMED' ? b.meetingUrl : null })) });
});

/** Reschedule (≥ 24h ahead) – the exclusion constraint still guards overlaps */
myBookingsRouter.post('/:bookingId/reschedule', requireAuth, async (req, res) => {
  const b = await prisma.booking.findFirst({ where: { id: parse(id, req.params.bookingId), customerId: req.user!.id, status: 'CONFIRMED' }, include: { offering: true } });
  if (!b) throw notFound('Booking not found');
  if (b.startsAt.getTime() - Date.now() < 24 * 3600_000) throw badRequest('Sessions can be rescheduled up to 24 hours before they start');
  const input = body(req, z.object({ startsAt: z.coerce.date() }));
  const endsAt = new Date(input.startsAt.getTime() + b.offering.durationMin * 60_000);
  const rules = await prisma.availabilityRule.findMany({ where: { tenantId: b.tenantId, hostId: b.hostId } });
  const busy = await prisma.booking.findMany({ where: { hostId: b.hostId, id: { not: b.id }, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] }, endsAt: { gt: input.startsAt }, startsAt: { lt: endsAt } }, select: { startsAt: true, endsAt: true } });
  const slots = generateSlots({ rules, busy, from: new Date(input.startsAt.getTime() - 60_000), to: new Date(endsAt.getTime() + 60_000), durationMin: b.offering.durationMin, bufferMin: b.offering.bufferMin });
  if (!slots.some((s) => new Date(s.startsAt).getTime() === input.startsAt.getTime())) throw conflict('This time is not available');
  try {
    res.json({ booking: await prisma.booking.update({ where: { id: b.id }, data: { startsAt: input.startsAt, endsAt } }) });
  } catch (e) {
    if (isConstraintViolation(e, 'booking_no_overlap')) throw conflict('This time was just booked by someone else');
    throw e;
  }
});

myBookingsRouter.post('/:bookingId/cancel', requireAuth, async (req, res) => {
  const b = await prisma.booking.findFirst({ where: { id: parse(id, req.params.bookingId), customerId: req.user!.id, status: 'CONFIRMED' } });
  if (!b) throw notFound('Booking not found');
  if (b.startsAt.getTime() - Date.now() < 24 * 3600_000) throw badRequest('Sessions can be cancelled up to 24 hours before they start');
  await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELED' } });
  res.json({ ok: true, note: b.orderId ? 'Your booking credit is available again – you can book a new time.' : undefined });
});
