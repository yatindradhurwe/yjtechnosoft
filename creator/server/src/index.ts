import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { attachRealtime } from './services/realtime';
import { startWorker, stopWorker } from './services/jobs';
import { registerJobs, startSweeps, stopSweeps } from './jobs';

const app = createApp();
const server = http.createServer(app);
attachRealtime(server);
registerJobs();

server.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
  // Run the background worker in-process unless a dedicated worker is used (see docs/DEPLOYMENT.md)
  if (!env.DISABLE_WORKER) {
    startWorker();
    startSweeps();
  }
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopWorker();
  stopSweeps();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
