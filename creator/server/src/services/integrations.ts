import type { IntegrationKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { decryptJson, encryptJson } from '../lib/crypto';

export interface ResolvedIntegration {
  enabled: boolean;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

/** Secret field names per provider – never returned to any client */
export const SECRET_FIELDS: Record<IntegrationKind, string[]> = {
  RAZORPAY: ['keySecret', 'webhookSecret'],
  STRIPE: ['secretKey', 'webhookSecret'],
  SMTP: ['password'],
  RESEND: ['apiKey'],
  WHATSAPP: ['accessToken', 'appSecret'],
  ZOOM: ['clientSecret'],
  AI: ['apiKey'],
  S3: ['secretAccessKey'],
  MUX: ['tokenSecret', 'signingKeyPrivate'],
};

export async function getIntegration(scopeKey: string, kind: IntegrationKind): Promise<ResolvedIntegration | null> {
  const row = await prisma.providerIntegration.findUnique({ where: { scopeKey_kind: { scopeKey, kind } } });
  if (!row) return null;
  return {
    enabled: row.enabled,
    config: (row.config ?? {}) as Record<string, unknown>,
    secrets: row.secretsEnc ? decryptJson(row.secretsEnc) : {},
  };
}

/**
 * Upsert an integration. Secret values that are omitted or blank keep their
 * stored value, so the UI never has to read secrets back.
 */
export async function saveIntegration(
  scopeKey: string,
  kind: IntegrationKind,
  input: { enabled: boolean; config: Record<string, unknown>; secrets: Record<string, string | undefined> },
  userId: string,
) {
  const existing = await getIntegration(scopeKey, kind);
  const secrets: Record<string, string> = { ...(existing?.secrets ?? {}) };
  for (const field of SECRET_FIELDS[kind]) {
    const v = input.secrets[field];
    if (typeof v === 'string' && v.trim()) secrets[field] = v.trim();
  }
  const data = {
    enabled: input.enabled,
    config: input.config as object,
    secretsEnc: Object.keys(secrets).length ? encryptJson(secrets) : null,
    updatedById: userId,
  };
  await prisma.providerIntegration.upsert({
    where: { scopeKey_kind: { scopeKey, kind } },
    create: { scopeKey, kind, ...data },
    update: data,
  });
}

/** Safe view for admin UIs: config + which secrets are set, never their values */
export async function describeIntegration(scopeKey: string, kind: IntegrationKind) {
  const row = await getIntegration(scopeKey, kind);
  return {
    kind,
    configured: !!row,
    enabled: row?.enabled ?? false,
    config: row?.config ?? {},
    secretsSet: Object.fromEntries(SECRET_FIELDS[kind].map((f) => [f, !!row?.secrets[f]])),
  };
}
