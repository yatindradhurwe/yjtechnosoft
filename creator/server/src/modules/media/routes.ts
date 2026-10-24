import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { MediaKind } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { pageArgs, pagination, parse, query } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { tenantPlan } from '../../services/plans';
import { localStorage, signMediaUrl, verifyMediaSignature } from '../../services/storage';
import { canAccessCourse, hasEntitlement } from '../../services/access';

export const mediaRouter = Router();

/** Allow-listed upload types. SVG is excluded (it can carry script). */
const MIME_KIND: Record<string, MediaKind> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/gif': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'audio/mpeg': 'AUDIO',
  'audio/mp4': 'AUDIO',
  'audio/wav': 'AUDIO',
  'application/pdf': 'DOCUMENT',
  'application/zip': 'OTHER',
  'application/epub+zip': 'DOCUMENT',
  'text/plain': 'DOCUMENT',
  'text/csv': 'DOCUMENT',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (MIME_KIND[file.mimetype] ? cb(null, true) : cb(badRequest(`File type ${file.mimetype} is not allowed`))),
});

/** Magic-byte check for the riskiest types so a renamed file cannot pass as an image/PDF */
function looksLike(mime: string, buf: Buffer) {
  const hex = buf.subarray(0, 12).toString('hex');
  if (mime === 'image/png') return hex.startsWith('89504e47');
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mime === 'image/gif') return hex.startsWith('47494638');
  if (mime === 'image/webp') return hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP';
  if (mime === 'application/pdf') return buf.subarray(0, 5).toString() === '%PDF-';
  return true;
}

mediaRouter.post('/', requireAuth, requireTenantStaff, can('media.write'), upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('No file uploaded');
  if (!looksLike(file.mimetype, file.buffer)) throw badRequest('File contents do not match its type');
  const visibility = parse(z.enum(['PUBLIC', 'PRIVATE']).default('PRIVATE'), req.body.visibility);
  const tenantId = req.tenant!.id;

  const { limits } = await tenantPlan(tenantId);
  if (typeof limits.storageMb === 'number') {
    const used = await prisma.mediaAsset.aggregate({ where: { tenantId, deletedAt: null }, _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0) + file.size > limits.storageMb * 1024 * 1024) throw forbidden('Storage limit reached for your plan');
  }
  const id = randomUUID();
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  const key = `${tenantId}/${id}${ext}`;
  await localStorage.put(key, file.buffer);
  const asset = await prisma.mediaAsset.create({
    data: {
      id,
      tenantId,
      uploaderId: req.user!.id,
      kind: MIME_KIND[file.mimetype],
      visibility,
      storage: 'LOCAL',
      storageKey: key,
      filename: file.originalname.slice(0, 200),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    },
  });
  await audit({ action: 'media.upload', entityType: 'media', entityId: id, metadata: { size: file.size, mime: file.mimetype }, req });
  res.status(201).json({ asset: { ...asset, url: asset.visibility === 'PUBLIC' ? `/api/media/public/${asset.id}` : null } });
});

mediaRouter.get('/', requireAuth, requireTenantStaff, can('courses.read'), async (req, res) => {
  const p = query(req, pagination.extend({ kind: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER']).optional() }));
  const where = { tenantId: req.tenant!.id, deletedAt: null, kind: p.kind, ...(p.q ? { filename: { contains: p.q, mode: 'insensitive' as const } } : {}) };
  const [items, total, used] = await Promise.all([
    prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(p) }),
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.aggregate({ where: { tenantId: req.tenant!.id, deletedAt: null }, _sum: { sizeBytes: true } }),
  ]);
  res.json({
    items: items.map((a) => ({ ...a, url: a.visibility === 'PUBLIC' ? `/api/media/public/${a.id}` : null })),
    total,
    page: p.page,
    pageSize: p.pageSize,
    usedBytes: used._sum.sizeBytes ?? 0,
  });
});

/** Staff preview link for a private file */
mediaRouter.get('/:id/signed-url', requireAuth, requireTenantStaff, can('courses.read'), async (req, res) => {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: parse(z.string().uuid(), req.params.id), tenantId: req.tenant!.id, deletedAt: null } });
  if (!asset) throw notFound();
  res.json({ url: signMediaUrl(asset.id, req.user!.id) });
});

mediaRouter.delete('/:id', requireAuth, requireTenantStaff, can('media.write'), async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const asset = await prisma.mediaAsset.findFirst({ where: { id, tenantId: req.tenant!.id, deletedAt: null } });
  if (!asset) throw notFound();
  const inUse = await prisma.lesson.count({ where: { mediaAssetId: id } });
  if (inUse) throw badRequest(`This file is used by ${inUse} lesson(s). Remove it from those lessons first.`);
  await prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await localStorage.remove(asset.storageKey);
  await audit({ action: 'media.delete', entityType: 'media', entityId: id, req });
  res.json({ ok: true });
});

/** Public assets (logos, covers). Private assets are never served here. */
mediaRouter.get('/public/:id', async (req, res) => {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: parse(z.string().uuid(), req.params.id), visibility: 'PUBLIC', deletedAt: null } });
  if (!asset) throw notFound();
  res.set('cache-control', 'public, max-age=86400');
  res.set('x-content-type-options', 'nosniff');
  res.type(asset.mimeType).sendFile(localStorage.absolutePath(asset.storageKey), { dotfiles: 'allow' });
});

/** Private files – only via a signed, expiring, user-bound URL */
mediaRouter.get('/file/:id', async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const { u, exp, sig } = req.query as Record<string, string>;
  if (!u || !sig || !verifyMediaSignature(id, u, Number(exp), sig)) throw forbidden('This link has expired. Reload the page to get a new one.');
  const asset = await prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
  if (!asset) throw notFound();
  res.set('cache-control', 'private, no-store');
  res.set('x-content-type-options', 'nosniff');
  // Downloads only where explicitly permitted (documents); media streams inline
  const download = req.query.download === '1' && asset.kind !== 'VIDEO' && asset.kind !== 'AUDIO';
  res.set('content-disposition', `${download ? 'attachment' : 'inline'}; filename="${asset.filename.replace(/["\r\n]/g, '')}"`);
  res.type(asset.mimeType).sendFile(localStorage.absolutePath(asset.storageKey), { acceptRanges: true, dotfiles: 'allow' });
});

/** Downloadable product file for a buyer */
mediaRouter.get('/download/:tenantId/:assetId', requireAuth, async (req, res) => {
  const tenantId = parse(z.string().uuid(), req.params.tenantId);
  const assetId = parse(z.string().uuid(), req.params.assetId);
  if (!(await hasEntitlement(req.user!.id, tenantId, 'DOWNLOAD', assetId))) throw forbidden('You have not purchased this file');
  res.json({ url: `${signMediaUrl(assetId, req.user!.id, 120)}&download=1` });
});

export { canAccessCourse };
