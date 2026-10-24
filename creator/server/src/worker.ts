/** Dedicated background worker process (optional; see docs/DEPLOYMENT.md) */
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startWorker, stopWorker } from './services/jobs';
import { registerJobs, startSweeps, stopSweeps } from './jobs';

registerJobs();
startWorker();
startSweeps();
logger.info('worker started');

process.on('SIGTERM', async () => {
  stopWorker();
  stopSweeps();
  await prisma.$disconnect();
  process.exit(0);
});
