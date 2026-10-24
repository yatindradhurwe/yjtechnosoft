import type { Coupon, ProductPrice, Tenant } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';

export interface Quote {
  currency: string;
  unitAmount: number;
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  coupon: Pick<Coupon, 'id' | 'code'> | null;
}

/**
 * Tax rules (documented in docs/PAYMENTS.md):
 *  - GST is charged only when the workspace has a GSTIN.
 *  - Buyers outside India: no GST (export of services, zero-rated).
 *  - pricesIncludeTax=true: the listed price is the final price and GST is extracted from it.
 *  - pricesIncludeTax=false: GST is added on top of the discounted price.
 */
export function computeQuote(tenant: Pick<Tenant, 'gstin' | 'taxRateBps' | 'pricesIncludeTax'>, price: Pick<ProductPrice, 'amount' | 'currency'>, discount: number, buyerCountry: string): Omit<Quote, 'coupon'> {
  const rate = tenant.gstin && buyerCountry === 'IN' ? tenant.taxRateBps : 0;
  const net = Math.max(0, price.amount - discount);
  let tax: number;
  let total: number;
  if (tenant.pricesIncludeTax) {
    total = net;
    tax = rate ? net - Math.round((net * 10000) / (10000 + rate)) : 0;
  } else {
    tax = Math.round((net * rate) / 10000);
    total = net + tax;
  }
  return { currency: price.currency, unitAmount: price.amount, subtotal: price.amount, discount: price.amount - net, taxAmount: tax, total, taxRateBps: rate, pricesIncludeTax: tenant.pricesIncludeTax };
}

export async function resolveCoupon(tenantId: string, code: string | undefined, productId: string, userId: string | undefined, amount: number) {
  if (!code) return { coupon: null, discount: 0 };
  const coupon = await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId, code: code.trim().toUpperCase() } } });
  const now = new Date();
  if (!coupon || !coupon.active) throw badRequest('This coupon code is not valid');
  if (coupon.startsAt && coupon.startsAt > now) throw badRequest('This coupon is not active yet');
  if (coupon.endsAt && coupon.endsAt < now) throw badRequest('This coupon has expired');
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) throw badRequest('This coupon has been fully redeemed');
  if (coupon.productIds.length && !coupon.productIds.includes(productId)) throw badRequest('This coupon does not apply to this product');
  if (userId && coupon.perUserLimit > 0) {
    const used = await prisma.order.count({ where: { tenantId, userId, couponId: coupon.id, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } });
    if (used >= coupon.perUserLimit) throw badRequest('You have already used this coupon');
  }
  const discount = coupon.type === 'PERCENT' ? Math.round((amount * Math.min(coupon.value, 10000)) / 10000) : Math.min(coupon.value, amount);
  return { coupon, discount };
}

/** GST split for invoices: intra-state → CGST + SGST, inter-state → IGST */
export function splitGst(taxAmount: number, sellerState: string | null, buyerState: string | null) {
  if (!taxAmount) return { cgst: 0, sgst: 0, igst: 0 };
  if (sellerState && buyerState && sellerState === buyerState) {
    const cgst = Math.floor(taxAmount / 2);
    return { cgst, sgst: taxAmount - cgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxAmount };
}
