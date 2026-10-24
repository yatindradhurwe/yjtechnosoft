import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { enqueueJob, registerJob } from '../services/jobs';
import { sendEmail } from '../services/email';
import { grantEntitlement } from '../modules/commerce/fulfilment';
import { dispatchAutomationEvent, runDueExecutions } from '../modules/marketing/automation';
import { sendDueCampaigns } from '../modules/marketing/campaigns';
import { sendWorkshopReminders } from '../modules/workshops/service';

const GRACE_DAYS = 3;
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);

export function registerJobs() {
  /** Receipt to the buyer, notification to the owner, and automation triggers */
  registerJob('order.paid', async ({ orderId }) => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: String(orderId) }, include: { items: true, invoice: true, tenant: true } });
    await sendEmail({
      tenantId: order.tenantId,
      to: order.buyerEmail,
      fromName: order.tenant.name,
      subject: `Your receipt from ${order.tenant.name} (order #${order.number})`,
      text: [
        `Hi ${order.buyerName},`,
        '',
        `Thank you for your purchase from ${order.tenant.name}.`,
        ...order.items.map((i) => `• ${i.title} – ${money(i.total, order.currency)}`),
        `Total paid: ${money(order.total, order.currency)}${order.taxAmount ? ` (incl. tax ${money(order.taxAmount, order.currency)})` : ''}`,
        order.invoice ? `Invoice: ${order.invoice.number}` : '',
        '',
        `Access your purchase: ${env.APP_URL}/learn`,
      ].join('\n'),
    });
    await prisma.notification.create({
      data: { tenantId: order.tenantId, userId: order.tenant.ownerId, type: 'order.paid', title: `New sale: ${money(order.total, order.currency)}`, body: `${order.buyerName} bought ${order.items.map((i) => i.title).join(', ')}`, link: `/orders/${order.id}` },
    });
    const contact = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId: order.tenantId, email: order.buyerEmail } } });
    if (contact) {
      for (const item of order.items) {
        await dispatchAutomationEvent(order.tenantId, 'order.paid', contact.id, { productId: item.productId, orderId: order.id });
      }
    }
  });

  registerJob('subscription.renewal_reminder', async ({ subscriptionId }) => {
    const sub = await prisma.customerSubscription.findUnique({ where: { id: String(subscriptionId) } });
    if (!sub || sub.cancelAtPeriodEnd || !['ACTIVE', 'GRACE'].includes(sub.status)) return;
    const [user, product, tenant] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: sub.userId } }),
      prisma.product.findUniqueOrThrow({ where: { id: sub.productId } }),
      prisma.tenant.findUniqueOrThrow({ where: { id: sub.tenantId } }),
    ]);
    await sendEmail({
      tenantId: sub.tenantId,
      to: user.email,
      fromName: tenant.name,
      subject: `Your ${product.title} membership renews soon`,
      text: `Hi ${user.name},\n\nYour access to ${product.title} runs until ${sub.currentPeriodEnd.toDateString()}.\nRenew here to keep your access: ${env.APP_URL}/s/${tenant.slug}/p/${product.slug}\n`,
    });
  });
}

/**
 * Time-based sweeps (every few minutes). Each step is idempotent so overlapping
 * runs from several processes are harmless.
 */
export async function runSweeps() {
  const now = new Date();

  // 1. Scheduled courses go live
  await prisma.course.updateMany({ where: { status: 'SCHEDULED', publishAt: { lte: now }, deletedAt: null }, data: { status: 'PUBLISHED' } });

  // 2. Renewal reminders 3 days before the period ends
  const soon = await prisma.customerSubscription.findMany({
    where: { status: 'ACTIVE', cancelAtPeriodEnd: false, currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 3 * 86400_000) } },
    take: 500,
  });
  for (const s of soon) {
    await enqueueJob(prisma, 'subscription.renewal_reminder', { subscriptionId: s.id }, `renewal-reminder:${s.id}:${s.currentPeriodEnd.toISOString()}`);
  }

  // 3. Period ended → grace period with temporary access (unless cancelled)
  const ended = await prisma.customerSubscription.findMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lte: now } }, take: 500 });
  for (const s of ended) {
    if (s.cancelAtPeriodEnd) {
      await prisma.customerSubscription.update({ where: { id: s.id }, data: { status: 'CANCELED', canceledAt: now } });
      continue;
    }
    const graceUntil = new Date(s.currentPeriodEnd.getTime() + GRACE_DAYS * 86400_000);
    await prisma.$transaction(async (tx) => {
      const moved = await tx.customerSubscription.updateMany({ where: { id: s.id, status: 'ACTIVE' }, data: { status: 'GRACE', graceUntil } });
      if (!moved.count) return;
      const product = await tx.product.findUniqueOrThrow({ where: { id: s.productId }, include: { items: true } });
      const base = { tenantId: s.tenantId, userId: s.userId, sourceType: 'SUBSCRIPTION' as const, sourceId: s.id, expiresAt: graceUntil };
      await grantEntitlement(tx, { ...base, resourceType: 'MEMBERSHIP', resourceId: product.id });
      for (const it of product.items) await grantEntitlement(tx, { ...base, resourceType: it.resourceType, resourceId: it.resourceId });
    });
  }

  // 4. Grace over → expired (access already lapses via entitlement.expiresAt)
  await prisma.customerSubscription.updateMany({ where: { status: 'GRACE', graceUntil: { lte: now } }, data: { status: 'EXPIRED' } });
  await prisma.entitlement.updateMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } });

  // 5. Marketing: scheduled campaigns, automation steps, workshop reminders
  await sendDueCampaigns();
  await runDueExecutions();
  await sendWorkshopReminders();
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startSweeps(intervalMs = 5 * 60_000) {
  const tick = () => runSweeps().catch((e) => logger.error({ err: e }, 'sweep failed'));
  sweepTimer = setInterval(tick, intervalMs);
  void tick();
}
export function stopSweeps() {
  if (sweepTimer) clearInterval(sweepTimer);
}
