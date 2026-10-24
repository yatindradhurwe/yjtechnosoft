import { prisma } from '../../lib/prisma';

export const ATTRIBUTION_WINDOW_DAYS = 30;

/**
 * Last-click attribution: an explicit referral code at checkout wins; otherwise the
 * most recent tracked click for this visitor inside the attribution window.
 * Self-referrals and unapproved affiliates never attribute.
 */
export async function resolveAttribution(tenantId: string, code: string | undefined, visitorId: string | undefined, buyerId: string) {
  let affiliate = null;
  if (code) {
    affiliate = await prisma.affiliate.findUnique({ where: { tenantId_code: { tenantId, code: code.toUpperCase() } } });
  } else if (visitorId) {
    const click = await prisma.referralClick.findFirst({
      where: { tenantId, visitorId, createdAt: { gte: new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 86400_000) } },
      orderBy: { createdAt: 'desc' },
      include: { affiliate: true },
    });
    affiliate = click?.affiliate ?? null;
  }
  if (!affiliate || affiliate.status !== 'APPROVED' || affiliate.userId === buyerId) return null;
  return affiliate.id;
}
