import type { Campaign, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../services/email';
import { sendWhatsappTemplate } from '../../services/whatsapp';
import { renderTemplate, unsubscribeUrl } from './unsubscribe';

export interface Audience {
  tags?: string[];
}

/** Recipients: consented, not unsubscribed, not suppressed, matching tags */
export function audienceWhere(tenantId: string, channel: 'EMAIL' | 'WHATSAPP', audience: Audience): Prisma.ContactWhereInput {
  return {
    tenantId,
    unsubscribedAt: null,
    ...(channel === 'EMAIL' ? { consentEmail: true } : { consentWhatsapp: true, phone: { not: null } }),
    ...(audience.tags?.length ? { tags: { some: { tag: { name: { in: audience.tags } } } } } : {}),
  };
}

const BATCH = 100;

/**
 * Sends a campaign in batches. Resumable and idempotent: contacts that already
 * have a log row for this campaign are skipped, so a crash mid-send never
 * double-sends.
 */
export async function sendCampaign(campaign: Campaign) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: campaign.tenantId } });
  const where = audienceWhere(campaign.tenantId, campaign.channel, campaign.audience as Audience);
  const suppressed = new Set((await prisma.suppression.findMany({ where: { tenantId: campaign.tenantId, channel: campaign.channel }, select: { address: true } })).map((s) => s.address));
  let cursor: string | undefined;
  for (;;) {
    const contacts = await prisma.contact.findMany({ where, orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (!contacts.length) break;
    cursor = contacts[contacts.length - 1].id;
    const done = new Set((await prisma.messageLog.findMany({ where: { campaignId: campaign.id, contactId: { in: contacts.map((c) => c.id) } }, select: { contactId: true } })).map((m) => m.contactId));
    for (const c of contacts) {
      if (done.has(c.id)) continue;
      const vars = { name: c.name ?? '', first_name: (c.name ?? '').split(' ')[0], email: c.email, store_url: `${env.APP_URL}/s/${tenant.slug}` };
      if (campaign.channel === 'EMAIL') {
        if (suppressed.has(c.email)) continue;
        const unsub = unsubscribeUrl(campaign.tenantId, c.id);
        await sendEmail({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          contactId: c.id,
          to: c.email,
          fromName: tenant.name,
          subject: renderTemplate(campaign.subject ?? campaign.name, vars),
          text: `${renderTemplate(campaign.body, vars)}\n\n—\nYou are receiving this because you subscribed to ${tenant.name}.\nUnsubscribe: ${unsub}`,
          unsubscribeUrl: unsub,
        });
      } else {
        if (suppressed.has(c.phone!)) continue;
        // body holds the approved template name; subject holds the language code
        await sendWhatsappTemplate({ tenantId: campaign.tenantId, campaignId: campaign.id, contactId: c.id, to: c.phone!, template: campaign.body, language: campaign.subject ?? 'en' });
      }
    }
  }
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENT', sentAt: new Date() } });
}

export async function sendDueCampaigns() {
  // Claim atomically so two workers cannot both start the same campaign
  const due = await prisma.campaign.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } }, take: 5 });
  for (const c of due) {
    const claimed = await prisma.campaign.updateMany({ where: { id: c.id, status: 'SCHEDULED' }, data: { status: 'SENDING' } });
    if (!claimed.count) continue;
    try {
      await sendCampaign(c);
    } catch (e) {
      logger.error({ err: e, campaign: c.id }, 'campaign send failed; will resume');
      await prisma.campaign.update({ where: { id: c.id }, data: { status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 5 * 60_000) } });
    }
  }
}
