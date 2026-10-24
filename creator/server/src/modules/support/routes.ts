import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { body, parse } from '../../lib/validate';
import { requireAuth, requirePlatformRole } from '../../middleware/auth';
import { audit } from '../../services/audit';
import { sendEmail } from '../../services/email';

const id = z.string().uuid();

/** Users (creators) open tickets with platform support */
export const supportRouter = Router();
supportRouter.use(requireAuth);

supportRouter.get('/', async (req, res) => {
  res.json({ tickets: await prisma.supportTicket.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' } }) });
});

supportRouter.post('/', async (req, res) => {
  const input = body(req, z.object({ subject: z.string().trim().min(3).max(150), body: z.string().trim().min(5).max(10000), tenantId: z.string().uuid().optional(), priority: z.enum(['low', 'normal', 'high']).default('normal') }));
  if (input.tenantId) {
    const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: input.tenantId, userId: req.user!.id } } });
    if (!m) input.tenantId = undefined;
  }
  const t = await prisma.supportTicket.create({
    data: { userId: req.user!.id, tenantId: input.tenantId, subject: input.subject, priority: input.priority, messages: { create: { authorId: req.user!.id, body: input.body } } },
  });
  res.status(201).json({ ticket: t });
});

supportRouter.get('/:ticketId', async (req, res) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: parse(id, req.params.ticketId), userId: req.user!.id }, include: { messages: { where: { internal: false }, orderBy: { createdAt: 'asc' } } } });
  if (!t) throw notFound('Ticket not found');
  res.json({ ticket: t });
});

supportRouter.post('/:ticketId/messages', async (req, res) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: parse(id, req.params.ticketId), userId: req.user!.id } });
  if (!t) throw notFound('Ticket not found');
  const input = body(req, z.object({ body: z.string().trim().min(1).max(10000) }));
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: t.id, authorId: req.user!.id, body: input.body } }),
    prisma.supportTicket.update({ where: { id: t.id }, data: { status: 'OPEN' } }),
  ]);
  res.status(201).json({ ok: true });
});

/** Platform support desk */
export const supportAdminRouter = Router();
supportAdminRouter.use(requireAuth, requirePlatformRole('SUPPORT'));

supportAdminRouter.get('/', async (req, res) => {
  const status = parse(z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(), req.query.status);
  const tickets = await prisma.supportTicket.findMany({ where: { status }, orderBy: { updatedAt: 'desc' }, take: 200 });
  const users = await prisma.user.findMany({ where: { id: { in: tickets.map((t) => t.userId) } }, select: { id: true, name: true, email: true } });
  res.json({ tickets: tickets.map((t) => ({ ...t, user: users.find((u) => u.id === t.userId) })) });
});

supportAdminRouter.get('/:ticketId', async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: parse(id, req.params.ticketId) }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!t) throw notFound();
  const user = await prisma.user.findUnique({ where: { id: t.userId }, select: { id: true, name: true, email: true } });
  res.json({ ticket: t, user });
});

supportAdminRouter.post('/:ticketId/reply', async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: parse(id, req.params.ticketId) } });
  if (!t) throw notFound();
  const input = body(req, z.object({ body: z.string().trim().min(1).max(10000), internal: z.boolean().default(false), status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional() }));
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: t.id, authorId: req.user!.id, body: input.body, internal: input.internal } }),
    prisma.supportTicket.update({ where: { id: t.id }, data: { status: input.status ?? (input.internal ? t.status : 'PENDING') } }),
  ]);
  if (!input.internal) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: t.userId } });
    await sendEmail({ to: u.email, subject: `Re: ${t.subject}`, text: `${input.body}\n\n— Support team` });
  }
  await audit({ action: 'support.reply', entityType: 'ticket', entityId: t.id, metadata: { internal: input.internal }, req });
  res.json({ ok: true });
});
