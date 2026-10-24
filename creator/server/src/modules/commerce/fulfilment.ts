import type { EntitlementSource, ResourceType } from '@prisma/client';
import type { Tx } from '../../lib/prisma';
import { ensureEnrollment } from '../courses/service';

interface GrantInput {
  tenantId: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  sourceType: EntitlementSource;
  sourceId: string;
  expiresAt?: Date | null;
}

/** Idempotent: granting the same (resource, source) twice keeps one active row */
export async function grantEntitlement(tx: Tx, g: GrantInput) {
  const ent = await tx.entitlement.upsert({
    where: {
      tenantId_userId_resourceType_resourceId_sourceType_sourceId: {
        tenantId: g.tenantId,
        userId: g.userId,
        resourceType: g.resourceType,
        resourceId: g.resourceId,
        sourceType: g.sourceType,
        sourceId: g.sourceId,
      },
    },
    create: { ...g, expiresAt: g.expiresAt ?? null },
    update: { status: 'ACTIVE', revokedAt: null, expiresAt: g.expiresAt ?? null },
  });
  // Buyers become STUDENT members of the workspace (customer relationship)
  const m = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: g.tenantId, userId: g.userId } } });
  if (!m) await tx.membership.create({ data: { tenantId: g.tenantId, userId: g.userId, roles: ['STUDENT'] } });
  else if (!m.roles.includes('STUDENT')) await tx.membership.update({ where: { id: m.id }, data: { roles: [...m.roles, 'STUDENT'] } });

  if (g.resourceType === 'COURSE') await ensureEnrollment(g.tenantId, g.resourceId, g.userId, tx);
  return ent;
}

/** Revoke entitlements from a source; course enrollments are revoked only if no other active access remains */
export async function revokeEntitlement(
  tx: Tx,
  r: { tenantId: string; userId: string; resourceType?: ResourceType; resourceId?: string; sourceType: EntitlementSource; sourceId?: string },
) {
  const affected = await tx.entitlement.findMany({
    where: { tenantId: r.tenantId, userId: r.userId, resourceType: r.resourceType, resourceId: r.resourceId, sourceType: r.sourceType, sourceId: r.sourceId, status: 'ACTIVE' },
  });
  if (!affected.length) return 0;
  await tx.entitlement.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { status: 'REVOKED', revokedAt: new Date() } });
  for (const a of affected.filter((x) => x.resourceType === 'COURSE')) {
    const other = await tx.entitlement.count({
      where: { tenantId: r.tenantId, userId: r.userId, resourceType: 'COURSE', resourceId: a.resourceId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    if (!other) await tx.enrollment.updateMany({ where: { courseId: a.resourceId, userId: r.userId }, data: { status: 'REVOKED' } });
  }
  return affected.length;
}

const INTERVAL_DAYS = { MONTH: 30, QUARTER: 91, YEAR: 365 } as const;

/** Grant everything a paid order includes. Safe to call more than once. */
export async function fulfilOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  for (const item of order.items) {
    const [product, price] = await Promise.all([
      tx.product.findUniqueOrThrow({ where: { id: item.productId }, include: { items: true } }),
      tx.productPrice.findUniqueOrThrow({ where: { id: item.priceId } }),
    ]);
    let expiresAt: Date | null = null;
    if (price.type === 'RECURRING' && price.interval) {
      // Renewal: extend the member's current period (from its end if still running, else from now)
      const existing = await tx.customerSubscription.findFirst({
        where: { tenantId: order.tenantId, userId: order.userId, productId: product.id, status: { in: ['ACTIVE', 'GRACE', 'PAST_DUE', 'EXPIRED', 'TRIALING'] } },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const now = new Date();
      const start = existing && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
      expiresAt = new Date(start.getTime() + INTERVAL_DAYS[price.interval] * 86400_000);
      if (existing) {
        await tx.customerSubscription.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', priceId: price.id, currentPeriodStart: start, currentPeriodEnd: expiresAt, graceUntil: null, cancelAtPeriodEnd: false, canceledAt: null },
        });
      } else {
        await tx.customerSubscription.create({
          data: {
            tenantId: order.tenantId,
            userId: order.userId,
            productId: product.id,
            priceId: price.id,
            provider: 'FREE',
            // Manual-renewal subscription; provider-managed auto-debit is tracked in docs/FEATURE_MATRIX.md
            providerSubscriptionId: `order:${order.id}:${item.id}`,
            status: 'ACTIVE',
            currentPeriodStart: start,
            currentPeriodEnd: expiresAt,
          },
        });
      }
    } else if (price.accessDays) {
      expiresAt = new Date(Date.now() + price.accessDays * 86400_000);
    }
    const base = { tenantId: order.tenantId, userId: order.userId, sourceType: 'ORDER' as const, sourceId: order.id, expiresAt };
    await grantEntitlement(tx, { ...base, resourceType: product.type === 'MEMBERSHIP' ? 'MEMBERSHIP' : 'PRODUCT', resourceId: product.id });
    for (const pi of product.items) await grantEntitlement(tx, { ...base, resourceType: pi.resourceType, resourceId: pi.resourceId });
  }
}
