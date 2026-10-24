import { afterAll, beforeAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { testOutbox } from '../src/services/email';

/** Truncate every table before each test file so files are independent */
beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  testOutbox.length = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});
