import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { FeedPost } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { sha256 } from '../../lib/crypto';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { body, parse, safeUrl } from '../../lib/validate';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff, resolvePublicTenant } from '../../middleware/tenant';
import { hasEntitlement } from '../../services/access';
import { localStorage, signMediaUrl } from '../../services/storage';
import { tenantPlan } from '../../services/plans';
import { audit } from '../../services/audit';
import { communityRole } from '../community/access';

const id = z.string().uuid();

/** PUBLIC: anyone. MEMBERS: any active member. PAID: holders of the linked product. */
async function canView(post: FeedPost, userId?: string) {
  if (post.visibility === 'PUBLIC') return true;
  if (!userId) return false;
  const role = await communityRole(userId, post.tenantId);
  if (role.staff || role.moderator) return true;
  if (post.visibility === 'MEMBERS') return role.member;
  return !!post.productId && ((await hasEntitlement(userId, post.tenantId, 'PRODUCT', post.productId)) || (await hasEntitlement(userId, post.tenantId, 'MEMBERSHIP', post.productId)));
}

export const feedPublicRouter = Router({ mergeParams: true });
feedPublicRouter.use(resolvePublicTenant);

feedPublicRouter.get('/', optionalAuth, async (req, res) => {
  const before = req.query.before ? new Date(String(req.query.before)) : undefined;
  const posts = await prisma.feedPost.findMany({
    where: { tenantId: req.tenant!.id, status: 'VISIBLE', deletedAt: null, ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { _count: { select: { likes: true, comments: { where: { status: 'VISIBLE' } } } } },
  });
  const viewer = req.user?.id;
  const liked = viewer ? new Set((await prisma.feedLike.findMany({ where: { userId: viewer, postId: { in: posts.map((p) => p.id) } } })).map((l) => l.postId)) : new Set();
  const authors = await prisma.user.findMany({ where: { id: { in: posts.map((p) => p.authorId) } }, select: { id: true, name: true, avatarUrl: true } });
  const items = await Promise.all(
    posts.map(async (p) => {
      const ok = await canView(p, viewer);
      return {
        id: p.id,
        caption: p.caption,
        thumbnailUrl: p.thumbnailUrl,
        visibility: p.visibility,
        author: authors.find((a) => a.id === p.authorId),
        createdAt: p.createdAt,
        likes: p._count.likes,
        comments: p._count.comments,
        views: p.viewCount,
        liked: liked.has(p.id),
        locked: !ok,
        // Signed, short-lived video URL only for viewers who may watch
        videoUrl: ok ? signMediaUrl(p.mediaAssetId, viewer ?? 'public', 3600) : null,
      };
    }),
  );
  res.json({ items });
});

feedPublicRouter.post('/:postId/view', optionalAuth, async (req, res) => {
  const post = await prisma.feedPost.findFirst({ where: { id: parse(id, req.params.postId), tenantId: req.tenant!.id, deletedAt: null } });
  if (!post) throw notFound();
  // One view per user (or per anonymised IP+UA) per post
  const viewerKey = req.user ? `u:${req.user.id}` : `a:${sha256(`${req.ip}|${req.get('user-agent') ?? ''}`).slice(0, 32)}`;
  const r = await prisma.feedView.createMany({ data: [{ postId: post.id, viewerKey }], skipDuplicates: true });
  if (r.count) await prisma.feedPost.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } });
  res.json({ ok: true });
});

feedPublicRouter.post('/:postId/like', requireAuth, async (req, res) => {
  const post = await prisma.feedPost.findFirst({ where: { id: parse(id, req.params.postId), tenantId: req.tenant!.id, deletedAt: null, status: 'VISIBLE' } });
  if (!post || !(await canView(post, req.user!.id))) throw notFound();
  const k = { postId_userId: { postId: post.id, userId: req.user!.id } };
  const existing = await prisma.feedLike.findUnique({ where: k });
  if (existing) await prisma.feedLike.delete({ where: k });
  else await prisma.feedLike.create({ data: { postId: post.id, userId: req.user!.id } });
  res.json({ liked: !existing });
});

feedPublicRouter.get('/:postId/comments', optionalAuth, async (req, res) => {
  const post = await prisma.feedPost.findFirst({ where: { id: parse(id, req.params.postId), tenantId: req.tenant!.id, deletedAt: null } });
  if (!post || !(await canView(post, req.user?.id))) throw notFound();
  const comments = await prisma.feedComment.findMany({ where: { postId: post.id, status: 'VISIBLE' }, orderBy: { createdAt: 'asc' }, take: 200 });
  const users = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.userId) } }, select: { id: true, name: true } });
  res.json({ comments: comments.map((c) => ({ ...c, user: users.find((u) => u.id === c.userId) })) });
});

feedPublicRouter.post('/:postId/comments', requireAuth, async (req, res) => {
  const post = await prisma.feedPost.findFirst({ where: { id: parse(id, req.params.postId), tenantId: req.tenant!.id, deletedAt: null, status: 'VISIBLE' } });
  if (!post || !(await canView(post, req.user!.id))) throw notFound();
  const role = await communityRole(req.user!.id, post.tenantId);
  if (!role.member) throw forbidden('Join this creator’s community to comment');
  const input = body(req, z.object({ body: z.string().trim().min(1).max(1000) }));
  const recent = await prisma.feedComment.count({ where: { userId: req.user!.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent >= 10) throw badRequest('You are commenting too quickly');
  res.status(201).json({ comment: await prisma.feedComment.create({ data: { tenantId: post.tenantId, postId: post.id, userId: req.user!.id, body: input.body } }) });
});

feedPublicRouter.post('/:postId/report', requireAuth, async (req, res) => {
  const post = await prisma.feedPost.findFirst({ where: { id: parse(id, req.params.postId), tenantId: req.tenant!.id } });
  if (!post) throw notFound();
  const { reason } = body(req, z.object({ reason: z.string().trim().min(3).max(500) }));
  await prisma.contentReport.create({ data: { tenantId: post.tenantId, reporterId: req.user!.id, entityType: 'feed_post', entityId: post.id, reason } });
  res.status(201).json({ ok: true });
});

const VIDEO_TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
const memberUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2000 * 1024 * 1024, files: 1 } });

/** Member video upload (only when the creator enables member posts) */
feedPublicRouter.post('/upload', requireAuth, memberUpload.single('file'), async (req, res) => {
  const tenant = req.tenant!;
  const role = await communityRole(req.user!.id, tenant.id);
  if (!role.staff && !(tenant.memberFeedPosts && role.member)) throw forbidden('Only the creator team can post here');
  const file = req.file;
  if (!file || !VIDEO_TYPES[file.mimetype]) throw badRequest('Upload an MP4, WebM or MOV video');
  if (file.size > tenant.maxVideoMb * 1024 * 1024) throw badRequest(`Videos can be up to ${tenant.maxVideoMb} MB`);
  const { limits } = await tenantPlan(tenant.id);
  if (typeof limits.storageMb === 'number') {
    const used = await prisma.mediaAsset.aggregate({ where: { tenantId: tenant.id, deletedAt: null }, _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0) + file.size > limits.storageMb * 1024 * 1024) throw forbidden('This creator has reached their storage limit');
  }
  const assetId = randomUUID();
  const key = `${tenant.id}/feed/${assetId}${VIDEO_TYPES[file.mimetype]}`;
  await localStorage.put(key, file.buffer);
  const asset = await prisma.mediaAsset.create({
    data: { id: assetId, tenantId: tenant.id, uploaderId: req.user!.id, kind: 'VIDEO', visibility: 'PRIVATE', storageKey: key, filename: file.originalname.slice(0, 200), mimeType: file.mimetype, sizeBytes: file.size },
  });
  res.status(201).json({ asset: { id: asset.id } });
});

/**
 * Members (when the creator allows it) post short videos. The video must already
 * be uploaded via a member upload; staff use the media library.
 */
feedPublicRouter.post('/', requireAuth, async (req, res) => {
  const tenant = req.tenant!;
  const role = await communityRole(req.user!.id, tenant.id);
  if (!role.staff && !(tenant.memberFeedPosts && role.member)) throw forbidden('Only the creator team can post here');
  const input = body(
    req,
    z.object({
      mediaAssetId: z.string().uuid(),
      caption: z.string().trim().max(2200).optional(),
      thumbnailUrl: safeUrl.optional(),
      visibility: z.enum(['PUBLIC', 'MEMBERS', 'PAID']).default('PUBLIC'),
      productId: z.string().uuid().optional(),
    }),
  );
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.mediaAssetId, tenantId: tenant.id, kind: 'VIDEO', deletedAt: null } });
  if (!asset) throw badRequest('Upload a video first');
  if (!role.staff && asset.uploaderId !== req.user!.id) throw forbidden();
  if (asset.sizeBytes > tenant.maxVideoMb * 1024 * 1024) throw badRequest(`Videos can be up to ${tenant.maxVideoMb} MB`);
  if (input.visibility === 'PAID' && (!role.staff || !input.productId)) throw badRequest('Paid posts need a product and can only be created by the creator team');
  const recent = await prisma.feedPost.count({ where: { authorId: req.user!.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (!role.staff && recent >= 5) throw badRequest('You can post up to 5 videos per hour');
  const post = await prisma.feedPost.create({ data: { ...input, tenantId: tenant.id, authorId: req.user!.id } });
  res.status(201).json({ post });
});

// ---- Creator moderation & analytics (X-Tenant) ----

export const feedAdminRouter = Router();
feedAdminRouter.use(requireAuth, requireTenantStaff, can('community.moderate'));

feedAdminRouter.get('/', async (req, res) => {
  const posts = await prisma.feedPost.findMany({ where: { tenantId: req.tenant!.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { likes: true, comments: true } } } });
  const reports = await prisma.contentReport.groupBy({ by: ['entityId'], where: { tenantId: req.tenant!.id, entityType: 'feed_post', status: 'OPEN' }, _count: true });
  res.json({ posts: posts.map((p) => ({ ...p, openReports: reports.find((r) => r.entityId === p.id)?._count ?? 0 })) });
});

feedAdminRouter.patch('/:postId', async (req, res) => {
  const post = await prisma.feedPost.findFirst({ where: { id: parse(id, req.params.postId), tenantId: req.tenant!.id } });
  if (!post) throw notFound();
  const input = body(req, z.object({ status: z.enum(['VISIBLE', 'HIDDEN']).optional(), deleted: z.boolean().optional() }));
  await prisma.feedPost.update({ where: { id: post.id }, data: { status: input.status, deletedAt: input.deleted ? new Date() : undefined } });
  await prisma.contentReport.updateMany({ where: { entityId: post.id, status: 'OPEN' }, data: { status: 'ACTIONED', resolvedAt: new Date() } });
  await audit({ action: 'feed.moderate', entityType: 'feed_post', entityId: post.id, metadata: input, req });
  res.json({ ok: true });
});

feedAdminRouter.put('/settings', can('workspace.manage'), async (req, res) => {
  const input = body(req, z.object({ memberFeedPosts: z.boolean(), maxVideoMb: z.number().int().min(5).max(2000) }));
  await prisma.tenant.update({ where: { id: req.tenant!.id }, data: input });
  res.json({ ok: true });
});
