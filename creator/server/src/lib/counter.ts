import type { Tx } from './prisma';

/** Atomically increments and returns a per-tenant counter (order / invoice numbers) */
export async function nextNumber(tx: Tx, tenantId: string, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("tenantId", "key", "value") VALUES (${tenantId}::uuid, ${key}, 1)
    ON CONFLICT ("tenantId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}
