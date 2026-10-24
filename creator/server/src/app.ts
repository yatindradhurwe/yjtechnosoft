import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env, isTest } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth/routes';
import { tenantRouter } from './modules/tenants/routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false, // the API serves JSON; the SPA sets its own CSP via Nginx
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
      credentials: true,
      allowedHeaders: ['content-type', 'authorization', 'x-tenant', 'x-requested-with', 'x-visitor-id'],
    }),
  );
  if (!isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  // Keep the raw body so payment webhooks can verify signatures byte-for-byte
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  app.use('/api', apiLimiter);

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, database: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, database: 'down' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', tenantRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
