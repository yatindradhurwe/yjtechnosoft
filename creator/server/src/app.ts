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
import { adminRouter } from './modules/admin/routes';
import { publicRouter } from './modules/public/routes';
import { mediaRouter } from './modules/media/routes';
import { coursesRouter } from './modules/courses/routes';
import { productsRouter, couponsRouter } from './modules/products/routes';
import { storefrontRouter } from './modules/storefront/routes';
import { webhooksRouter } from './modules/commerce/webhooks';
import { ordersRouter, customersRouter, financeRouter } from './modules/commerce/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { learnRouter, certificatePublicRouter } from './modules/learn/routes';

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
  app.use('/api/admin', adminRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/public/certificates', certificatePublicRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/coupons', couponsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/learn', learnRouter);
  app.use('/api/store/:tenantSlug', storefrontRouter);
  app.use('/api/webhooks', webhooksRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
