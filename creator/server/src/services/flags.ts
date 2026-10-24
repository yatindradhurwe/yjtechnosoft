import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';

/** Deterministic bucket 0–99 for a tenant, so rollouts are stable */
function bucket(key: string, tenantId: string) {
  return crypto.createHash('sha256').update(`${key}:${tenantId}`).digest().readUInt32BE(0) % 100;
}

export async function isFeatureEnabled(key: string, tenantId?: string) {
  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  if (!flag || !flag.enabled) return false;
  if (tenantId && flag.tenantAllowlist.includes(tenantId)) return true;
  if (flag.rolloutPercent >= 100) return true;
  if (!tenantId) return false;
  return bucket(key, tenantId) < flag.rolloutPercent;
}

export async function flagsForTenant(tenantId: string) {
  const flags = await prisma.featureFlag.findMany({ where: { enabled: true } });
  return Object.fromEntries(
    flags.map((f) => [f.key, f.tenantAllowlist.includes(tenantId) || f.rolloutPercent >= 100 || bucket(f.key, tenantId) < f.rolloutPercent]),
  );
}
