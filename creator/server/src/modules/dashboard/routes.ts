import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { query } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';

/**
 * Creator dashboard. Every number is computed from database records.
 * Metric definitions are documented in docs/METRICS.md.
 */
export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireTenantStaff);

const PAID = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

dashboardRouter.get('/', can('analytics.read'), async (req, res) => {
  const tenantId = req.tenant!.id;
  const q = query(req, z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }));
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86400_000);
  const range = { gte: from, lte: to };
  const now = new Date();

  const [
    paidAgg,
    ordersCreated,
    ordersPaid,
    refundAgg,
    ledgerAgg,
    newEnrollments,
    activeLearners,
    enrollStats,
    failedPayments,
    renewalsDue,
    commissionAgg,
    messageStats,
    recentOrders,
    recentEnrollments,
    upcomingWorkshops,
    upcomingBookings,
    topProducts,
    newMembers,
  ] = await Promise.all([
    prisma.order.aggregate({ where: { tenantId, status: { in: [...PAID] }, paidAt: range }, _sum: { total: true, taxAmount: true } }),
    prisma.order.count({ where: { tenantId, createdAt: range } }),
    prisma.order.count({ where: { tenantId, createdAt: range, status: { in: [...PAID] } } }),
    prisma.refund.aggregate({ where: { tenantId, status: 'PROCESSED', processedAt: range }, _sum: { amount: true }, _count: true }),
    prisma.ledgerEntry.aggregate({ where: { tenantId, createdAt: range }, _sum: { amount: true } }),
    prisma.enrollment.count({ where: { tenantId, enrolledAt: range } }),
    prisma.lessonProgress.findMany({ where: { tenantId, updatedAt: { gte: new Date(now.getTime() - 30 * 86400_000) } }, distinct: ['userId'], select: { userId: true } }),
    prisma.enrollment.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    prisma.payment.count({ where: { tenantId, status: 'FAILED', createdAt: range } }),
    prisma.customerSubscription.count({ where: { tenantId, status: { in: ['ACTIVE', 'GRACE'] }, currentPeriodEnd: { gte: now, lte: new Date(now.getTime() + 7 * 86400_000) } } }),
    prisma.commission.aggregate({ where: { tenantId, createdAt: range, status: { notIn: ['REVERSED', 'REJECTED'] } }, _sum: { amount: true }, _count: true }),
    prisma.messageLog.groupBy({ by: ['channel', 'status'], where: { tenantId, createdAt: range }, _count: true }),
    prisma.order.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, number: true, buyerName: true, buyerEmail: true, total: true, currency: true, status: true, createdAt: true } }),
    prisma.enrollment.findMany({ where: { tenantId }, orderBy: { enrolledAt: 'desc' }, take: 8, include: { user: { select: { name: true, email: true } }, course: { select: { title: true } } } }),
    prisma.workshop.findMany({ where: { tenantId, status: 'PUBLISHED', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 5, include: { _count: { select: { registrations: { where: { status: 'REGISTERED' } } } } } }),
    prisma.booking.findMany({ where: { tenantId, status: 'CONFIRMED', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 5, include: { offering: { select: { title: true } } } }),
    prisma.orderItem.groupBy({ by: ['productId', 'title'], where: { order: { tenantId, status: { in: [...PAID] }, paidAt: range } }, _sum: { total: true }, _count: true, orderBy: { _sum: { total: 'desc' } }, take: 5 }),
    prisma.membership.count({ where: { tenantId, roles: { has: 'STUDENT' }, createdAt: range } }),
  ]);

  // Daily revenue series (tenant timezone)
  const series = await prisma.$queryRaw<{ day: string; revenue: bigint; orders: bigint }[]>`
    SELECT to_char(date_trunc('day', "paidAt" AT TIME ZONE ${req.tenant!.timezone}), 'YYYY-MM-DD') AS day,
           COALESCE(SUM(total), 0)::bigint AS revenue, COUNT(*)::bigint AS orders
    FROM "Order"
    WHERE "tenantId" = ${tenantId}::uuid AND status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND "paidAt" BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY 1`;

  const enrollTotal = enrollStats.reduce((s, e) => s + e._count, 0);
  const completed = enrollStats.find((e) => e.status === 'COMPLETED')?._count ?? 0;
  const msg = (channel: string, status: string) => messageStats.find((m) => m.channel === channel && m.status === status)?._count ?? 0;

  res.json({
    range: { from, to },
    currency: req.tenant!.currency,
    revenue: paidAgg._sum.total ?? 0,
    taxCollected: paidAgg._sum.taxAmount ?? 0,
    refunds: refundAgg._sum.amount ?? 0,
    refundCount: refundAgg._count,
    netEarnings: ledgerAgg._sum.amount ?? 0,
    ordersPaid,
    ordersCreated,
    checkoutConversion: ordersCreated ? ordersPaid / ordersCreated : null,
    newEnrollments,
    newCustomers: newMembers,
    activeLearners30d: activeLearners.length,
    completionRate: enrollTotal ? completed / enrollTotal : null,
    failedPayments,
    renewalsDue7d: renewalsDue,
    affiliate: { commissions: commissionAgg._sum.amount ?? 0, conversions: commissionAgg._count },
    messaging: {
      emailSent: msg('EMAIL', 'SENT'),
      emailFailed: msg('EMAIL', 'FAILED'),
      whatsappSent: msg('WHATSAPP', 'SENT'),
      whatsappFailed: msg('WHATSAPP', 'FAILED'),
    },
    series: series.map((s) => ({ day: s.day, revenue: Number(s.revenue), orders: Number(s.orders) })),
    topProducts: topProducts.map((t) => ({ productId: t.productId, title: t.title, revenue: t._sum.total ?? 0, sales: t._count })),
    recentOrders,
    recentEnrollments: recentEnrollments.map((e) => ({ id: e.id, user: e.user, course: e.course.title, enrolledAt: e.enrolledAt, progressPct: e.progressPct })),
    upcomingWorkshops: upcomingWorkshops.map((w) => ({ id: w.id, title: w.title, startsAt: w.startsAt, registered: w._count.registrations, capacity: w.capacity })),
    upcomingBookings: upcomingBookings.map((b) => ({ id: b.id, title: b.offering.title, startsAt: b.startsAt })),
  });
});

/** Global search across the workspace (dashboard search box) */
dashboardRouter.get('/search', can('analytics.read'), async (req, res) => {
  const { q } = query(req, z.object({ q: z.string().trim().min(2).max(100) }));
  const tenantId = req.tenant!.id;
  const contains = { contains: q, mode: 'insensitive' as const };
  const [courses, products, contacts, orders] = await Promise.all([
    prisma.course.findMany({ where: { tenantId, deletedAt: null, title: contains }, take: 5, select: { id: true, title: true } }),
    prisma.product.findMany({ where: { tenantId, deletedAt: null, title: contains }, take: 5, select: { id: true, title: true } }),
    prisma.contact.findMany({ where: { tenantId, OR: [{ email: contains }, { name: contains }] }, take: 5, select: { id: true, email: true, name: true } }),
    prisma.order.findMany({ where: { tenantId, OR: [{ buyerEmail: contains }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] }, take: 5, select: { id: true, number: true, buyerEmail: true } }),
  ]);
  res.json({ courses, products, contacts, orders });
});
