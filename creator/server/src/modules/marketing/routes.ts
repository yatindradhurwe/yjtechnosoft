import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { body, email, pageArgs, pagination, parse, query } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { assertFeature } from '../../services/plans';
import { describeIntegration, saveIntegration } from '../../services/integrations';
import { upsertContact } from '../customers/service';
import { audienceWhere, Audience } from './campaigns';
import { dispatchAutomationEvent, workflowSchema } from './automation';
import { verifyUnsubscribe } from './unsubscribe';

export const marketingRouter = Router();
marketingRouter.use(requireAuth, requireTenantStaff);

const id = z.string().uuid();

// ---- Contacts: create, tag, import ----

marketingRouter.post('/contacts', can('customers.write'), async (req, res) => {
  const input = body(
    req,
    z.object({
      email,
      name: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      consentEmail: z.boolean().default(false),
      consentWhatsapp: z.boolean().default(false),
      customFields: z.record(z.string().max(500)).default({}),
    }),
  );
  const c = await upsertContact(prisma, req.tenant!.id, { email: input.email, name: input.name, phone: input.phone, source: 'manual', consentEmail: input.consentEmail });
  await prisma.contact.update({ where: { id: c.id }, data: { customFields: input.customFields, consentWhatsapp: input.consentWhatsapp } });
  for (const t of input.tags) await upsertContact(prisma, req.tenant!.id, { email: input.email, tag: t });
  res.status(201).json({ contact: c });
});

marketingRouter.patch('/contacts/:contactId', can('customers.write'), async (req, res) => {
  const c = await prisma.contact.findFirst({ where: { id: parse(id, req.params.contactId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Contact not found');
  const input = body(
    req,
    z.object({
      name: z.string().trim().max(100).nullable().optional(),
      phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/).nullable().optional(),
      customFields: z.record(z.string().max(500)).optional(),
      consentWhatsapp: z.boolean().optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    }),
  );
  const { tags, ...data } = input;
  await prisma.contact.update({ where: { id: c.id }, data });
  if (tags) {
    await prisma.contactTag.deleteMany({ where: { contactId: c.id } });
    for (const t of tags) {
      await upsertContact(prisma, req.tenant!.id, { email: c.email, tag: t });
      await dispatchAutomationEvent(req.tenant!.id, 'tag.added', c.id, { tag: t });
    }
  }
  res.json({ ok: true });
});

marketingRouter.delete('/contacts/:contactId', can('customers.write'), async (req, res) => {
  const c = await prisma.contact.findFirst({ where: { id: parse(id, req.params.contactId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Contact not found');
  await prisma.contact.delete({ where: { id: c.id } });
  await audit({ action: 'contact.delete', entityType: 'contact', entityId: c.id, req });
  res.json({ ok: true });
});

/**
 * CSV import (sent as text). Columns: email,name,phone,tags (tags separated by |).
 * Rows are validated individually; invalid rows are reported, not imported.
 * Imported contacts get email consent only when the creator confirms they have it.
 */
marketingRouter.post('/contacts/import', can('customers.write'), async (req, res) => {
  const input = body(req, z.object({ csv: z.string().max(5_000_000), consentConfirmed: z.boolean(), tag: z.string().trim().max(40).optional() }));
  const lines = input.csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw badRequest('The file is empty');
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const col = (n: string) => header.indexOf(n);
  if (col('email') < 0) throw badRequest('The first row must contain an "email" column');
  if (lines.length > 20001) throw badRequest('Import up to 20,000 rows at a time');
  const errors: { row: number; error: string }[] = [];
  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? [];
    const parsed = z
      .object({ email, name: z.string().max(100).optional(), phone: z.string().max(20).regex(/^[+\d\s-]*$/).optional() })
      .safeParse({ email: cells[col('email')], name: cells[col('name')] || undefined, phone: cells[col('phone')] || undefined });
    if (!parsed.success) {
      errors.push({ row: i + 1, error: parsed.error.issues[0].message });
      continue;
    }
    const tags = [...(col('tags') >= 0 && cells[col('tags')] ? cells[col('tags')].split('|') : []), ...(input.tag ? [input.tag] : [])].map((t) => t.trim()).filter(Boolean).slice(0, 10);
    await upsertContact(prisma, req.tenant!.id, { ...parsed.data, source: 'import', consentEmail: input.consentConfirmed });
    for (const t of tags) await upsertContact(prisma, req.tenant!.id, { email: parsed.data.email, tag: t.slice(0, 40) });
    imported++;
  }
  await audit({ action: 'contacts.import', metadata: { imported, failed: errors.length }, req });
  res.json({ imported, failed: errors.length, errors: errors.slice(0, 100) });
});

marketingRouter.get('/tags', can('customers.read'), async (req, res) => {
  const tags = await prisma.tag.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { name: 'asc' }, include: { _count: { select: { contacts: true } } } });
  res.json({ tags: tags.map((t) => ({ id: t.id, name: t.name, contacts: t._count.contacts })) });
});

// ---- Campaigns ----

const campaignSchema = z
  .object({
    channel: z.enum(['EMAIL', 'WHATSAPP']),
    name: z.string().trim().min(2).max(120),
    /** EMAIL: subject line. WHATSAPP: template language code */
    subject: z.string().trim().max(200).optional(),
    /** EMAIL: plain-text body with {{merge}} fields. WHATSAPP: approved template name */
    body: z.string().trim().min(1).max(50000),
    audience: z.object({ tags: z.array(z.string().max(40)).max(20).optional() }).default({}),
  })
  .refine((c) => c.channel !== 'EMAIL' || !!c.subject, 'Email campaigns need a subject')
  .refine((c) => c.channel !== 'WHATSAPP' || /^[a-z0-9_]{1,512}$/.test(c.body), 'Use the approved WhatsApp template name');

marketingRouter.get('/campaigns', can('customers.read'), async (req, res) => {
  const campaigns = await prisma.campaign.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' } });
  const stats = await prisma.messageLog.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: true });
  res.json({
    campaigns: campaigns.map((c) => ({
      ...c,
      stats: Object.fromEntries(stats.filter((s) => s.campaignId === c.id).map((s) => [s.status.toLowerCase(), s._count])),
    })),
  });
});

marketingRouter.post('/campaigns', can('marketing.write'), async (req, res) => {
  const input = body(req, campaignSchema);
  const campaign = await prisma.campaign.create({ data: { ...input, tenantId: req.tenant!.id } });
  res.status(201).json({ campaign });
});

marketingRouter.put('/campaigns/:campaignId', can('marketing.write'), async (req, res) => {
  const c = await prisma.campaign.findFirst({ where: { id: parse(id, req.params.campaignId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Campaign not found');
  if (c.status !== 'DRAFT') throw badRequest('Only draft campaigns can be edited');
  res.json({ campaign: await prisma.campaign.update({ where: { id: c.id }, data: body(req, campaignSchema) }) });
});

marketingRouter.get('/campaigns/:campaignId/audience', can('customers.read'), async (req, res) => {
  const c = await prisma.campaign.findFirst({ where: { id: parse(id, req.params.campaignId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Campaign not found');
  res.json({ recipients: await prisma.contact.count({ where: audienceWhere(c.tenantId, c.channel, c.audience as Audience) }) });
});

/** Schedule (or send now). Actual sending happens in the background worker. */
marketingRouter.post('/campaigns/:campaignId/schedule', can('marketing.write'), async (req, res) => {
  const input = body(req, z.object({ sendAt: z.coerce.date().optional() }));
  const c = await prisma.campaign.findFirst({ where: { id: parse(id, req.params.campaignId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Campaign not found');
  if (c.status !== 'DRAFT') throw badRequest('This campaign has already been scheduled or sent');
  const recipients = await prisma.contact.count({ where: audienceWhere(c.tenantId, c.channel, c.audience as Audience) });
  if (!recipients) throw badRequest('No contacts match this audience with consent for this channel');
  const updated = await prisma.campaign.update({ where: { id: c.id }, data: { status: 'SCHEDULED', scheduledAt: input.sendAt ?? new Date() } });
  await audit({ action: 'campaign.schedule', entityType: 'campaign', entityId: c.id, metadata: { recipients, sendAt: updated.scheduledAt }, req });
  res.json({ campaign: updated, recipients });
});

marketingRouter.post('/campaigns/:campaignId/cancel', can('marketing.write'), async (req, res) => {
  const r = await prisma.campaign.updateMany({ where: { id: parse(id, req.params.campaignId), tenantId: req.tenant!.id, status: 'SCHEDULED' }, data: { status: 'CANCELED' } });
  if (!r.count) throw badRequest('Only scheduled campaigns can be cancelled');
  res.json({ ok: true });
});

marketingRouter.get('/messages', can('customers.read'), async (req, res) => {
  const p = query(req, pagination.extend({ campaignId: z.string().uuid().optional(), status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']).optional() }));
  const where = { tenantId: req.tenant!.id, campaignId: p.campaignId, status: p.status };
  const [items, total] = await Promise.all([prisma.messageLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p) }), prisma.messageLog.count({ where })]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

// ---- Automation workflows ----

marketingRouter.get('/workflows', can('customers.read'), async (req, res) => {
  const workflows = await prisma.automationWorkflow.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' } });
  const counts = await prisma.automationExecution.groupBy({ by: ['workflowId', 'status'], where: { tenantId: req.tenant!.id }, _count: true });
  res.json({ workflows: workflows.map((w) => ({ ...w, executions: Object.fromEntries(counts.filter((c) => c.workflowId === w.id).map((c) => [c.status.toLowerCase(), c._count])) })) });
});

marketingRouter.post('/workflows', can('marketing.write'), async (req, res) => {
  await assertFeature(req.tenant!.id, 'automations');
  const input = body(req, workflowSchema);
  const wf = await prisma.automationWorkflow.create({ data: { ...input, tenantId: req.tenant!.id } });
  res.status(201).json({ workflow: wf });
});

marketingRouter.put('/workflows/:workflowId', can('marketing.write'), async (req, res) => {
  const wf = await prisma.automationWorkflow.findFirst({ where: { id: parse(id, req.params.workflowId), tenantId: req.tenant!.id } });
  if (!wf) throw notFound('Workflow not found');
  const input = body(req, workflowSchema.extend({ status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED']).optional() }));
  const updated = await prisma.automationWorkflow.update({ where: { id: wf.id }, data: input });
  await audit({ action: 'workflow.update', entityType: 'workflow', entityId: wf.id, metadata: { status: updated.status }, req });
  res.json({ workflow: updated });
});

marketingRouter.get('/workflows/:workflowId/executions', can('customers.read'), async (req, res) => {
  const wf = await prisma.automationWorkflow.findFirst({ where: { id: parse(id, req.params.workflowId), tenantId: req.tenant!.id } });
  if (!wf) throw notFound('Workflow not found');
  const items = await prisma.automationExecution.findMany({ where: { workflowId: wf.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  const contacts = await prisma.contact.findMany({ where: { id: { in: items.map((i) => i.contactId) } }, select: { id: true, email: true, name: true } });
  res.json({ items: items.map((i) => ({ ...i, contact: contacts.find((c) => c.id === i.contactId) })) });
});

marketingRouter.delete('/workflows/:workflowId', can('marketing.write'), async (req, res) => {
  const r = await prisma.automationWorkflow.deleteMany({ where: { id: parse(id, req.params.workflowId), tenantId: req.tenant!.id } });
  if (!r.count) throw notFound('Workflow not found');
  res.json({ ok: true });
});

// ---- Suppression list ----

marketingRouter.get('/suppressions', can('customers.read'), async (req, res) => {
  res.json({ items: await prisma.suppression.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' }, take: 500 }) });
});

marketingRouter.post('/suppressions', can('marketing.write'), async (req, res) => {
  const input = body(req, z.object({ channel: z.enum(['EMAIL', 'WHATSAPP']), address: z.string().trim().toLowerCase().min(3).max(200), reason: z.string().max(200).optional() }));
  await prisma.suppression.upsert({ where: { tenantId_channel_address: { tenantId: req.tenant!.id, ...input } }, create: { tenantId: req.tenant!.id, ...input }, update: { reason: input.reason } });
  res.status(201).json({ ok: true });
});

// ---- WhatsApp connection (per workspace) ----

marketingRouter.get('/whatsapp', can('workspace.manage'), async (req, res) => {
  res.json(await describeIntegration(req.tenant!.id, 'WHATSAPP'));
});

marketingRouter.put('/whatsapp', can('workspace.manage'), async (req, res) => {
  const input = body(
    req,
    z.object({
      enabled: z.boolean(),
      phoneNumberId: z.string().regex(/^\d{5,30}$/, 'Phone number ID from the Meta developer console'),
      businessAccountId: z.string().regex(/^\d{5,30}$/).optional(),
      accessToken: z.string().max(1000).optional(),
    }),
  );
  await saveIntegration(req.tenant!.id, 'WHATSAPP', { enabled: input.enabled, config: { phoneNumberId: input.phoneNumberId, businessAccountId: input.businessAccountId ?? '' }, secrets: { accessToken: input.accessToken } }, req.user!.id);
  await audit({ action: 'integration.whatsapp.update', metadata: { enabled: input.enabled }, req });
  res.json(await describeIntegration(req.tenant!.id, 'WHATSAPP'));
});

// ---- Public unsubscribe (one-click, signed link) ----

export const unsubscribeRouter = Router();

async function doUnsubscribe(t: string, c: string, s: string) {
  if (!t || !c || !s || !verifyUnsubscribe(t, c, s)) throw badRequest('This unsubscribe link is invalid');
  const contact = await prisma.contact.findFirst({ where: { id: c, tenantId: t } });
  if (!contact) throw notFound();
  await prisma.contact.update({ where: { id: c }, data: { unsubscribedAt: new Date(), consentEmail: false } });
  await prisma.suppression.upsert({
    where: { tenantId_channel_address: { tenantId: t, channel: 'EMAIL', address: contact.email } },
    create: { tenantId: t, channel: 'EMAIL', address: contact.email, reason: 'unsubscribed' },
    update: {},
  });
}

unsubscribeRouter.get('/', async (req, res) => {
  const { t, c, s } = req.query as Record<string, string>;
  await doUnsubscribe(t, c, s);
  res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribed</title><body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:0 16px"><h1>You have been unsubscribed</h1><p>You will no longer receive marketing emails from this creator.</p></body>');
});

/** RFC 8058 one-click unsubscribe (mail clients POST to the List-Unsubscribe URL) */
unsubscribeRouter.post('/', async (req, res) => {
  const { t, c, s } = req.query as Record<string, string>;
  await doUnsubscribe(t, c, s);
  res.json({ ok: true });
});
