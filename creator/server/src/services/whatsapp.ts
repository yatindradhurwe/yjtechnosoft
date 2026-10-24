import { prisma } from '../lib/prisma';
import { getIntegration } from './integrations';

/**
 * WhatsApp Business Platform (Meta Cloud API). Each workspace connects its own
 * WhatsApp Business number. Business-initiated messages must use templates that
 * Meta has approved; free-form text is only allowed inside the 24-hour customer
 * service window, so campaigns and automations send templates only.
 */
export async function whatsappConfig(tenantId: string) {
  const i = await getIntegration(tenantId, 'WHATSAPP');
  if (!i?.enabled || !i.config.phoneNumberId || !i.secrets.accessToken) return null;
  return { phoneNumberId: String(i.config.phoneNumberId), accessToken: i.secrets.accessToken, apiVersion: String(i.config.apiVersion ?? 'v21.0') };
}

/** E.164 without '+'. Indian 10-digit numbers get the 91 prefix. */
export function normalisePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.replace(/^0+/, '');
}

export async function sendWhatsappTemplate(input: {
  tenantId: string;
  to: string;
  template: string;
  language: string;
  params?: string[];
  campaignId?: string;
  contactId?: string;
}) {
  const cfg = await whatsappConfig(input.tenantId);
  const to = normalisePhone(input.to);
  let status: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
  let error: string | undefined = 'WhatsApp is not connected for this workspace';
  let providerMessageId: string | undefined;
  if (cfg) {
    try {
      const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: input.template,
            language: { code: input.language },
            components: input.params?.length ? [{ type: 'body', parameters: input.params.map((t) => ({ type: 'text', text: t })) }] : undefined,
          },
        }),
      });
      const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      status = 'SENT';
      error = undefined;
      providerMessageId = json.messages?.[0]?.id;
    } catch (e) {
      status = 'FAILED';
      error = e instanceof Error ? e.message : String(e);
    }
  }
  await prisma.messageLog.create({
    data: { tenantId: input.tenantId, campaignId: input.campaignId, contactId: input.contactId, channel: 'WHATSAPP', to, subject: input.template, status, error, providerMessageId },
  });
  return { status, error };
}
