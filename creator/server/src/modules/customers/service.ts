import type { Db } from '../../lib/prisma';

/** Create or enrich a CRM contact (unique per workspace + email) */
export async function upsertContact(
  db: Db,
  tenantId: string,
  c: { email: string; name?: string | null; phone?: string | null; userId?: string; source?: string; consentEmail?: boolean; tag?: string },
) {
  const email = c.email.toLowerCase();
  const contact = await db.contact.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: {
      tenantId,
      email,
      name: c.name ?? undefined,
      phone: c.phone ?? undefined,
      userId: c.userId,
      source: c.source,
      consentEmail: c.consentEmail ?? false,
      consentAt: c.consentEmail ? new Date() : undefined,
      lastActivityAt: new Date(),
    },
    update: {
      name: c.name ?? undefined,
      phone: c.phone ?? undefined,
      userId: c.userId ?? undefined,
      lastActivityAt: new Date(),
      ...(c.consentEmail ? { consentEmail: true, consentAt: new Date(), unsubscribedAt: null } : {}),
    },
  });
  if (c.tag) {
    const tag = await db.tag.upsert({ where: { tenantId_name: { tenantId, name: c.tag } }, create: { tenantId, name: c.tag }, update: {} });
    await db.contactTag.upsert({ where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } }, create: { contactId: contact.id, tagId: tag.id }, update: {} });
  }
  return contact;
}
