import type { Request } from 'express';
import type { ActorType, Prisma } from '@prisma/client';
import { prisma, Db } from '../lib/prisma';
import { logger } from '../lib/logger';

export interface AuditInput {
  action: string;
  tenantId?: string | null;
  actorId?: string | null;
  actorType?: ActorType;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
}

/**
 * Append-only audit trail. Called for every privileged or financial change,
 * including Super Admin actions (which can never skip it).
 */
export async function audit(input: AuditInput, db: Db = prisma) {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        tenantId: input.tenantId ?? input.req?.tenant?.id ?? null,
        actorId: input.actorId ?? input.req?.user?.id ?? null,
        actorType: input.actorType ?? (input.req?.user ? 'USER' : 'SYSTEM'),
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
        ip: input.req?.ip,
        userAgent: input.req?.get('user-agent')?.slice(0, 300),
      },
    });
  } catch (e) {
    // Inside a transaction the error must propagate so the change rolls back
    if (db !== prisma) throw e;
    logger.error({ err: e, action: input.action }, 'audit log write failed');
  }
}
