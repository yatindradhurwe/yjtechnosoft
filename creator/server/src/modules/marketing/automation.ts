import { z } from 'zod';
import type { AutomationExecution, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../services/email';
import { sendWhatsappTemplate } from '../../services/whatsapp';
import { renderTemplate, unsubscribeUrl } from './unsubscribe';

// ---------------------------------------------------------------------------
// Workflow definition (validated on save)
// ---------------------------------------------------------------------------

export const TRIGGER_EVENTS = ['order.paid', 'lead.created', 'tag.added', 'course.completed', 'checkout.abandoned', 'learner.inactive', 'workshop.registered'] as const;

export const triggerSchema = z.object({
  event: z.enum(TRIGGER_EVENTS),
  productId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  tag: z.string().max(40).optional(),
});

export const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delay'), minutes: z.number().int().min(1).max(60 * 24 * 60) }),
  z.object({ type: z.literal('send_email'), subject: z.string().min(1).max(200), body: z.string().min(1).max(20000) }),
  z.object({ type: z.literal('send_whatsapp'), template: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string().max(10).default('en'), params: z.array(z.string().max(200)).max(10).default([]) }),
  z.object({ type: z.literal('add_tag'), tag: z.string().min(1).max(40) }),
  z.object({ type: z.literal('remove_tag'), tag: z.string().min(1).max(40) }),
  /** Stops the workflow for this contact unless the condition holds */
  z.object({ type: z.literal('condition'), check: z.enum(['has_tag', 'not_has_tag', 'has_purchased', 'not_purchased']), value: z.string().max(60) }),
]);

export const workflowSchema = z.object({
  name: z.string().trim().min(2).max(100),
  trigger: triggerSchema,
  steps: z.array(stepSchema).min(1).max(30),
});

type Step = z.infer<typeof stepSchema>;
type Trigger = z.infer<typeof triggerSchema>;

// ---------------------------------------------------------------------------
// Triggering
// ---------------------------------------------------------------------------

/**
 * Start matching ACTIVE workflows for a contact. The idempotency key makes a
 * repeated event (webhook retry, sweep overlap) start each workflow only once.
 */
export async function dispatchAutomationEvent(tenantId: string, event: (typeof TRIGGER_EVENTS)[number], contactId: string, data: Record<string, string | undefined> = {}) {
  const workflows = await prisma.automationWorkflow.findMany({ where: { tenantId, status: 'ACTIVE' } });
  const matching = workflows.filter((w) => {
    const t = w.trigger as Trigger;
    if (t.event !== event) return false;
    if (t.productId && t.productId !== data.productId) return false;
    if (t.courseId && t.courseId !== data.courseId) return false;
    if (t.tag && t.tag !== data.tag) return false;
    return true;
  });
  if (!matching.length) return 0;
  const dedupe = data.orderId ?? data.key ?? data.tag ?? data.courseId ?? 'once';
  const r = await prisma.automationExecution.createMany({
    data: matching.map((w) => ({ tenantId, workflowId: w.id, contactId, idempotencyKey: `${w.id}:${contactId}:${event}:${dedupe}`, status: 'RUNNING' as const, nextRunAt: new Date() })),
    skipDuplicates: true,
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// Execution engine
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 5;

async function hasPurchased(tenantId: string, userId: string | null, productId: string) {
  if (!userId) return false;
  return (await prisma.order.count({ where: { tenantId, userId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, items: { some: { productId } } } })) > 0;
}

async function setTag(tenantId: string, contactId: string, name: string, add: boolean) {
  const tag = await prisma.tag.upsert({ where: { tenantId_name: { tenantId, name } }, create: { tenantId, name }, update: {} });
  if (add) await prisma.contactTag.upsert({ where: { contactId_tagId: { contactId, tagId: tag.id } }, create: { contactId, tagId: tag.id }, update: {} });
  else await prisma.contactTag.deleteMany({ where: { contactId, tagId: tag.id } });
}

type StepResult = { outcome: 'continue' } | { outcome: 'wait'; until: Date } | { outcome: 'stop'; note: string };

async function runStep(exec: AutomationExecution, step: Step): Promise<StepResult> {
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: exec.contactId }, include: { tags: { include: { tag: true } } } });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: exec.tenantId } });
  const vars = { name: contact.name ?? '', first_name: (contact.name ?? '').split(' ')[0], email: contact.email, store_url: `${env.APP_URL}/s/${tenant.slug}` };
  switch (step.type) {
    case 'delay':
      return { outcome: 'wait', until: new Date(Date.now() + step.minutes * 60_000) };
    case 'send_email': {
      // Consent and suppression are re-checked at send time
      const suppressed = await prisma.suppression.findUnique({ where: { tenantId_channel_address: { tenantId: exec.tenantId, channel: 'EMAIL', address: contact.email } } });
      if (contact.unsubscribedAt || suppressed) return { outcome: 'continue' };
      const unsub = unsubscribeUrl(exec.tenantId, contact.id);
      const r = await sendEmail({
        tenantId: exec.tenantId,
        contactId: contact.id,
        to: contact.email,
        fromName: tenant.name,
        subject: renderTemplate(step.subject, vars),
        text: `${renderTemplate(step.body, vars)}\n\n—\nUnsubscribe: ${unsub}`,
        unsubscribeUrl: unsub,
      });
      if (r.status === 'FAILED') throw new Error(`Email failed: ${r.error}`);
      return { outcome: 'continue' };
    }
    case 'send_whatsapp': {
      if (!contact.phone || !contact.consentWhatsapp || contact.unsubscribedAt) return { outcome: 'continue' };
      const r = await sendWhatsappTemplate({ tenantId: exec.tenantId, contactId: contact.id, to: contact.phone, template: step.template, language: step.language, params: step.params.map((p) => renderTemplate(p, vars)) });
      if (r.status === 'FAILED') throw new Error(`WhatsApp failed: ${r.error}`);
      return { outcome: 'continue' };
    }
    case 'add_tag':
    case 'remove_tag':
      await setTag(exec.tenantId, contact.id, step.tag, step.type === 'add_tag');
      return { outcome: 'continue' };
    case 'condition': {
      const tags = contact.tags.map((t) => t.tag.name);
      let ok = false;
      if (step.check === 'has_tag') ok = tags.includes(step.value);
      if (step.check === 'not_has_tag') ok = !tags.includes(step.value);
      if (step.check === 'has_purchased') ok = await hasPurchased(exec.tenantId, contact.userId, step.value);
      if (step.check === 'not_purchased') ok = !(await hasPurchased(exec.tenantId, contact.userId, step.value));
      return ok ? { outcome: 'continue' } : { outcome: 'stop', note: `Condition ${step.check} ${step.value} not met` };
    }
  }
}

function historyEntry(index: number, type: string, status: string, note?: string) {
  return { at: new Date().toISOString(), step: index, type, status, note };
}

/** Advance one execution as far as possible. Retries with backoff on failure. */
export async function advanceExecution(exec: AutomationExecution) {
  const workflow = await prisma.automationWorkflow.findUniqueOrThrow({ where: { id: exec.workflowId } });
  const steps = workflow.steps as Step[];
  const history = [...(exec.history as Prisma.JsonArray)];
  let index = exec.stepIndex;
  // A delay step that has elapsed is complete
  if (exec.status === 'WAITING') {
    history.push(historyEntry(index, 'delay', 'done'));
    index += 1;
  }
  try {
    if (workflow.status !== 'ACTIVE') {
      await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'COMPLETED', history: [...history, historyEntry(index, 'workflow', 'stopped', 'Workflow paused')], nextRunAt: null } });
      return;
    }
    while (index < steps.length) {
      const step = steps[index];
      const result = await runStep(exec, step);
      if (result.outcome === 'wait') {
        await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'WAITING', stepIndex: index, nextRunAt: result.until, history, attempts: 0 } });
        return;
      }
      if (result.outcome === 'stop') {
        history.push(historyEntry(index, step.type, 'stopped', result.note));
        break;
      }
      history.push(historyEntry(index, step.type, 'done'));
      index += 1;
      // Persist after each side-effecting step so a crash never repeats it
      await prisma.automationExecution.update({ where: { id: exec.id }, data: { stepIndex: index, history, attempts: 0 } });
    }
    await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'COMPLETED', stepIndex: index, history, nextRunAt: null, lastError: null } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempts = exec.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    history.push(historyEntry(index, steps[index]?.type ?? '?', failed ? 'failed' : 'retry', msg));
    await prisma.automationExecution.update({
      where: { id: exec.id },
      data: { status: failed ? 'FAILED' : 'RUNNING', stepIndex: index, attempts, lastError: msg, history, nextRunAt: failed ? null : new Date(Date.now() + 2 ** attempts * 60_000) },
    });
    logger.warn({ execution: exec.id, err: msg }, 'automation step failed');
  }
}

export async function runDueExecutions(limit = 50) {
  await emitTimeBasedEvents();
  // Claim due executions atomically so parallel workers do not double-send
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "AutomationExecution" SET "nextRunAt" = now() + interval '10 minutes'
    WHERE id IN (
      SELECT id FROM "AutomationExecution"
      WHERE status IN ('RUNNING','WAITING') AND "nextRunAt" <= now()
      ORDER BY "nextRunAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  for (const { id } of claimed) {
    const exec = await prisma.automationExecution.findUniqueOrThrow({ where: { id } });
    await advanceExecution(exec);
  }
  return claimed.length;
}

/** Abandoned checkouts (1h old, unpaid, no later purchase) and inactive learners (7 days) */
async function emitTimeBasedEvents() {
  const hasWorkflows = await prisma.automationWorkflow.findMany({ where: { status: 'ACTIVE' }, select: { tenantId: true, trigger: true } });
  const wants = (event: string) => [...new Set(hasWorkflows.filter((w) => (w.trigger as Trigger).event === event).map((w) => w.tenantId))];

  for (const tenantId of wants('checkout.abandoned')) {
    const stale = await prisma.order.findMany({
      where: { tenantId, status: { in: ['PENDING', 'FAILED'] }, createdAt: { lte: new Date(Date.now() - 3600_000), gte: new Date(Date.now() - 3 * 86400_000) } },
      include: { items: true },
      take: 200,
    });
    for (const o of stale) {
      const bought = await prisma.order.count({ where: { tenantId, userId: o.userId, status: 'PAID', items: { some: { productId: o.items[0]?.productId } } } });
      if (bought) continue;
      const contact = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId, email: o.buyerEmail } } });
      if (contact) await dispatchAutomationEvent(tenantId, 'checkout.abandoned', contact.id, { productId: o.items[0]?.productId, orderId: o.id });
    }
  }

  for (const tenantId of wants('learner.inactive')) {
    const week = Math.floor(Date.now() / (7 * 86400_000));
    const cutoff = new Date(Date.now() - 7 * 86400_000);
    const idle = await prisma.enrollment.findMany({
      where: { tenantId, status: 'ACTIVE', enrolledAt: { lte: cutoff }, progress: { none: { updatedAt: { gt: cutoff } } } },
      include: { user: true },
      take: 500,
    });
    for (const e of idle) {
      const contact = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId, email: e.user.email } } });
      if (contact) await dispatchAutomationEvent(tenantId, 'learner.inactive', contact.id, { courseId: e.courseId, key: `${e.courseId}:w${week}` });
    }
  }
}
