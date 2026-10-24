import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { env } from '../../config/env';

/** Marketing-site content (published CMS pages, settings, public plans) */
export const publicRouter = Router();

publicRouter.get('/site', async (_req, res) => {
  const [settings, nav] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'site' } }),
    prisma.cmsPage.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { navOrder: 'asc' }, select: { slug: true, title: true } }),
  ]);
  res.set('cache-control', 'public, max-age=60');
  res.json({ settings: settings?.value ?? { brandName: env.BRAND_NAME }, nav });
});

publicRouter.get('/pages/*slug', async (req, res) => {
  const parts = (req.params as unknown as { slug: string[] }).slug;
  const slug = parts.join('/') || 'home';
  const page = await prisma.cmsPage.findFirst({ where: { slug, status: 'PUBLISHED' }, select: { slug: true, title: true, sections: true, seo: true, updatedAt: true } });
  if (!page) throw notFound('Page not found');
  res.set('cache-control', 'public, max-age=60');
  res.json({ page });
});

publicRouter.get('/plans', async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true, isPublic: true },
    orderBy: { sortOrder: 'asc' },
    select: { key: true, name: true, description: true, currency: true, priceMonthly: true, priceYearly: true, platformFeeBps: true, limits: true },
  });
  res.json({ plans });
});

publicRouter.get('/announcements', async (_req, res) => {
  const now = new Date();
  const items = await prisma.announcement.findMany({
    where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  res.json({ announcements: items });
});

/** sitemap.xml for the marketing site */
publicRouter.get('/sitemap.xml', async (_req, res) => {
  const pages = await prisma.cmsPage.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, seo: true } });
  const urls = pages
    .filter((p) => !(p.seo as { noindex?: boolean })?.noindex)
    .map((p) => `<url><loc>${env.APP_URL}/${p.slug === 'home' ? '' : p.slug}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`)
    .join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});
