import { env } from '../../config/env';
import { hmacHex, safeEqual } from '../../lib/crypto';

export function unsubscribeUrl(tenantId: string, contactId: string) {
  const sig = hmacHex(env.MEDIA_SIGNING_SECRET, `unsub:${tenantId}:${contactId}`);
  return `${env.API_URL}/api/public/unsubscribe?t=${tenantId}&c=${contactId}&s=${sig}`;
}

export function verifyUnsubscribe(tenantId: string, contactId: string, sig: string) {
  return safeEqual(hmacHex(env.MEDIA_SIGNING_SECRET, `unsub:${tenantId}:${contactId}`), sig);
}

/** Plain-text merge fields: {{name}}, {{first_name}}, {{email}}, {{store_url}} */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}
