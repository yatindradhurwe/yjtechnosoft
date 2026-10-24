import { Router } from 'express';
import { z } from 'zod';
import type { ResourceType } from '@prisma/client';
import { prisma, isUniqueViolation, Db } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { body, pageArgs, pagination, parse, query, safeUrl, slug, slugify } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { assertWithinLimit } from '../../services/plans';

export const productsRouter = Router();
productsRouter.use(requireAuth, requireTenantStaff);

const id = z.string().uuid();

const priceSchema = z
  .object({
    label: z.string().trim().max(60).nullable().optional(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
    amount: z.number().int().min(0).max(100_000_000),
    compareAtAmount: z.number().int().min(0).nullable().optional(),
    type: z.enum(['ONE_TIME', 'RECURRING']).default('ONE_TIME'),
    interval: z.enum(['MONTH', 'QUARTER', 'YEAR']).nullable().optional(),
    accessDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .refine((p) => p.type === 'ONE_TIME' || !!p.interval, 'Recurring prices need a billing interval')
  .refine((p) => p.amount === 0 || p.amount >= 100, 'Paid prices must be at least 1.00 (100 in minor units)')
  .refine((p) => !p.compareAtAmount || p.compareAtAmount > p.amount, 'Compare-at price must be higher than the price');

const itemSchema = z.object({
  resourceType: z.enum(['COURSE', 'DOWNLOAD', 'COMMUNITY', 'WORKSHOP', 'CONSULTATION']),
  resourceId: z.string().uuid(),
});

/** Every granted resource must belong to the same workspace */
async function assertItemsOwned(db: Db, tenantId: string, items: { resourceType: ResourceType; resourceId: string }[]) {
  for (const it of items) {
    const where = { id: it.resourceId, tenantId };
    const found =
      it.resourceType === 'COURSE'
        ? await db.course.findFirst({ where: { ...where, deletedAt: null } })
        : it.resourceType === 'DOWNLOAD'
          ? await db.mediaAsset.findFirst({ where: { ...where, deletedAt: null } })
          : it.resourceType === 'COMMUNITY'
            ? await db.community.findFirst({ where })
            : it.resourceType === 'WORKSHOP'
              ? await db.workshop.findFirst({ where })
              : await db.consultationOffering.findFirst({ where });
    if (!found) throw badRequest(`${it.resourceType.toLowerCase()} ${it.resourceId} not found in this workspace`);
  }
}

async function loadProduct(tenantId: string, productId: string) {
  const p = await prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null }, include: { prices: { orderBy: { createdAt: 'asc' } }, items: true } });
  if (!p) throw notFound('Product not found');
  return p;
}

productsRouter.get('/', can('products.read'), async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(), type: z.string().optional() }));
  const where = {
    tenantId: req.tenant!.id,
    deletedAt: null,
    status: p.status,
    type: p.type as never,
    ...(p.q ? { title: { contains: p.q, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, ...pageArgs(p), include: { prices: { where: { active: true } }, items: true } }),
    prisma.product.count({ where }),
  ]);
  const sales = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { in: items.map((i) => i.id) }, order: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
    _sum: { total: true },
    _count: true,
  });
  res.json({
    items: items.map((i) => {
      const s = sales.find((x) => x.productId === i.id);
      return { ...i, salesCount: s?._count ?? 0, revenue: s?._sum.total ?? 0 };
    }),
    total,
    page: p.page,
    pageSize: p.pageSize,
  });
});

const productSchema = z.object({
  type: z.enum(['COURSE', 'BUNDLE', 'DIGITAL_DOWNLOAD', 'MEMBERSHIP', 'WORKSHOP', 'CONSULTATION']),
  title: z.string().trim().min(2).max(150),
  slug: slug.optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  coverUrl: safeUrl.nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  featured: z.boolean().optional(),
});

productsRouter.post('/', can('products.write'), async (req, res) => {
  const input = body(req, productSchema.extend({ items: z.array(itemSchema).max(50).default([]), prices: z.array(priceSchema).min(1).max(10) }));
  const tenantId = req.tenant!.id;
  await assertWithinLimit(tenantId, 'maxProducts', await prisma.product.count({ where: { tenantId, deletedAt: null } }));
  await assertItemsOwned(prisma, tenantId, input.items);
  const { items, prices, ...meta } = input;
  try {
    const product = await prisma.product.create({
      data: {
        ...meta,
        slug: meta.slug ?? slugify(meta.title),
        tenantId,
        items: { create: items },
        prices: { create: prices.map((pr) => ({ ...pr, tenantId })) },
      },
      include: { prices: true, items: true },
    });
    await audit({ action: 'product.create', entityType: 'product', entityId: product.id, req });
    res.status(201).json({ product });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A product with this URL already exists');
    throw e;
  }
});

productsRouter.get('/:productId', can('products.read'), async (req, res) => {
  res.json({ product: await loadProduct(req.tenant!.id, parse(id, req.params.productId)) });
});

productsRouter.patch('/:productId', can('products.write'), async (req, res) => {
  const product = await loadProduct(req.tenant!.id, parse(id, req.params.productId));
  const input = body(req, productSchema.partial().omit({ type: true }));
  try {
    res.json({ product: await prisma.product.update({ where: { id: product.id }, data: input, include: { prices: true, items: true } }) });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A product with this URL already exists');
    throw e;
  }
});

productsRouter.post('/:productId/status', can('products.write'), async (req, res) => {
  const product = await loadProduct(req.tenant!.id, parse(id, req.params.productId));
  const { status } = body(req, z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) }));
  if (status === 'PUBLISHED') {
    if (!product.prices.some((p) => p.active)) throw badRequest('Add an active price before publishing');
    if (['COURSE', 'BUNDLE', 'DIGITAL_DOWNLOAD'].includes(product.type) && !product.items.length) throw badRequest('Attach the content buyers receive before publishing');
    // A course product can only go live when its course is live
    for (const it of product.items.filter((i) => i.resourceType === 'COURSE')) {
      const c = await prisma.course.findUnique({ where: { id: it.resourceId } });
      if (!c || !['PUBLISHED', 'SCHEDULED'].includes(c.status)) throw badRequest(`Publish the course "${c?.title ?? ''}" first`);
    }
  }
  const updated = await prisma.product.update({ where: { id: product.id }, data: { status } });
  await audit({ action: `product.${status.toLowerCase()}`, entityType: 'product', entityId: product.id, req });
  res.json({ product: updated });
});

productsRouter.put('/:productId/items', can('products.write'), async (req, res) => {
  const product = await loadProduct(req.tenant!.id, parse(id, req.params.productId));
  const { items } = body(req, z.object({ items: z.array(itemSchema).max(50) }));
  await assertItemsOwned(prisma, req.tenant!.id, items);
  await prisma.$transaction([prisma.productItem.deleteMany({ where: { productId: product.id } }), prisma.productItem.createMany({ data: items.map((i) => ({ ...i, productId: product.id })) })]);
  res.json({ product: await loadProduct(req.tenant!.id, product.id) });
});

productsRouter.post('/:productId/prices', can('products.write'), async (req, res) => {
  const product = await loadProduct(req.tenant!.id, parse(id, req.params.productId));
  const input = body(req, priceSchema);
  res.status(201).json({ price: await prisma.productPrice.create({ data: { ...input, tenantId: req.tenant!.id, productId: product.id } }) });
});

/** Amount changes create a new price row so existing orders keep their history */
productsRouter.patch('/prices/:priceId', can('products.write'), async (req, res) => {
  const price = await prisma.productPrice.findFirst({ where: { id: parse(id, req.params.priceId), tenantId: req.tenant!.id } });
  if (!price) throw notFound('Price not found');
  const input = body(req, z.object({ label: z.string().trim().max(60).nullable().optional(), active: z.boolean().optional(), compareAtAmount: z.number().int().min(0).nullable().optional() }));
  res.json({ price: await prisma.productPrice.update({ where: { id: price.id }, data: input }) });
});

productsRouter.delete('/:productId', can('products.write'), async (req, res) => {
  const product = await loadProduct(req.tenant!.id, parse(id, req.params.productId));
  const orders = await prisma.orderItem.count({ where: { productId: product.id } });
  if (orders) {
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });
    await audit({ action: 'product.archived', entityType: 'product', entityId: product.id, req });
    return res.json({ ok: true, archived: true });
  }
  await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `${product.slug}-deleted-${Date.now()}` } });
  await audit({ action: 'product.delete', entityType: 'product', entityId: product.id, req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const couponsRouter = Router();
couponsRouter.use(requireAuth, requireTenantStaff);

const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3–30 letters, numbers, - or _'),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.number().int().min(1),
    maxRedemptions: z.number().int().min(1).nullable().optional(),
    perUserLimit: z.number().int().min(0).max(100).default(1),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    productIds: z.array(z.string().uuid()).max(100).default([]),
    active: z.boolean().default(true),
  })
  .refine((c) => c.type !== 'PERCENT' || c.value <= 10000, 'Percent coupons are entered in basis points (max 10000 = 100%)')
  .refine((c) => !c.startsAt || !c.endsAt || c.endsAt > c.startsAt, 'End date must be after the start date');

couponsRouter.get('/', can('products.read'), async (req, res) => {
  res.json({ coupons: await prisma.coupon.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { createdAt: 'desc' } }) });
});

couponsRouter.post('/', can('products.write'), async (req, res) => {
  const input = body(req, couponSchema);
  if (input.productIds.length) {
    const n = await prisma.product.count({ where: { tenantId: req.tenant!.id, id: { in: input.productIds } } });
    if (n !== input.productIds.length) throw badRequest('Some products were not found');
  }
  try {
    const coupon = await prisma.coupon.create({ data: { ...input, tenantId: req.tenant!.id } });
    await audit({ action: 'coupon.create', entityType: 'coupon', entityId: coupon.id, metadata: { code: coupon.code }, req });
    res.status(201).json({ coupon });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('This coupon code already exists');
    throw e;
  }
});

couponsRouter.patch('/:couponId', can('products.write'), async (req, res) => {
  const c = await prisma.coupon.findFirst({ where: { id: parse(id, req.params.couponId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Coupon not found');
  const input = body(req, z.object({ active: z.boolean().optional(), endsAt: z.coerce.date().nullable().optional(), maxRedemptions: z.number().int().min(1).nullable().optional() }));
  res.json({ coupon: await prisma.coupon.update({ where: { id: c.id }, data: input }) });
});

couponsRouter.delete('/:couponId', can('products.write'), async (req, res) => {
  const c = await prisma.coupon.findFirst({ where: { id: parse(id, req.params.couponId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Coupon not found');
  if (c.redeemedCount) await prisma.coupon.update({ where: { id: c.id }, data: { active: false } });
  else await prisma.coupon.delete({ where: { id: c.id } });
  res.json({ ok: true });
});
