import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { body, parse, query, slug, slugify } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { emitTo } from '../../services/realtime';
import { awardPoints } from '../gamification/service';
import { canAccessCommunity, communityRole } from './access';

const id = z.string().uuid();

// ---------------------------------------------------------------------------
// Creator management: /api/community-admin (X-Tenant)
// ---------------------------------------------------------------------------

export const communityAdminRouter = Router();
communityAdminRouter.use(requireAuth, requireTenantStaff);

communityAdminRouter.get('/', can('community.write'), async (req, res) => {
  const items = await prisma.community.findMany({ where: { tenantId: req.tenant!.id }, include: { channels: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'asc' } });
  res.json({ items });
});

communityAdminRouter.post('/', can('community.write'), async (req, res) => {
  const input = body(req, z.object({ name: z.string().trim().min(2).max(80), slug: slug.optional(), description: z.string().trim().max(2000).nullable().optional(), access: z.enum(['FREE', 'PAID']) }));
  const c = await prisma.community.create({
    data: {
      tenantId: req.tenant!.id,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description,
      access: input.access,
      channels: {
        create: [
          { tenantId: req.tenant!.id, name: 'Announcements', type: 'ANNOUNCEMENT', position: 0 },
          { tenantId: req.tenant!.id, name: 'General', type: 'FEED', position: 1 },
        ],
      },
    },
    include: { channels: true },
  });
  await audit({ action: 'community.create', entityType: 'community', entityId: c.id, req });
  res.status(201).json({ community: c });
});

communityAdminRouter.patch('/:communityId', can('community.write'), async (req, res) => {
  const c = await prisma.community.findFirst({ where: { id: parse(id, req.params.communityId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Community not found');
  const input = body(req, z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(2000).nullable().optional(), access: z.enum(['FREE', 'PAID']).optional() }));
  res.json({ community: await prisma.community.update({ where: { id: c.id }, data: input }) });
});

communityAdminRouter.post('/:communityId/channels', can('community.write'), async (req, res) => {
  const c = await prisma.community.findFirst({ where: { id: parse(id, req.params.communityId), tenantId: req.tenant!.id } });
  if (!c) throw notFound('Community not found');
  const input = body(req, z.object({ name: z.string().trim().min(1).max(60), type: z.enum(['FEED', 'ANNOUNCEMENT']).default('FEED') }));
  const position = await prisma.channel.count({ where: { communityId: c.id } });
  res.status(201).json({ channel: await prisma.channel.create({ data: { ...input, tenantId: c.tenantId, communityId: c.id, position } }) });
});

communityAdminRouter.delete('/channels/:channelId', can('community.write'), async (req, res) => {
  const r = await prisma.channel.deleteMany({ where: { id: parse(id, req.params.channelId), tenantId: req.tenant!.id } });
  if (!r.count) throw notFound('Channel not found');
  res.json({ ok: true });
});

communityAdminRouter.get('/reports', can('community.moderate'), async (req, res) => {
  const status = parse(z.enum(['OPEN', 'ACTIONED', 'DISMISSED']).default('OPEN'), req.query.status);
  const reports = await prisma.contentReport.findMany({ where: { tenantId: req.tenant!.id, status }, orderBy: { createdAt: 'desc' }, take: 200 });
  const posts = await prisma.post.findMany({ where: { id: { in: reports.filter((r) => r.entityType === 'post').map((r) => r.entityId) } }, select: { id: true, body: true, authorId: true, status: true } });
  const comments = await prisma.comment.findMany({ where: { id: { in: reports.filter((r) => r.entityType === 'comment').map((r) => r.entityId) } }, select: { id: true, body: true, authorId: true, status: true } });
  res.json({ reports: reports.map((r) => ({ ...r, content: r.entityType === 'post' ? posts.find((p) => p.id === r.entityId) : comments.find((c) => c.id === r.entityId) })) });
});

communityAdminRouter.post('/reports/:reportId', can('community.moderate'), async (req, res) => {
  const r = await prisma.contentReport.findFirst({ where: { id: parse(id, req.params.reportId), tenantId: req.tenant!.id } });
  if (!r) throw notFound('Report not found');
  const input = body(req, z.object({ action: z.enum(['hide', 'dismiss', 'ban_author']) }));
  const content = r.entityType === 'post' ? await prisma.post.findUnique({ where: { id: r.entityId } }) : await prisma.comment.findUnique({ where: { id: r.entityId } });
  if (input.action !== 'dismiss' && content) {
    if (r.entityType === 'post') await prisma.post.update({ where: { id: r.entityId }, data: { status: 'HIDDEN' } });
    else await prisma.comment.update({ where: { id: r.entityId }, data: { status: 'HIDDEN' } });
  }
  if (input.action === 'ban_author' && content) {
    const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: r.tenantId, userId: content.authorId } } });
    if (m && !m.roles.some((x) => ['OWNER', 'ADMIN'].includes(x))) await prisma.membership.update({ where: { id: m.id }, data: { status: 'SUSPENDED' } });
  }
  await prisma.contentReport.updateMany({ where: { tenantId: r.tenantId, entityId: r.entityId, status: 'OPEN' }, data: { status: input.action === 'dismiss' ? 'DISMISSED' : 'ACTIONED', resolvedAt: new Date() } });
  await audit({ action: `community.report.${input.action}`, entityType: r.entityType, entityId: r.entityId, req });
  res.json({ ok: true });
});

communityAdminRouter.get('/analytics', can('community.write'), async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const tenantId = req.tenant!.id;
  const [posts, comments, reactions, activeAuthors] = await Promise.all([
    prisma.post.count({ where: { tenantId, createdAt: { gte: since }, deletedAt: null } }),
    prisma.comment.count({ where: { tenantId, createdAt: { gte: since }, deletedAt: null } }),
    prisma.reaction.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.post.findMany({ where: { tenantId, createdAt: { gte: since } }, distinct: ['authorId'], select: { authorId: true } }),
  ]);
  res.json({ posts30d: posts, comments30d: comments, reactions30d: reactions, activeMembers30d: activeAuthors.length });
});

// ---------------------------------------------------------------------------
// Member-facing: /api/community
// ---------------------------------------------------------------------------

export const communityRouter = Router();
communityRouter.use(requireAuth);

async function loadCommunity(communityId: string, userId: string) {
  const c = await prisma.community.findUnique({ where: { id: communityId }, include: { channels: { orderBy: { position: 'asc' } } } });
  if (!c) throw notFound('Community not found');
  if (!(await canAccessCommunity(userId, c))) throw forbidden(c.access === 'PAID' ? 'Join this community to see its posts' : 'Join this community first');
  return c;
}

async function loadChannel(channelId: string, userId: string) {
  const ch = await prisma.channel.findUnique({ where: { id: channelId }, include: { community: true } });
  if (!ch) throw notFound('Channel not found');
  if (!(await canAccessCommunity(userId, ch.community))) throw forbidden('You do not have access to this community');
  return ch;
}

async function blockedIds(tenantId: string, userId: string) {
  const rows = await prisma.userBlock.findMany({ where: { tenantId, blockerId: userId } });
  return rows.map((r) => r.blockedId);
}

/** Communities of a workspace visible to this user (by tenant slug) */
communityRouter.get('/store/:tenantSlug', async (req, res) => {
  const tenant = await prisma.tenant.findFirst({ where: { slug: String(req.params.tenantSlug), status: 'ACTIVE', deletedAt: null } });
  if (!tenant) throw notFound('Store not found');
  const items = await prisma.community.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, slug: true, description: true, access: true, tenantId: true } });
  const out = await Promise.all(items.map(async (c) => ({ ...c, canAccess: await canAccessCommunity(req.user!.id, c) })));
  res.json({ tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, primaryColor: tenant.primaryColor, logoUrl: tenant.logoUrl }, communities: out });
});

/** Join a FREE community (creates a STUDENT membership in the workspace) */
communityRouter.post('/:communityId/join', async (req, res) => {
  const c = await prisma.community.findUnique({ where: { id: parse(id, req.params.communityId) } });
  if (!c) throw notFound('Community not found');
  if (c.access !== 'FREE') throw forbidden('This is a paid community – purchase access from the store');
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: c.tenantId, userId: req.user!.id } } });
  if (m?.status === 'SUSPENDED') throw forbidden('You cannot join this community');
  if (!m) await prisma.membership.create({ data: { tenantId: c.tenantId, userId: req.user!.id, roles: ['STUDENT'] } });
  res.json({ ok: true });
});

communityRouter.get('/:communityId', async (req, res) => {
  const c = await loadCommunity(parse(id, req.params.communityId), req.user!.id);
  const role = await communityRole(req.user!.id, c.tenantId);
  res.json({ community: c, role });
});

communityRouter.get('/channels/:channelId/posts', async (req, res) => {
  const ch = await loadChannel(parse(id, req.params.channelId), req.user!.id);
  const q = query(req, z.object({ before: z.coerce.date().optional(), q: z.string().trim().max(100).optional() }));
  const role = await communityRole(req.user!.id, ch.tenantId);
  const blocked = await blockedIds(ch.tenantId, req.user!.id);
  const posts = await prisma.post.findMany({
    where: {
      channelId: ch.id,
      deletedAt: null,
      ...(role.moderator ? {} : { status: 'VISIBLE' }),
      authorId: { notIn: blocked },
      ...(q.before ? { createdAt: { lt: q.before } } : {}),
      ...(q.q ? { body: { contains: q.q, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    include: { _count: { select: { comments: { where: { deletedAt: null, status: 'VISIBLE' } } } }, reactions: { select: { emoji: true, userId: true } } },
  });
  const authors = await prisma.user.findMany({ where: { id: { in: posts.map((p) => p.authorId) } }, select: { id: true, name: true, avatarUrl: true } });
  res.json({
    channel: { id: ch.id, name: ch.name, type: ch.type },
    posts: posts.map((p) => ({
      ...p,
      author: authors.find((a) => a.id === p.authorId),
      reactions: Object.entries(p.reactions.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] ?? 0) + 1 }), {})).map(([emoji, count]) => ({ emoji, count, mine: p.reactions.some((r) => r.emoji === emoji && r.userId === req.user!.id) })),
      comments: p._count.comments,
      canEdit: p.authorId === req.user!.id,
    })),
  });
});

/** Simple spam guard: rate per author plus a link limit */
async function assertNotSpamming(tenantId: string, userId: string, text: string) {
  const recent = await prisma.post.count({ where: { tenantId, authorId: userId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  const recentComments = await prisma.comment.count({ where: { tenantId, authorId: userId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  if (recent + recentComments >= 20) throw badRequest('You are posting too quickly. Please wait a few minutes.');
  if ((text.match(/https?:\/\//g) ?? []).length > 3) throw badRequest('Posts can contain at most 3 links');
}

communityRouter.post('/channels/:channelId/posts', async (req, res) => {
  const ch = await loadChannel(parse(id, req.params.channelId), req.user!.id);
  const role = await communityRole(req.user!.id, ch.tenantId);
  if (ch.type === 'ANNOUNCEMENT' && !role.staff) throw forbidden('Only the creator team can post announcements');
  const input = body(req, z.object({ title: z.string().trim().max(150).optional(), body: z.string().trim().min(1).max(10000) }));
  await assertNotSpamming(ch.tenantId, req.user!.id, input.body);
  const post = await prisma.post.create({ data: { tenantId: ch.tenantId, channelId: ch.id, authorId: req.user!.id, ...input } });
  await awardPoints(prisma, { tenantId: ch.tenantId, userId: req.user!.id, points: 2, reason: 'Community post', sourceKey: `post:${post.id}` });
  emitTo(`channel:${ch.id}`, 'post:new', { id: post.id, channelId: ch.id });
  res.status(201).json({ post });
});

async function loadPost(postId: string, userId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { channel: { include: { community: true } } } });
  if (!post || post.deletedAt) throw notFound('Post not found');
  if (!(await canAccessCommunity(userId, post.channel.community))) throw forbidden('You do not have access to this community');
  const role = await communityRole(userId, post.tenantId);
  if (post.status === 'HIDDEN' && !role.moderator && post.authorId !== userId) throw notFound('Post not found');
  return { post, role };
}

communityRouter.patch('/posts/:postId', async (req, res) => {
  const { post, role } = await loadPost(parse(id, req.params.postId), req.user!.id);
  const input = body(req, z.object({ body: z.string().trim().min(1).max(10000).optional(), title: z.string().trim().max(150).optional(), pinned: z.boolean().optional(), status: z.enum(['VISIBLE', 'HIDDEN']).optional() }));
  const own = post.authorId === req.user!.id;
  if ((input.body !== undefined || input.title !== undefined) && !own) throw forbidden('You can only edit your own posts');
  if ((input.pinned !== undefined || input.status !== undefined) && !role.moderator && !role.staff) throw forbidden('Only moderators can pin or hide posts');
  const updated = await prisma.post.update({ where: { id: post.id }, data: input });
  if (input.status || input.pinned !== undefined) await audit({ action: 'community.post.moderate', tenantId: post.tenantId, entityType: 'post', entityId: post.id, metadata: input, req });
  res.json({ post: updated });
});

communityRouter.delete('/posts/:postId', async (req, res) => {
  const { post, role } = await loadPost(parse(id, req.params.postId), req.user!.id);
  if (post.authorId !== req.user!.id && !role.moderator) throw forbidden();
  await prisma.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
  if (post.authorId !== req.user!.id) await audit({ action: 'community.post.delete', tenantId: post.tenantId, entityType: 'post', entityId: post.id, req });
  res.json({ ok: true });
});

communityRouter.get('/posts/:postId/comments', async (req, res) => {
  const { post, role } = await loadPost(parse(id, req.params.postId), req.user!.id);
  const blocked = await blockedIds(post.tenantId, req.user!.id);
  const comments = await prisma.comment.findMany({
    where: { postId: post.id, deletedAt: null, authorId: { notIn: blocked }, ...(role.moderator ? {} : { status: 'VISIBLE' }) },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const authors = await prisma.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } }, select: { id: true, name: true, avatarUrl: true } });
  res.json({ comments: comments.map((c) => ({ ...c, author: authors.find((a) => a.id === c.authorId), canEdit: c.authorId === req.user!.id })) });
});

communityRouter.post('/posts/:postId/comments', async (req, res) => {
  const { post } = await loadPost(parse(id, req.params.postId), req.user!.id);
  const input = body(req, z.object({ body: z.string().trim().min(1).max(5000) }));
  await assertNotSpamming(post.tenantId, req.user!.id, input.body);
  const comment = await prisma.comment.create({ data: { tenantId: post.tenantId, postId: post.id, authorId: req.user!.id, body: input.body } });
  if (post.authorId !== req.user!.id) {
    await prisma.notification.create({ data: { tenantId: post.tenantId, userId: post.authorId, type: 'community.comment', title: `${req.user!.name} commented on your post`, link: `/community/${post.channel.communityId}?post=${post.id}` } });
  }
  emitTo(`channel:${post.channelId}`, 'comment:new', { postId: post.id, id: comment.id });
  res.status(201).json({ comment });
});

communityRouter.delete('/comments/:commentId', async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: parse(id, req.params.commentId) } });
  if (!c || c.deletedAt) throw notFound('Comment not found');
  const { role } = await loadPost(c.postId, req.user!.id);
  if (c.authorId !== req.user!.id && !role.moderator) throw forbidden();
  await prisma.comment.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

communityRouter.post('/posts/:postId/reactions', async (req, res) => {
  const { post } = await loadPost(parse(id, req.params.postId), req.user!.id);
  const input = body(req, z.object({ emoji: z.enum(['👍', '❤️', '🎉', '🔥', '👏', '😂']) }));
  const key = { postId_userId_emoji: { postId: post.id, userId: req.user!.id, emoji: input.emoji } };
  const existing = await prisma.reaction.findUnique({ where: key });
  if (existing) await prisma.reaction.delete({ where: key });
  else await prisma.reaction.create({ data: { tenantId: post.tenantId, postId: post.id, userId: req.user!.id, emoji: input.emoji } });
  res.json({ reacted: !existing });
});

communityRouter.post('/report', async (req, res) => {
  const input = body(req, z.object({ entityType: z.enum(['post', 'comment']), entityId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }));
  const target = input.entityType === 'post' ? await prisma.post.findUnique({ where: { id: input.entityId } }) : await prisma.comment.findUnique({ where: { id: input.entityId } });
  if (!target) throw notFound();
  const postId = input.entityType === 'post' ? target.id : (target as { postId: string }).postId;
  await loadPost(postId, req.user!.id);
  await prisma.contentReport.create({ data: { tenantId: target.tenantId, reporterId: req.user!.id, ...input } });
  res.status(201).json({ ok: true });
});

communityRouter.post('/block', async (req, res) => {
  const input = body(req, z.object({ tenantId: z.string().uuid(), userId: z.string().uuid(), blocked: z.boolean() }));
  if (input.userId === req.user!.id) throw badRequest('You cannot block yourself');
  const key = { tenantId_blockerId_blockedId: { tenantId: input.tenantId, blockerId: req.user!.id, blockedId: input.userId } };
  if (input.blocked) await prisma.userBlock.upsert({ where: key, create: { tenantId: input.tenantId, blockerId: req.user!.id, blockedId: input.userId }, update: {} });
  else await prisma.userBlock.deleteMany({ where: { tenantId: input.tenantId, blockerId: req.user!.id, blockedId: input.userId } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Direct & group messages (within one workspace)
// ---------------------------------------------------------------------------

communityRouter.get('/messages/:tenantId', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId: req.user!.id, conversation: { tenantId } },
    include: { conversation: { include: { participants: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
  });
  const userIds = [...new Set(parts.flatMap((p) => p.conversation.participants.map((x) => x.userId)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarUrl: true } });
  res.json({
    conversations: parts
      .map((p) => ({
        id: p.conversation.id,
        title: p.conversation.title,
        isGroup: p.conversation.isGroup,
        participants: p.conversation.participants.map((x) => users.find((u) => u.id === x.userId)),
        lastMessage: p.conversation.messages[0] ?? null,
        unread: !!p.conversation.messages[0] && (!p.lastReadAt || p.conversation.messages[0].createdAt > p.lastReadAt),
      }))
      .sort((a, b) => (b.lastMessage?.createdAt.getTime() ?? 0) - (a.lastMessage?.createdAt.getTime() ?? 0)),
  });
});

communityRouter.post('/messages/:tenantId', async (req, res) => {
  const tenantId = parse(id, req.params.tenantId);
  const input = body(req, z.object({ userIds: z.array(z.string().uuid()).min(1).max(50), title: z.string().trim().max(80).optional() }));
  const ids = [...new Set([req.user!.id, ...input.userIds])];
  // Everyone must be an active member of the workspace, and nobody may have blocked the sender
  const members = await prisma.membership.count({ where: { tenantId, userId: { in: ids }, status: 'ACTIVE' } });
  if (members !== ids.length) throw forbidden('You can only message members of this community');
  const blocks = await prisma.userBlock.count({ where: { tenantId, blockerId: { in: input.userIds }, blockedId: req.user!.id } });
  if (blocks) throw forbidden('You cannot message this member');
  if (ids.length === 2) {
    const existing = await prisma.conversation.findFirst({ where: { tenantId, isGroup: false, AND: ids.map((u) => ({ participants: { some: { userId: u } } })) } });
    if (existing) return res.json({ conversation: existing });
  }
  const conv = await prisma.conversation.create({ data: { tenantId, isGroup: ids.length > 2, title: input.title, participants: { create: ids.map((userId) => ({ userId })) } } });
  res.status(201).json({ conversation: conv });
});

async function loadConversation(conversationId: string, userId: string) {
  const part = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } }, include: { conversation: true } });
  if (!part) throw notFound('Conversation not found');
  const m = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: part.conversation.tenantId, userId } } });
  if (!m || m.status !== 'ACTIVE') throw forbidden('Your access to this community has ended');
  return part.conversation;
}

communityRouter.get('/conversations/:conversationId', async (req, res) => {
  const conv = await loadConversation(parse(id, req.params.conversationId), req.user!.id);
  const messages = await prisma.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId: conv.id, userId: req.user!.id } }, data: { lastReadAt: new Date() } });
  res.json({ conversation: conv, messages: messages.reverse() });
});

communityRouter.post('/conversations/:conversationId', async (req, res) => {
  const conv = await loadConversation(parse(id, req.params.conversationId), req.user!.id);
  const input = body(req, z.object({ body: z.string().trim().min(1).max(5000) }));
  const recent = await prisma.message.count({ where: { senderId: req.user!.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent >= 30) throw badRequest('You are sending messages too quickly');
  const others = await prisma.conversationParticipant.findMany({ where: { conversationId: conv.id, userId: { not: req.user!.id } } });
  const blocked = await prisma.userBlock.count({ where: { tenantId: conv.tenantId, blockerId: { in: others.map((o) => o.userId) }, blockedId: req.user!.id } });
  if (blocked && !conv.isGroup) throw forbidden('You cannot message this member');
  const msg = await prisma.message.create({ data: { tenantId: conv.tenantId, conversationId: conv.id, senderId: req.user!.id, body: input.body } });
  await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
  emitTo(`conversation:${conv.id}`, 'message:new', msg);
  for (const o of others) emitTo(`user:${o.userId}`, 'inbox:update', { conversationId: conv.id });
  res.status(201).json({ message: msg });
});
