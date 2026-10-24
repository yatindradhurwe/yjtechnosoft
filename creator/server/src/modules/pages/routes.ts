import { Router } from 'express';
import dns from 'node:dns/promises';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { randomToken } from '../../lib/crypto';
import { blocksSchema, seoSchema } from '../../lib/blocks';
import { body, hexColor, parse, slug } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff, resolvePublicTenant } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { assertFeature } from '../../services/plans';
import { env } from '../../config/env';

const id = z.string().uuid();

export const pagesRouter = Router();
pagesRouter.use(requireAuth, requireTenantStaff);

/** Page document = blocks + page-level theme overrides */
export const pageDocSchema = z.object({
  blocks: blocksSchema,
  theme: z
    .object({
      primaryColor: hexColor.optional(),
      background: hexColor.optional(),
      text: hexColor.optional(),
      font: z.enum(['Inter', 'Poppins', 'Lora', 'Playfair Display', 'DM Sans', 'Space Grotesk']).optional(),
      radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
    })
    .default({}),
});

async function loadPage(tenantId: string, pageId: string) {
  const p = await prisma.landingPage.findFirst({ where: { id: pageId, tenantId, deletedAt: null } });
  if (!p) throw notFound('Page not found');
  return p;
}

pagesRouter.get('/', can('pages.write'), async (req, res) => {
  const pages = await prisma.landingPage.findMany({ where: { tenantId: req.tenant!.id, deletedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true, slug: true, title: true, status: true, updatedAt: true, publishedVersionId: true } });
  res.json({ pages });
});

pagesRouter.post('/', can('pages.write'), async (req, res) => {
  const input = body(req, z.object({ title: z.string().trim().min(1).max(120), slug, draft: pageDocSchema.default({ blocks: [], theme: {} }), seo: seoSchema }));
  try {
    const page = await prisma.landingPage.create({ data: { ...input, tenantId: req.tenant!.id } });
    res.status(201).json({ page });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A page with this URL already exists');
    throw e;
  }
});

pagesRouter.get('/:pageId', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  const versions = await prisma.pageVersion.findMany({ where: { pageId: page.id }, orderBy: { version: 'desc' }, take: 30, select: { id: true, version: true, createdAt: true, createdById: true } });
  res.json({ page, versions });
});

/** Save the working draft (autosave). The draft is never public. */
pagesRouter.put('/:pageId', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  const input = body(req, z.object({ title: z.string().trim().min(1).max(120), slug, draft: pageDocSchema, seo: seoSchema }));
  try {
    res.json({ page: await prisma.landingPage.update({ where: { id: page.id }, data: input }) });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A page with this URL already exists');
    throw e;
  }
});

/** Publish: snapshot the draft as a new immutable version */
pagesRouter.post('/:pageId/publish', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  const doc = pageDocSchema.parse(page.draft);
  if (!doc.blocks.length) throw badRequest('Add at least one section before publishing');
  const version = await prisma.$transaction(async (tx) => {
    const last = await tx.pageVersion.aggregate({ where: { pageId: page.id }, _max: { version: true } });
    const v = await tx.pageVersion.create({ data: { pageId: page.id, version: (last._max.version ?? 0) + 1, content: doc, createdById: req.user!.id } });
    await tx.landingPage.update({ where: { id: page.id }, data: { status: 'PUBLISHED', publishedVersionId: v.id } });
    return v;
  });
  await audit({ action: 'page.publish', entityType: 'page', entityId: page.id, metadata: { version: version.version }, req });
  res.json({ version: version.version });
});

pagesRouter.post('/:pageId/unpublish', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  await prisma.landingPage.update({ where: { id: page.id }, data: { status: 'DRAFT' } });
  res.json({ ok: true });
});

/** Rollback: copy an earlier version into the draft (publish again to make it live) */
pagesRouter.post('/:pageId/versions/:versionId/restore', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  const v = await prisma.pageVersion.findFirst({ where: { id: parse(id, req.params.versionId), pageId: page.id } });
  if (!v) throw notFound('Version not found');
  res.json({ page: await prisma.landingPage.update({ where: { id: page.id }, data: { draft: v.content as object } }) });
});

pagesRouter.post('/:pageId/duplicate', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  const copy = await prisma.landingPage.create({ data: { tenantId: page.tenantId, title: `${page.title} (copy)`, slug: `${page.slug}-copy-${Date.now().toString(36)}`, draft: page.draft as object, seo: page.seo as object } });
  res.status(201).json({ page: copy });
});

pagesRouter.delete('/:pageId', can('pages.write'), async (req, res) => {
  const page = await loadPage(req.tenant!.id, parse(id, req.params.pageId));
  await prisma.landingPage.update({ where: { id: page.id }, data: { deletedAt: new Date(), status: 'DRAFT', slug: `${page.slug}-deleted-${Date.now()}` } });
  res.json({ ok: true });
});

// ---- Themes ----

const themeTokens = z.object({
  primaryColor: hexColor,
  accentColor: hexColor,
  background: hexColor,
  surface: hexColor,
  text: hexColor,
  font: z.enum(['Inter', 'Poppins', 'Lora', 'Playfair Display', 'DM Sans', 'Space Grotesk']),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']),
  mode: z.enum(['light', 'dark']),
});

pagesRouter.get('/themes/all', can('pages.write'), async (req, res) => {
  res.json({ themes: await prisma.theme.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' } }) });
});

pagesRouter.post('/themes/all', can('pages.write'), async (req, res) => {
  const input = body(req, z.object({ name: z.string().trim().min(1).max(60), tokens: themeTokens, activate: z.boolean().default(false) }));
  const theme = await prisma.$transaction(async (tx) => {
    if (input.activate) await tx.theme.updateMany({ where: { tenantId: req.tenant!.id }, data: { isActive: false } });
    const t = await tx.theme.create({ data: { tenantId: req.tenant!.id, name: input.name, tokens: input.tokens, isActive: input.activate } });
    if (input.activate) await tx.tenant.update({ where: { id: req.tenant!.id }, data: { primaryColor: input.tokens.primaryColor, accentColor: input.tokens.accentColor, fontFamily: input.tokens.font } });
    return t;
  });
  res.status(201).json({ theme });
});

pagesRouter.post('/themes/:themeId/activate', can('pages.write'), async (req, res) => {
  const t = await prisma.theme.findFirst({ where: { id: parse(id, req.params.themeId), tenantId: req.tenant!.id } });
  if (!t) throw notFound('Theme not found');
  const tokens = themeTokens.parse(t.tokens);
  await prisma.$transaction([
    prisma.theme.updateMany({ where: { tenantId: t.tenantId }, data: { isActive: false } }),
    prisma.theme.update({ where: { id: t.id }, data: { isActive: true } }),
    prisma.tenant.update({ where: { id: t.tenantId }, data: { primaryColor: tokens.primaryColor, accentColor: tokens.accentColor, fontFamily: tokens.font } }),
  ]);
  res.json({ ok: true });
});

// ---- Custom domains ----

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a domain like courses.example.com');

pagesRouter.get('/domains/all', can('workspace.manage'), async (req, res) => {
  const domains = await prisma.customDomain.findMany({ where: { tenantId: req.tenant!.id } });
  res.json({
    domains: domains.map((d) => ({
      ...d,
      dns: [
        { type: 'TXT', name: `_creator-verify.${d.hostname}`, value: d.verificationToken },
        { type: 'CNAME', name: d.hostname, value: env.PLATFORM_DOMAIN ? `custom.${env.PLATFORM_DOMAIN}` : '(set PLATFORM_DOMAIN on the server)' },
      ],
    })),
  });
});

pagesRouter.post('/domains/all', can('workspace.manage'), async (req, res) => {
  await assertFeature(req.tenant!.id, 'customDomain');
  const input = body(req, z.object({ hostname }));
  if (env.PLATFORM_DOMAIN && (input.hostname === env.PLATFORM_DOMAIN || input.hostname.endsWith(`.${env.PLATFORM_DOMAIN}`))) throw badRequest('Use your own domain, not a platform subdomain');
  try {
    const d = await prisma.customDomain.create({ data: { tenantId: req.tenant!.id, hostname: input.hostname, verificationToken: `creator-verify=${randomToken(16)}` } });
    await audit({ action: 'domain.add', entityType: 'domain', entityId: d.id, metadata: { hostname: d.hostname }, req });
    res.status(201).json({ domain: d });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('This domain is already connected to a workspace');
    throw e;
  }
});

/** Verify ownership via a DNS TXT record. Only verified domains are routed. */
pagesRouter.post('/domains/:domainId/verify', can('workspace.manage'), async (req, res) => {
  const d = await prisma.customDomain.findFirst({ where: { id: parse(id, req.params.domainId), tenantId: req.tenant!.id } });
  if (!d) throw notFound('Domain not found');
  let records: string[][] = [];
  try {
    records = await dns.resolveTxt(`_creator-verify.${d.hostname}`);
  } catch {
    records = [];
  }
  const ok = records.some((r) => r.join('') === d.verificationToken);
  const updated = await prisma.customDomain.update({ where: { id: d.id }, data: { status: ok ? 'VERIFIED' : 'FAILED', verifiedAt: ok ? new Date() : d.verifiedAt, lastCheckedAt: new Date() } });
  await audit({ action: 'domain.verify', entityType: 'domain', entityId: d.id, metadata: { ok }, req });
  res.json({ domain: updated, verified: ok, message: ok ? 'Domain verified. HTTPS is issued automatically on the first visit.' : 'TXT record not found yet. DNS changes can take up to an hour.' });
});

pagesRouter.delete('/domains/:domainId', can('workspace.manage'), async (req, res) => {
  const r = await prisma.customDomain.deleteMany({ where: { id: parse(id, req.params.domainId), tenantId: req.tenant!.id } });
  if (!r.count) throw notFound('Domain not found');
  res.json({ ok: true });
});

// ---- Public rendering: /api/store/:tenantSlug/pages/:slug ----

export const pagesPublicRouter = Router({ mergeParams: true });
pagesPublicRouter.use(resolvePublicTenant);

pagesPublicRouter.get('/:pageSlug', async (req, res) => {
  const page = await prisma.landingPage.findFirst({ where: { tenantId: req.tenant!.id, slug: String(req.params.pageSlug), status: 'PUBLISHED', deletedAt: null } });
  if (!page?.publishedVersionId) throw notFound('Page not found');
  const v = await prisma.pageVersion.findUniqueOrThrow({ where: { id: page.publishedVersionId } });
  const doc = v.content as z.infer<typeof pageDocSchema>;
  // Resolve product blocks to live, published products of this workspace only
  const productIds = doc.blocks.flatMap((b) => (b.type === 'products' ? b.productIds : []));
  const wantsAll = doc.blocks.some((b) => b.type === 'products' && !b.productIds.length);
  const products = await prisma.product.findMany({
    where: { tenantId: req.tenant!.id, status: 'PUBLISHED', deletedAt: null, ...(wantsAll ? {} : { id: { in: productIds } }) },
    select: { id: true, slug: true, title: true, coverUrl: true, type: true, prices: { where: { active: true }, select: { amount: true, currency: true, compareAtAmount: true }, orderBy: { amount: 'asc' }, take: 1 } },
  });
  res.set('cache-control', 'public, max-age=30');
  res.json({ page: { title: page.title, slug: page.slug, seo: page.seo, ...doc }, products });
});

/** Host-based resolution for custom domains (used by the SSR/edge layer and the SPA) */
export const domainLookupRouter = Router();
domainLookupRouter.get('/', async (req, res) => {
  const host = String(req.query.host ?? '').toLowerCase().split(':')[0];
  const d = await prisma.customDomain.findFirst({ where: { hostname: host, status: 'VERIFIED' }, include: { tenant: { select: { slug: true, status: true } } } });
  if (d && d.tenant.status === 'ACTIVE') return res.json({ tenantSlug: d.tenant.slug });
  if (env.PLATFORM_DOMAIN && host.endsWith(`.${env.PLATFORM_DOMAIN}`)) {
    const t = await prisma.tenant.findFirst({ where: { slug: host.slice(0, -(env.PLATFORM_DOMAIN.length + 1)), status: 'ACTIVE', deletedAt: null } });
    if (t) return res.json({ tenantSlug: t.slug });
  }
  throw notFound('Unknown host');
});

/** Caddy on-demand TLS "ask" endpoint: only issue certificates for verified domains */
domainLookupRouter.get('/tls-allowed', async (req, res) => {
  const host = String(req.query.domain ?? '').toLowerCase();
  const d = await prisma.customDomain.findFirst({ where: { hostname: host, status: 'VERIFIED' } });
  res.status(d ? 200 : 404).end();
});
