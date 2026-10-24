import type { Payment, Refund } from '@prisma/client';
import { prisma, Tx } from '../../lib/prisma';
import { nextNumber } from '../../lib/counter';
import { logger } from '../../lib/logger';
import { audit } from '../../services/audit';
import { tenantPlan } from '../../services/plans';
import { enqueueJob } from '../../services/jobs';
import { fulfilOrder, revokeEntitlement } from './fulfilment';
import { splitGst } from './pricing';
import { upsertContact } from '../customers/service';
import { recordCommission, reverseCommission } from '../affiliates/service';

export interface CaptureInput {
  paymentId: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  gatewayFee?: number;
  source: string;
}

export type CaptureResult = 'captured' | 'already_captured' | 'amount_mismatch';

/**
 * Marks a payment captured and fulfils its order. Only ever called after the
 * provider has confirmed the payment server-side (verified webhook or a
 * server-to-server API lookup) – never from a browser redirect alone.
 *
 * Idempotent: the conditional status update means concurrent or repeated
 * deliveries capture at most once.
 */
export async function capturePayment(input: CaptureInput): Promise<CaptureResult> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId }, include: { order: true } });
    if (payment.status === 'CAPTURED' || payment.status === 'REFUNDED' || payment.status === 'PARTIALLY_REFUNDED') return 'already_captured';
    if (input.amount !== payment.amount || input.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      logger.error({ paymentId: payment.id, expected: payment.amount, got: input.amount }, 'payment amount mismatch – not fulfilling');
      await tx.payment.update({ where: { id: payment.id }, data: { failureReason: `Amount mismatch: expected ${payment.amount} ${payment.currency}, got ${input.amount} ${input.currency}` } });
      await audit({ action: 'payment.amount_mismatch', tenantId: payment.tenantId, actorType: 'WEBHOOK', entityType: 'payment', entityId: payment.id, metadata: { source: input.source } }, tx);
      return 'amount_mismatch';
    }

    const order = payment.order;
    const { platformFeeBps } = await tenantPlan(order.tenantId, tx);
    // Platform fee is charged on the amount excluding tax
    const platformFee = Math.round(((order.total - order.taxAmount) * platformFeeBps) / 10000);
    const gatewayFee = input.gatewayFee ?? 0;
    const netAmount = payment.amount - platformFee - gatewayFee;

    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
      data: { status: 'CAPTURED', providerPaymentId: input.providerPaymentId, capturedAt: new Date(), gatewayFee, platformFee, netAmount, failureReason: null },
    });
    if (updated.count === 0) return 'already_captured';

    await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date() } });
    await fulfilOrder(tx, order.id);
    await issueInvoice(tx, order.id);

    if (payment.amount > 0) {
      await tx.ledgerEntry.createMany({
        data: [
          { tenantId: order.tenantId, type: 'SALE', amount: payment.amount, currency: payment.currency, orderId: order.id, paymentId: payment.id, memo: `Order #${order.number}` },
          ...(platformFee ? [{ tenantId: order.tenantId, type: 'PLATFORM_FEE' as const, amount: -platformFee, currency: payment.currency, orderId: order.id, paymentId: payment.id }] : []),
          ...(gatewayFee ? [{ tenantId: order.tenantId, type: 'GATEWAY_FEE' as const, amount: -gatewayFee, currency: payment.currency, orderId: order.id, paymentId: payment.id }] : []),
        ],
      });
    }
    if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { redeemedCount: { increment: 1 } } });
    if (order.affiliateId) await recordCommission(tx, order);
    await upsertContact(tx, order.tenantId, { email: order.buyerEmail, name: order.buyerName, phone: order.buyerPhone, userId: order.userId, source: 'purchase', tag: 'customer' });
    await audit({ action: 'payment.captured', tenantId: order.tenantId, actorType: 'WEBHOOK', entityType: 'order', entityId: order.id, metadata: { source: input.source, amount: payment.amount, provider: payment.provider } }, tx);
    await enqueueJob(tx, 'order.paid', { orderId: order.id }, `order.paid:${order.id}`);
    return 'captured';
  });
}

async function issueInvoice(tx: Tx, orderId: string) {
  const existing = await tx.invoice.findUnique({ where: { orderId } });
  if (existing) return existing;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, tenant: true } });
  const t = order.tenant;
  const n = await nextNumber(tx, t.id, 'invoice');
  const fy = (() => {
    const d = new Date();
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Indian financial year Apr–Mar
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  })();
  const gst = splitGst(order.taxAmount, t.gstStateCode, order.buyerState);
  return tx.invoice.create({
    data: {
      tenantId: t.id,
      orderId,
      number: `INV/${fy}/${String(n).padStart(5, '0')}`,
      seller: { name: t.legalName ?? t.name, address: t.address, gstin: t.gstin, stateCode: t.gstStateCode, email: t.supportEmail },
      buyer: { name: order.buyerName, email: order.buyerEmail, phone: order.buyerPhone, country: order.buyerCountry, stateCode: order.buyerState },
      lines: order.items.map((i) => ({ title: i.title, quantity: i.quantity, unitAmount: i.unitAmount, discount: i.discount, taxAmount: i.taxAmount, total: i.total })),
      currency: order.currency,
      subtotal: order.total - order.taxAmount,
      ...gst,
      total: order.total,
    },
  });
}

export async function markPaymentFailed(paymentId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({ where: { id: paymentId, status: { in: ['CREATED', 'AUTHORIZED'] } }, data: { status: 'FAILED', failureReason: reason.slice(0, 500) } });
    if (!updated.count) return;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await tx.order.updateMany({ where: { id: p.orderId, status: 'PENDING' }, data: { status: 'FAILED' } });
  });
}

/**
 * Applies a provider-confirmed refund exactly once: payment/order totals, ledger,
 * entitlement revocation (full refunds) and affiliate commission reversal.
 */
export async function applyRefund(refundId: string, source: string) {
  return prisma.$transaction(async (tx) => {
    const done = await tx.refund.updateMany({ where: { id: refundId, status: { in: ['REQUESTED', 'PENDING'] } }, data: { status: 'PROCESSED', processedAt: new Date() } });
    if (!done.count) return false;
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true, order: true } });
    await applyRefundEffects(tx, refund, refund.payment, source);
    return true;
  });
}

async function applyRefundEffects(tx: Tx, refund: Refund & { order: { id: string; tenantId: string; userId: string; total: number; taxAmount: number; number: number } }, payment: Payment, source: string) {
  const refundedTotal = payment.refundedAmount + refund.amount;
  const full = refundedTotal >= payment.amount;
  await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount: refundedTotal, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
  await tx.order.update({ where: { id: refund.orderId }, data: { status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
  // Platform fee is returned to the creator in proportion to the refund; gateway fees are not refundable
  const feeBack = payment.amount ? Math.round((payment.platformFee * refund.amount) / payment.amount) : 0;
  await tx.ledgerEntry.createMany({
    data: [
      { tenantId: refund.tenantId, type: 'REFUND', amount: -refund.amount, currency: payment.currency, orderId: refund.orderId, paymentId: payment.id, refundId: refund.id, memo: `Refund for order #${refund.order.number}` },
      ...(feeBack ? [{ tenantId: refund.tenantId, type: 'PLATFORM_FEE' as const, amount: feeBack, currency: payment.currency, orderId: refund.orderId, paymentId: payment.id, refundId: refund.id, memo: 'Platform fee returned' }] : []),
    ],
  });
  if (full) {
    await revokeEntitlement(tx, { tenantId: refund.tenantId, userId: refund.order.userId, sourceType: 'ORDER', sourceId: refund.orderId });
    await tx.customerSubscription.updateMany({ where: { providerSubscriptionId: { startsWith: `order:${refund.orderId}:` } }, data: { status: 'CANCELED', canceledAt: new Date() } });
  }
  await reverseCommission(tx, refund.orderId, full ? 1 : refund.amount / payment.amount);
  await audit({ action: 'refund.processed', tenantId: refund.tenantId, actorType: 'WEBHOOK', entityType: 'order', entityId: refund.orderId, metadata: { amount: refund.amount, full, source } }, tx);
}

/** Record and apply a refund that the provider reports but we did not initiate (dashboard refunds) */
export async function recordExternalRefund(payment: Payment, providerRefundId: string, amount: number, source: string) {
  const existing = await prisma.refund.findUnique({ where: { provider_providerRefundId: { provider: payment.provider, providerRefundId } } });
  if (existing) return existing.status === 'PROCESSED' ? false : applyRefund(existing.id, source);
  const r = await prisma.refund.create({
    data: { tenantId: payment.tenantId, orderId: payment.orderId, paymentId: payment.id, provider: payment.provider, providerRefundId, amount, status: 'PENDING', reason: 'Refunded at payment provider' },
  });
  return applyRefund(r.id, source);
}
