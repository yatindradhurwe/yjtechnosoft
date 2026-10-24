import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** True when a Prisma error is a unique-constraint violation */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** True when Postgres rejected the write because of an exclusion / check constraint */
export function isConstraintViolation(e: unknown, name: string): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes(name);
}
