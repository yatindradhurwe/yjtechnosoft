import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { body, parse, safeUrl } from '../../lib/validate';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff, resolvePublicTenant } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { hasEntitlement } from '../../services/access';
import { describeIntegration, saveIntegration } from '../../services/integrations';
import { createZoomMeeting, zoomConfigured } from '../../services/zoom';
import { signMediaUrl } from '../../services/storage';
import { sendEmail } from '../../services/email';
import { cancelRegistration, registerForWorkshop, workshopIcs } from './service';
import { upsertContact } from '../customers/service';
import { dispatchAutomationEvent } from '../marketing/automation';

const id = z.string().uuid();

// ---------------------------------------------------------------------------
// Creator side
// ---------------------------------------------------------------------------

export const workshopsRouter = Router();
workshopsRouter.use(requireAuth, requireTenantStaff);

const workshopSchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().max(10000).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timezone: z.string().max(60).default('Asia/Kolkata'),
    capacity: z.number().int().min(1).max(100000).nullable().optional(),
    waitlistEnabled: z.boolean().default(true),
    meetingProvider: z.enum(['ZOOM', 'GOOGLE_MEET', 'CUSTOM_LINK']).default('CUSTOM_LINK'),
    meetingUrl: safeUrl.nullable().optional(),
    replayEnabled: z.boolean().default(false),
    productId: z.string().uuid().nullable().optional(),
  })
  .refine((w) => w.endsAt > w.startsAt, 'End time must be after the start time');

workshopsRouter.get('/', can('workshops.write'), async (req, res) => {
  const items = await prisma.workshop.findMany({
    where: { tenantId: req.tenant!.id },
    orderBy: { startsAt: 'desc' },
    include: { _count: { select: { registrations: { where: { status: 'REGISTERED' } } } } },
  });
  const waitlist = await prisma.workshopRegistration.groupBy({ by: ['workshopId'], where: { tenantId: req.tenant!.id, status: 'WAITLISTED' }, _count: true });
  res.json({ items: items.map((w) => ({ ...w, registered: w._count.registrations, waitlisted: waitlist.find((x) => x.workshopId === w.id)?._count ?? 0 })), zoomConnected: await zoomConfigured(req.tenant!.id) });
});

workshopsRouter.post('/', can('workshops.write'), async (req, res) => {
  const input = body(req, workshopSchema);
  if (input.productId && !(await prisma.product.findFirst({ where: { id: input.productId, tenantId: req.tenant!.id } }))) throw badRequest('Product not found');
  const w = await prisma.workshop.create({ data: { ...input, tenantId: req.tenant!.id } });
  if (input.productId) {
    await prisma.productItem.upsert({
      where: { productId_resourceType_resourceId: { productId: input.productId, resourceType: 'WORKSHOP', resourceId: w.id } },
      create: { productId: input.productId, resourceType: 'WORKSHOP', resourceId: w.id },
      update: {},
    });
  }
  await audit({ action: 'workshop.create', entityType: 'workshop', entityId: w.id, req });
  res.status(201).json({ workshop: w });
});

async function loadWorkshop(tenantId: string, workshopId: string) {
  const w = await prisma.workshop.findFirst({ where: { id: workshopId, tenantId } });
  if (!w) throw notFound('Workshop not found');
  return w;
}

workshopsRouter.put('/:workshopId', can('workshops.write'), async (req, res) => {
  const w = await loadWorkshop(req.tenant!.id, parse(id, req.params.workshopId));
  const input = body(req, workshopSchema);
  if (input.capacity) {
    const registered = await prisma.workshopRegistration.count({ where: { workshopId: w.id, status: 'REGISTERED' } });
    if (input.capacity < registered) throw badRequest(`${registered} people are already registered`);
  }
  res.json({ workshop: await prisma.workshop.update({ where: { id: w.id }, data: input }) });
});

/** Publish; creates the Zoom meeting when Zoom is the provider and connected */
workshopsRouter.post('/:workshopId/publish', can('workshops.write'), async (req, res) => {
  const w = await loadWorkshop(req.tenant!.id, parse(id, req.params.workshopId));
  let data: { status: 'PUBLISHED'; meetingUrl?: string; meetingId?: string } = { status: 'PUBLISHED' };
  if (w.meetingProvider === 'ZOOM' && !w.meetingId) {
    if (!(await zoomConfigured(req.tenant!.id))) throw badRequest('Connect Zoom in Settings › Integrations, or switch this workshop to a custom meeting link');
    const m = await createZoomMeeting(req.tenant!.id, { topic: w.title, startsAt: w.startsAt, durationMin: Math.ceil((w.endsAt.getTime() - w.startsAt.getTime()) / 60000), timezone: w.timezone });
    data = { ...data, meetingUrl: m.joinUrl, meetingId: m.meetingId };
  } else if (!w.meetingUrl) {
    throw badRequest('Add the meeting link before publishing');
  }
  const updated = await prisma.workshop.update({ where: { id: w.id }, data });
  await audit({ action: 'workshop.publish', entityType: 'workshop', entityId: w.id, req });
  res.json({ workshop: updated });
});

workshopsRouter.post('/:workshopId/cancel', can('workshops.write'), async (req, res) => {
  const w = await loadWorkshop(req.tenant!.id, parse(id, req.params.workshopId));
  const input = body(req, z.object({ message: z.string().trim().max(2000).optional() }));
  await prisma.workshop.update({ where: { id: w.id }, data: { status: 'CANCELED' } });
  const regs = await prisma.workshopRegistration.findMany({ where: { workshopId: w.id, status: { in: ['REGISTERED', 'WAITLISTED'] } } });
  const users = await prisma.user.findMany({ where: { id: { in: regs.map((r) => r.userId) } } });
  for (const u of users) {
    await sendEmail({ tenantId: w.tenantId, to: u.email, subject: `Cancelled: ${w.title}`, text: `Hi ${u.name},\n\n"${w.title}" has been cancelled.${input.message ? `\n\n${input.message}` : ''}\n\nIf you paid for this workshop, the creator will process your refund.` });
  }
  await audit({ action: 'workshop.cancel', entityType: 'workshop', entityId: w.id, metadata: { notified: users.length }, req });
  res.json({ ok: true, notified: users.length });
});

workshopsRouter.get('/:workshopId/registrations', can('workshops.write'), async (req, res) => {
  const w = await loadWorkshop(req.tenant!.id, parse(id, req.params.workshopId));
  const regs = await prisma.workshopRegistration.findMany({ where: { workshopId: w.id }, orderBy: { createdAt: 'asc' } });
  const users = await prisma.user.findMany({ where: { id: { in: regs.map((r) => r.userId) } }, select: { id: true, name: true, email: true } });
  res.json({ workshop: w, registrations: regs.map((r) => ({ ...r, user: users.find((u) => u.id === r.userId) })) });
});

workshopsRouter.post('/:workshopId/attendance', can('workshops.write'), async (req, res) => {
  const w = await loadWorkshop(req.tenant!.id, parse(id, req.params.workshopId));
  const input = body(req, z.object({ userIds: z.array(z.string().uuid()).max(5000), attended: z.boolean() }));
  const r = await prisma.workshopRegistration.updateMany({ where: { workshopId: w.id, userId: { in: input.userIds }, status: 'REGISTERED' }, data: { attendedAt: input.attended ? new Date() : null } });
  if (w.status === 'PUBLISHED' && w.endsAt < new Date()) await prisma.workshop.update({ where: { id: w.id }, data: { status: 'COMPLETED' } });
  res.json({ updated: r.count });
});

/** Attach a recording (uploaded media) for replays */
workshopsRouter.post('/:workshopId/recording', can('workshops.write'), async (req, res) => {
  const w = await loadWorkshop(req.tenant!.id, parse(id, req.params.workshopId));
  const input = body(req, z.object({ mediaAssetId: z.string().uuid(), replayEnabled: z.boolean().default(true) }));
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.mediaAssetId, tenantId: req.tenant!.id, deletedAt: null } });
  if (!asset) throw badRequest('Recording file not found');
  res.json({ workshop: await prisma.workshop.update({ where: { id: w.id }, data: { recordingAssetId: asset.id, replayEnabled: input.replayEnabled } }) });
});

// Zoom connection for the workspace
workshopsRouter.get('/integrations/zoom', can('workspace.manage'), async (req, res) => {
  res.json(await describeIntegration(req.tenant!.id, 'ZOOM'));
});

workshopsRouter.put('/integrations/zoom', can('workspace.manage'), async (req, res) => {
  const input = body(req, z.object({ enabled: z.boolean(), accountId: z.string().trim().min(5).max(100), clientId: z.string().trim().min(5).max(100), clientSecret: z.string().max(200).optional() }));
  await saveIntegration(req.tenant!.id, 'ZOOM', { enabled: input.enabled, config: { accountId: input.accountId, clientId: input.clientId }, secrets: { clientSecret: input.clientSecret } }, req.user!.id);
  await audit({ action: 'integration.zoom.update', req });
  res.json(await describeIntegration(req.tenant!.id, 'ZOOM'));
});

// ---------------------------------------------------------------------------
// Public & attendee side
// ---------------------------------------------------------------------------

export const workshopsPublicRouter = Router({ mergeParams: true });
workshopsPublicRouter.use(resolvePublicTenant);

const publicFields = { id: true, title: true, description: true, startsAt: true, endsAt: true, timezone: true, capacity: true, waitlistEnabled: true, productId: true, meetingProvider: true } as const;

workshopsPublicRouter.get('/', async (req, res) => {
  const items = await prisma.workshop.findMany({ where: { tenantId: req.tenant!.id, status: 'PUBLISHED', endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, select: publicFields });
  const counts = await prisma.workshopRegistration.groupBy({ by: ['workshopId'], where: { workshopId: { in: items.map((i) => i.id) }, status: 'REGISTERED' }, _count: true });
  res.json({ items: items.map((w) => ({ ...w, seatsLeft: w.capacity === null ? null : Math.max(0, w.capacity - (counts.find((c) => c.workshopId === w.id)?._count ?? 0)) })) });
});

workshopsPublicRouter.get('/:workshopId', optionalAuth, async (req, res) => {
  const w = await prisma.workshop.findFirst({ where: { id: parse(id, req.params.workshopId), tenantId: req.tenant!.id, status: { in: ['PUBLISHED', 'COMPLETED'] } }, select: publicFields });
  if (!w) throw notFound('Workshop not found');
  const registered = await prisma.workshopRegistration.count({ where: { workshopId: w.id, status: 'REGISTERED' } });
  const mine = req.user ? await prisma.workshopRegistration.findUnique({ where: { workshopId_userId: { workshopId: w.id, userId: req.user.id } } }) : null;
  const product = w.productId ? await prisma.product.findFirst({ where: { id: w.productId, status: 'PUBLISHED' }, select: { slug: true, title: true } }) : null;
  res.json({ workshop: { ...w, seatsLeft: w.capacity === null ? null : Math.max(0, w.capacity - registered) }, registration: mine && { status: mine.status }, product });
});

/** Free workshops: register directly. Paid workshops: requires a purchase (entitlement). */
workshopsPublicRouter.post('/:workshopId/register', requireAuth, async (req, res) => {
  const w = await prisma.workshop.findFirst({ where: { id: parse(id, req.params.workshopId), tenantId: req.tenant!.id, status: 'PUBLISHED' } });
  if (!w) throw notFound('Workshop not found');
  if (w.startsAt < new Date()) throw badRequest('Registration has closed');
  if (w.productId && !(await hasEntitlement(req.user!.id, w.tenantId, 'WORKSHOP', w.id))) throw forbidden('Buy a ticket to register for this workshop');
  const reg = await prisma.$transaction(async (tx) => {
    const r = await registerForWorkshop(tx, w.id, req.user!.id);
    const contact = await upsertContact(tx, w.tenantId, { email: req.user!.email, name: req.user!.name, userId: req.user!.id, source: 'workshop' });
    return { r, contactId: contact.id };
  });
  await dispatchAutomationEvent(w.tenantId, 'workshop.registered', reg.contactId, { key: w.id });
  res.status(201).json({ registration: { status: reg.r.status } });
});

workshopsPublicRouter.post('/:workshopId/cancel', requireAuth, async (req, res) => {
  const w = await prisma.workshop.findFirst({ where: { id: parse(id, req.params.workshopId), tenantId: req.tenant!.id } });
  if (!w) throw notFound('Workshop not found');
  const r = await prisma.$transaction((tx) => cancelRegistration(tx, w.id, req.user!.id));
  if (!r) throw badRequest('You are not registered');
  res.json({ ok: true });
});

/** Attendee view: join links are revealed only to registered attendees */
export const myWorkshopsRouter = Router();

myWorkshopsRouter.get('/', requireAuth, async (req, res) => {
  const regs = await prisma.workshopRegistration.findMany({ where: { userId: req.user!.id, status: { not: 'CANCELED' } }, include: { workshop: true }, orderBy: { workshop: { startsAt: 'asc' } } });
  const tenants = await prisma.tenant.findMany({ where: { id: { in: regs.map((r) => r.tenantId) } }, select: { id: true, name: true, slug: true } });
  res.json({
    items: regs.map((r) => ({
      status: r.status,
      tenant: tenants.find((t) => t.id === r.tenantId),
      workshop: {
        id: r.workshop.id,
        title: r.workshop.title,
        startsAt: r.workshop.startsAt,
        endsAt: r.workshop.endsAt,
        timezone: r.workshop.timezone,
        status: r.workshop.status,
        meetingUrl: r.status === 'REGISTERED' && r.workshop.status === 'PUBLISHED' ? r.workshop.meetingUrl : null,
        replayUrl: r.status === 'REGISTERED' && r.workshop.replayEnabled && r.workshop.recordingAssetId ? signMediaUrl(r.workshop.recordingAssetId, req.user!.id, 4 * 3600) : null,
      },
    })),
  });
});

myWorkshopsRouter.get('/:workshopId/calendar.ics', requireAuth, async (req, res) => {
  const reg = await prisma.workshopRegistration.findFirst({ where: { workshopId: parse(id, req.params.workshopId), userId: req.user!.id, status: 'REGISTERED' }, include: { workshop: true } });
  if (!reg) throw notFound();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: reg.tenantId } });
  res.type('text/calendar').set('content-disposition', 'attachment; filename="workshop.ics"').send(workshopIcs(reg.workshop, tenant.name));
});
