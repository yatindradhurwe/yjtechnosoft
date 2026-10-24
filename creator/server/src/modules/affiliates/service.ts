import type { Order } from '@prisma/client';
import type { Tx } from '../../lib/prisma';

/**
 * Commission rules (docs/AFFILIATES.md):
 *  - rate = product-specific rule if one exists, otherwise the affiliate's default rate
 *  - base = order total excluding tax
 *  - no commission for self-referrals or unapproved affiliates
 *  - one commission per order (unique orderId)
 */
export async function recordCommission(tx: Tx, order: Order) {
  if (!order.affiliateId) return null;
  const affiliate = await tx.affiliate.findFirst({ where: { id: order.affiliateId, tenantId: order.tenantId } });
  if (!affiliate || affiliate.status !== 'APPROVED' || affiliate.userId === order.userId) return null;
  const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
  let amount = 0;
  for (const item of items) {
    const rule = await tx.affiliateProductRule.findUnique({ where: { tenantId_productId: { tenantId: order.tenantId, productId: item.productId } } });
    const bps = rule?.commissionBps ?? affiliate.commissionBps;
    amount += Math.round(((item.total - item.taxAmount) * bps) / 10000);
  }
  if (amount <= 0) return null;
  const existing = await tx.commission.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;
  const c = await tx.commission.create({ data: { tenantId: order.tenantId, affiliateId: affiliate.id, orderId: order.id, amount, currency: order.currency } });
  await tx.ledgerEntry.create({ data: { tenantId: order.tenantId, type: 'AFFILIATE_COMMISSION', amount: -amount, currency: order.currency, orderId: order.id, memo: `Commission ${affiliate.code}` } });
  return c;
}

/** Reverse (fully or proportionally) on refund. Paid commissions are left for manual recovery. */
export async function reverseCommission(tx: Tx, orderId: string, fraction: number) {
  const c = await tx.commission.findUnique({ where: { orderId } });
  if (!c || c.status === 'REVERSED' || c.status === 'REJECTED' || c.status === 'PAID') return;
  const back = Math.min(c.amount, Math.round(c.amount * fraction));
  if (back <= 0) return;
  const remaining = c.amount - back;
  await tx.commission.update({ where: { id: c.id }, data: { amount: remaining, status: remaining === 0 ? 'REVERSED' : c.status } });
  await tx.ledgerEntry.create({ data: { tenantId: c.tenantId, type: 'AFFILIATE_COMMISSION', amount: back, currency: c.currency, orderId, memo: 'Commission reversed (refund)' } });
}
