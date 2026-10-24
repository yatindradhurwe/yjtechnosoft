import type { Prisma } from '@prisma/client';
import { prisma, Db } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Postgres-backed job queue (transactional outbox). Enqueue inside the same
 * transaction as the business change, so a job exists if and only if the change
 * committed. Workers claim jobs with FOR UPDATE SKIP LOCKED, so several API
 * processes can run workers safely.
 */
export async function enqueueJob(db: Db, name: string, payload: Prisma.InputJsonValue, idempotencyKey?: string, runAt?: Date) {
  if (idempotencyKey) {
    const existing = await db.backgroundJob.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }
  return db.backgroundJob.create({ data: { name, payload, idempotencyKey, runAt: runAt ?? new Date() } });
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<string, JobHandler>();

export function registerJob(name: string, handler: JobHandler) {
  handlers.set(name, handler);
}

/** Claim and run up to `limit` due jobs. Returns the number processed. */
export async function runDueJobs(limit = 10): Promise<number> {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "BackgroundJob" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "BackgroundJob"
      WHERE (status = 'QUEUED' AND "runAt" <= now())
         OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  for (const { id } of claimed) {
    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    const handler = handlers.get(job.name);
    try {
      if (!handler) throw new Error(`No handler registered for ${job.name}`);
      await handler(job.payload as Record<string, unknown>);
      await prisma.backgroundJob.update({ where: { id }, data: { status: 'COMPLETED', lockedAt: null, lastError: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const failed = job.attempts >= job.maxAttempts;
      // Exponential backoff: 1, 2, 4, 8… minutes
      const delay = Math.min(60, 2 ** (job.attempts - 1)) * 60_000;
      await prisma.backgroundJob.update({
        where: { id },
        data: { status: failed ? 'FAILED' : 'QUEUED', lockedAt: null, lastError: msg.slice(0, 2000), runAt: new Date(Date.now() + delay) },
      });
      logger.error({ job: job.name, id, attempt: job.attempts, err: msg }, 'job failed');
    }
  }
  return claimed.length;
}

let timer: NodeJS.Timeout | null = null;

export function startWorker(intervalMs = 5000) {
  if (timer) return;
  const tick = async () => {
    try {
      while ((await runDueJobs(20)) > 0) {
        /* drain */
      }
    } catch (e) {
      logger.error({ err: e }, 'worker tick failed');
    }
  };
  timer = setInterval(() => void tick(), intervalMs);
  void tick();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
