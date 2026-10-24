import { Router, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound, unavailable } from '../../lib/errors';
import { body, pageArgs, pagination, parse, query } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { razorpay, razorpayCreds } from '../../services/payments/razorpay';
import { stripeClient, stripeCreds } from '../../services/payments/stripe';
import { applyRefund } from './capture';

export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireTenantStaff);

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed) */
export function sendCsv(res: Response, filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  res.type('text/csv').set('content-disposition', `attachment; filename="${filename}"`).send(rows.map((r) => r.map(cell).join(',')).join('\n'));
}

const orderFilter = pagination.extend({
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  productId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

ordersRouter.get('/', can('orders.read'), async (req, res) => {
  const p = query(req, orderFilter);
  const where: Prisma.OrderWhereInput = {
    tenantId: req.tenant!.id,
    status: p.status,
    createdAt: { gte: p.from, lte: p.to },
    ...(p.productId ? { items: { some: { productId: p.productId } } } : {}),
    ...(p.q
      ? { OR: [{ buyerEmail: { contains: p.q, mode: 'insensitive' } }, { buyerName: { contains: p.q, mode: 'insensitive' } }, ...(/^\d+$/.test(p.q) ? [{ number: Number(p.q) }] : [])] }
      : {}),
  };
  if (p.format === 'csv') {
    const rows = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50_000, include: { items: true, invoice: { select: { number: true } } } });
    return sendCsv(res, 'orders.csv', [
      ['Order', 'Date', 'Status', 'Buyer', 'Email', 'Items', 'Currency', 'Subtotal', 'Discount', 'Tax', 'Total', 'Invoice'],
      ...rows.map((o) => [o.number, o.createdAt.toISOString(), o.status, o.buyerName, o.buyerEmail, o.items.map((i) => i.title).join(' | '), o.currency, o.subtotal / 100, o.discount / 100, o.taxAmount / 100, o.total / 100, o.invoice?.number]),
    ]);
  }
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p), include: { items: { select: { title: true } }, payments: { select: { provider: true, status: true } } } }),
    prisma.order.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

ordersRouter.get('/:orderId', can('orders.read'), async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: parse(z.string().uuid(), req.params.orderId), tenantId: req.tenant!.id },
    include: { items: true, payments: true, refunds: { orderBy: { createdAt: 'desc' } }, invoice: true, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw notFound('Order not found');
  res.json({ order });
});

/**
 * Creator-initiated refund. The refund is requested from the provider; access is
 * only revoked once the provider confirms it (API response or webhook).
 */
ordersRouter.post('/:orderId/refund', can('orders.refund'), async (req, res) => {
  const input = body(req, z.object({ amount: z.number().int().min(1).optional(), reason: z.string().trim().max(500).optional() }));
  const order = await prisma.order.findFirst({ where: { id: parse(z.string().uuid(), req.params.orderId), tenantId: req.tenant!.id }, include: { payments: true, refunds: true } });
  if (!order) throw notFound('Order not found');
  const payment = order.payments.find((p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED');
  if (!payment) throw badRequest('This order has no captured payment to refund');
  if (payment.provider === 'FREE') throw badRequest('Free orders cannot be refunded. Remove access from the student list instead.');
  const pendingAmount = order.refunds.filter((r) => r.status === 'PENDING' || r.status === 'REQUESTED').reduce((s, r) => s + r.amount, 0);
  const refundable = payment.amount - payment.refundedAmount - pendingAmount;
  const amount = input.amount ?? refundable;
  if (amount <= 0 || amount > refundable) throw badRequest(`You can refund up to ${(refundable / 100).toFixed(2)} ${payment.currency}`);

  const refund = await prisma.refund.create({
    data: { tenantId: order.tenantId, orderId: order.id, paymentId: payment.id, provider: payment.provider, amount, reason: input.reason, requestedById: req.user!.id, status: 'PENDING' },
  });
  await audit({ action: 'refund.requested', entityType: 'order', entityId: order.id, metadata: { amount, reason: input.reason }, req });

  try {
    if (payment.provider === 'RAZORPAY') {
      const creds = await razorpayCreds();
      if (!creds) throw unavailable('Razorpay is not configured');
      const r = await razorpay.refund(creds, payment.providerPaymentId!, amount, { orderId: order.id, refundId: refund.id });
      await prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: r.id } });
      if (r.status === 'processed') await applyRefund(refund.id, 'razorpay_api');
    } else {
      const creds = await stripeCreds();
      if (!creds) throw unavailable('Stripe is not configured');
      const r = await stripeClient(creds).refunds.create({ payment_intent: payment.providerPaymentId!, amount, metadata: { orderId: order.id, refundId: refund.id } });
      await prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: r.id } });
      if (r.status === 'succeeded') await applyRefund(refund.id, 'stripe_api');
    }
  } catch (e) {
    await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
    throw e instanceof Error && 'status' in e ? e : badRequest(`The payment provider rejected the refund: ${e instanceof Error ? e.message : e}`);
  }
  res.status(201).json({ refund: await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } }) });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customersRouter = Router();
customersRouter.use(requireAuth, requireTenantStaff);

customersRouter.get('/', can('customers.read'), async (req, res) => {
  const p = query(req, pagination.extend({ tag: z.string().max(40).optional(), format: z.enum(['json', 'csv']).default('json') }));
  const where: Prisma.ContactWhereInput = {
    tenantId: req.tenant!.id,
    ...(p.tag ? { tags: { some: { tag: { name: p.tag } } } } : {}),
    ...(p.q ? { OR: [{ email: { contains: p.q, mode: 'insensitive' } }, { name: { contains: p.q, mode: 'insensitive' } }, { phone: { contains: p.q } }] } : {}),
  };
  if (p.format === 'csv') {
    const rows = await prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100_000, include: { tags: { include: { tag: true } } } });
    return sendCsv(res, 'contacts.csv', [
      ['Email', 'Name', 'Phone', 'Source', 'Tags', 'Email consent', 'Unsubscribed', 'Created'],
      ...rows.map((c) => [c.email, c.name, c.phone, c.source, c.tags.map((t) => t.tag.name).join(' | '), c.consentEmail ? 'yes' : 'no', c.unsubscribedAt?.toISOString(), c.createdAt.toISOString()]),
    ]);
  }
  const [items, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p), include: { tags: { include: { tag: true } } } }),
    prisma.contact.count({ where }),
  ]);
  // Lifetime value per contact from paid orders
  const userIds = items.map((i) => i.userId).filter(Boolean) as string[];
  const ltv = await prisma.order.groupBy({ by: ['userId'], where: { tenantId: req.tenant!.id, userId: { in: userIds }, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, _sum: { total: true }, _count: true });
  res.json({
    items: items.map((c) => {
      const l = ltv.find((x) => x.userId === c.userId);
      return { ...c, tags: c.tags.map((t) => t.tag.name), orders: l?._count ?? 0, lifetimeValue: l?._sum.total ?? 0 };
    }),
    total,
    page: p.page,
    pageSize: p.pageSize,
  });
});

customersRouter.get('/:contactId', can('customers.read'), async (req, res) => {
  const contact = await prisma.contact.findFirst({ where: { id: parse(z.string().uuid(), req.params.contactId), tenantId: req.tenant!.id }, include: { tags: { include: { tag: true } } } });
  if (!contact) throw notFound('Contact not found');
  const [orders, enrollments, messages] = await Promise.all([
    contact.userId ? prisma.order.findMany({ where: { tenantId: req.tenant!.id, userId: contact.userId }, orderBy: { createdAt: 'desc' }, include: { items: { select: { title: true } } } }) : [],
    contact.userId ? prisma.enrollment.findMany({ where: { tenantId: req.tenant!.id, userId: contact.userId }, include: { course: { select: { title: true } } } }) : [],
    prisma.messageLog.findMany({ where: { tenantId: req.tenant!.id, contactId: contact.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  res.json({ contact: { ...contact, tags: contact.tags.map((t) => t.tag.name) }, orders, enrollments, messages });
});

// ---------------------------------------------------------------------------
// Balance & payouts
// ---------------------------------------------------------------------------

export const financeRouter = Router();
financeRouter.use(requireAuth, requireTenantStaff);

async function balance(tenantId: string) {
  const [ledger, pendingPayouts] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ['currency', 'type'], where: { tenantId }, _sum: { amount: true } }),
    prisma.payout.groupBy({ by: ['currency'], where: { tenantId, status: { in: ['REQUESTED', 'APPROVED'] } }, _sum: { amount: true } }),
  ]);
  const currencies = [...new Set(ledger.map((l) => l.currency))];
  return currencies.map((currency) => {
    const by = (t: string) => ledger.find((l) => l.currency === currency && l.type === t)?._sum.amount ?? 0;
    const net = ledger.filter((l) => l.currency === currency).reduce((s, l) => s + (l._sum.amount ?? 0), 0);
    const reserved = pendingPayouts.find((p) => p.currency === currency)?._sum.amount ?? 0;
    return {
      currency,
      gross: by('SALE'),
      refunds: -by('REFUND'),
      platformFees: -by('PLATFORM_FEE'),
      gatewayFees: -by('GATEWAY_FEE'),
      affiliateCommissions: -by('AFFILIATE_COMMISSION'),
      paidOut: -by('PAYOUT'),
      balance: net,
      available: net - reserved,
    };
  });
}

financeRouter.get('/balance', can('billing.manage'), async (req, res) => {
  const [balances, payouts, ledger] = await Promise.all([
    balance(req.tenant!.id),
    prisma.payout.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.ledgerEntry.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  res.json({ balances, payouts, ledger });
});

financeRouter.post('/payouts', can('billing.manage'), async (req, res) => {
  const input = body(req, z.object({ amount: z.number().int().min(100), currency: z.string().length(3), notes: z.string().trim().max(500).optional() }));
  const b = (await balance(req.tenant!.id)).find((x) => x.currency === input.currency);
  if (!b || input.amount > b.available) throw badRequest(`Available balance is ${((b?.available ?? 0) / 100).toFixed(2)} ${input.currency}`);
  const payout = await prisma.payout.create({ data: { tenantId: req.tenant!.id, amount: input.amount, currency: input.currency, notes: input.notes, requestedById: req.user!.id } });
  await audit({ action: 'payout.requested', entityType: 'payout', entityId: payout.id, metadata: { amount: input.amount, currency: input.currency }, req });
  res.status(201).json({ payout });
});
