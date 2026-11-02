/**
 * Public community: posts with images/video, emoji, likes, comments, replies and shares,
 * plus admin moderation under /admin.
 *
 * Members are not staff. Their tokens are signed with a derived secret, so they are rejected
 * by the staff authenticate() middleware, the mobile API and the private uploads check.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query, one } = require('../config/db');
const { SECRET, authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { makeUploader, UPLOAD_ROOT } = require('../middleware/upload');
const { sendEmail } = require('../services/notify');
const { getSettings, setSettings } = require('../utils/settings');
const { slugify } = require('../utils/helpers');

const router = express.Router();

const MEMBER_SECRET = () => `${SECRET()}:community`;
const IMAGE_MB = 8;
const VIDEO_MB = 50; // nginx allows 64 MB per request
const MAX_IMAGES = 6;
const MAX_POST = 5000;
const MAX_COMMENT = 2000;
const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const VIDEO_TYPES = ['.mp4', '.webm', '.mov'];

const memberKey = (req) => `member-${req.member.id}`;
const limiter = (windowMin, max, opts = {}) => rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please try again later.' }, ...opts });
const authLimiter = limiter(15, 30);
const registerLimiter = limiter(60, 10);
const shareLimiter = limiter(10, 60);
const postLimiter = limiter(60, 20, { keyGenerator: memberKey });
const commentLimiter = limiter(10, 40, { keyGenerator: memberKey });
const reportLimiter = limiter(60, 20, { keyGenerator: memberKey });

// ---------------------------------------------------------------- helpers
const postUploader = makeUploader('community', { maxMb: VIDEO_MB, allow: [...IMAGE_TYPES, ...VIDEO_TYPES] }).array('media', MAX_IMAGES);
const avatarUploader = makeUploader('community', { maxMb: 3, allow: IMAGE_TYPES }).single('avatar');

/** Runs multer and reports its errors as client errors */
const withUpload = (uploader) => (req, res, next) =>
  uploader(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `File is too large (max ${VIDEO_MB} MB)`));
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new HttpError(400, `You can attach up to ${MAX_IMAGES} images or 1 video`));
    return next(new HttpError(400, err.message));
  });

const removeFile = (file) => fs.promises.unlink(file).catch(() => {});
const removeUploaded = (files = []) => Promise.all(files.map((f) => removeFile(f.path)));

/** Deletes community media from disk; ignores anything outside the community folder */
function removeMedia(urls = []) {
  return Promise.all(
    urls.map((url) => {
      const name = path.basename(String(url || ''));
      if (!name || !String(url).startsWith('/uploads/community/')) return null;
      return removeFile(path.join(UPLOAD_ROOT, 'community', name));
    })
  );
}

const parseMedia = (raw) => {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
};
const mediaUrls = (posts) => posts.flatMap((p) => parseMedia(p.media).map((m) => m.url));

/** The file extension is user supplied, so confirm the bytes really are that kind of file */
async function hasValidSignature(file) {
  const fh = await fs.promises.open(file.path, 'r');
  try {
    const { buffer: b } = await fh.read(Buffer.alloc(16), 0, 16, 0);
    const ext = path.extname(file.originalname).toLowerCase();
    const ascii = (from, to) => b.toString('latin1', from, to);
    if (ext === '.jpg' || ext === '.jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (ext === '.png') return b[0] === 0x89 && ascii(1, 4) === 'PNG';
    if (ext === '.gif') return ascii(0, 3) === 'GIF';
    if (ext === '.webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (ext === '.webm') return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    if (ext === '.mp4' || ext === '.mov') return ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(ascii(4, 8));
    return false;
  } finally {
    await fh.close();
  }
}

async function validateUploads(files) {
  const isVideo = (f) => VIDEO_TYPES.includes(path.extname(f.originalname).toLowerCase());
  const videos = files.filter(isVideo);
  if (videos.length && files.length > 1) throw new HttpError(400, 'A post can have up to 6 images or 1 video, not both');
  if (files.some((f) => !isVideo(f) && f.size > IMAGE_MB * 1024 * 1024)) throw new HttpError(413, `Images must be ${IMAGE_MB} MB or smaller`);
  for (const f of files) {
    if (!(await hasValidSignature(f))) throw new HttpError(400, `${f.originalname} is not a valid image or video file`);
  }
  return files.map((f) => ({ type: isVideo(f) ? 'video' : 'image', url: `/uploads/community/${f.filename}` }));
}

const cleanText = (value, max, label) => {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer`);
  return text;
};
const positiveId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Not found');
  return id;
};
const paging = (req, def = 15) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || def, 1), 50);
  const page = Math.max(Number(req.query.page) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
};
// LIKE wildcards in a search box are literal text
const likeTerm = (q) => `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;

function signMember(m) {
  return jwt.sign({ mid: m.id, tv: m.token_version }, MEMBER_SECRET(), { expiresIn: '30d' });
}
const publicMember = (m) => ({ id: m.id, name: m.name, email: m.email, avatar: m.avatar, bio: m.bio, created_at: m.created_at });

async function loadMember(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = jwt.verify(header.slice(7), MEMBER_SECRET());
  } catch {
    return null;
  }
  const m = await one('SELECT id, name, email, avatar, bio, status, token_version, created_at FROM community_members WHERE id = ?', [payload.mid]);
  return m && m.status === 'active' && m.token_version === payload.tv ? m : null;
}
const optionalMember = asyncHandler(async (req, res, next) => {
  req.member = await loadMember(req);
  next();
});
const requireMember = asyncHandler(async (req, res, next) => {
  req.member = await loadMember(req);
  if (!req.member) throw new HttpError(401, 'Please log in to the community to do that');
  next();
});

// viewerId is always a number from a verified token, so these fragments are safe to interpolate
const POST_SELECT = (viewerId) => `
  SELECT p.id, p.member_id, p.category_id, p.content, p.mood, p.media, p.status, p.is_pinned, p.shares_count, p.created_at,
         m.name AS member_name, m.avatar AS member_avatar, c.name AS category_name, c.slug AS category_slug, c.emoji AS category_emoji,
         (SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = p.id) AS likes_count,
         (SELECT COUNT(*) FROM community_comments cc LEFT JOIN community_comments par ON par.id = cc.parent_id
           WHERE cc.post_id = p.id AND cc.status = 'published' AND (par.id IS NULL OR par.status = 'published')) AS comments_count,
         ${viewerId ? `EXISTS(SELECT 1 FROM community_post_likes l WHERE l.post_id = p.id AND l.member_id = ${Number(viewerId)})` : '0'} AS liked
  FROM community_posts p
  JOIN community_members m ON m.id = p.member_id
  LEFT JOIN community_categories c ON c.id = p.category_id`;

const shapePost = (p) => ({ ...p, media: parseMedia(p.media), liked: !!p.liked, is_pinned: !!p.is_pinned });

async function visiblePost(id, viewer) {
  const p = await one(`${POST_SELECT(viewer?.id)} WHERE p.id = ? AND m.status = 'active'`, [id]);
  if (!p || (p.status !== 'published' && p.member_id !== viewer?.id)) throw new HttpError(404, 'This post is not available');
  return p;
}

// ================================================================ ACCOUNT
router.post(
  '/auth/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name, 100, 'Name');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2) throw new HttpError(400, 'Please enter your name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new HttpError(400, 'Please enter a valid email address');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    if (await one('SELECT id FROM community_members WHERE email = ?', [email])) throw new HttpError(409, 'An account with this email already exists. Please log in.');
    const r = await query('INSERT INTO community_members (name, email, password_hash) VALUES (?, ?, ?)', [name, email, await bcrypt.hash(password, 10)]);
    const m = await one('SELECT * FROM community_members WHERE id = ?', [r.insertId]);
    res.status(201).json({ token: signMember(m), member: publicMember(m) });
  })
);

router.post(
  '/auth/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const m = await one('SELECT * FROM community_members WHERE email = ?', [email]);
    if (!m || !(await bcrypt.compare(String(req.body.password || ''), m.password_hash))) throw new HttpError(401, 'Invalid email or password');
    if (m.status !== 'active') throw new HttpError(403, 'This account has been suspended by the community admin.');
    await query('UPDATE community_members SET last_login = NOW() WHERE id = ?', [m.id]);
    res.json({ token: signMember(m), member: publicMember(m) });
  })
);

router.post(
  '/auth/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const m = await one("SELECT id, name, email FROM community_members WHERE email = ? AND status = 'active'", [email]);
    if (m) {
      const token = crypto.randomBytes(24).toString('hex');
      await query('UPDATE community_members SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [token, m.id]);
      const s = await getSettings();
      const link = `${s.site_url || process.env.APP_URL}/community/reset-password?token=${token}`;
      const safeName = m.name.replace(/[<>&"']/g, '');
      await sendEmail({
        to: m.email,
        subject: 'Reset your community password',
        html: `<p>Hi ${safeName},</p><p>Click the button below to reset your community password. This link is valid for 1 hour.</p>
               <p><a href="${link}" style="background:#1d6fb8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset Password</a></p>`,
      });
    }
    res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
  })
);

router.post(
  '/auth/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    const m = await one('SELECT id FROM community_members WHERE reset_token = ? AND reset_expires > NOW()', [String(req.body.token || '') || 'none']);
    if (!m) throw new HttpError(400, 'Reset link is invalid or has expired');
    await query('UPDATE community_members SET password_hash = ?, reset_token = NULL, reset_expires = NULL, token_version = token_version + 1 WHERE id = ?', [await bcrypt.hash(password, 10), m.id]);
    res.json({ message: 'Password has been reset. You can log in now.' });
  })
);

router.get('/me', requireMember, (req, res) => res.json(publicMember(req.member)));

router.put(
  '/me',
  requireMember,
  withUpload(avatarUploader),
  asyncHandler(async (req, res) => {
    try {
      const data = {};
      if (req.body.name !== undefined) {
        data.name = cleanText(req.body.name, 100, 'Name');
        if (data.name.length < 2) throw new HttpError(400, 'Please enter your name');
      }
      if (req.body.bio !== undefined) data.bio = cleanText(req.body.bio, 300, 'Bio');
      if (req.file) {
        if (!(await hasValidSignature(req.file))) throw new HttpError(400, 'That file is not a valid image');
        data.avatar = `/uploads/community/${req.file.filename}`;
      }
      if (Object.keys(data).length) await query('UPDATE community_members SET ? WHERE id = ?', [data, req.member.id]);
      if (data.avatar) await removeMedia([req.member.avatar]);
    } catch (e) {
      if (req.file) await removeFile(req.file.path);
      throw e;
    }
    res.json(publicMember(await one('SELECT * FROM community_members WHERE id = ?', [req.member.id])));
  })
);

// ================================================================ FEED
router.get(
  '/members/:id',
  asyncHandler(async (req, res) => {
    const m = await one(
      `SELECT m.id, m.name, m.avatar, m.bio, m.created_at,
              (SELECT COUNT(*) FROM community_posts p WHERE p.member_id = m.id AND p.status = 'published') AS posts
       FROM community_members m WHERE m.id = ? AND m.status = 'active'`,
      [positiveId(req.params.id)]
    );
    if (!m) throw new HttpError(404, 'Member not found');
    res.json(m);
  })
);

router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const [categories, [stats], trending] = await Promise.all([
      query(`SELECT c.id, c.name, c.slug, c.emoji, COUNT(p.id) AS posts FROM community_categories c
             LEFT JOIN community_posts p ON p.category_id = c.id AND p.status = 'published'
             WHERE c.status = 'active' GROUP BY c.id ORDER BY c.sort_order, c.name`),
      query(`SELECT (SELECT COUNT(*) FROM community_members WHERE status = 'active') AS members,
                    (SELECT COUNT(*) FROM community_posts WHERE status = 'published') AS posts,
                    (SELECT COUNT(*) FROM community_comments WHERE status = 'published') AS comments`),
      query(`SELECT p.id, p.content, m.name AS member_name, COUNT(DISTINCT l.member_id) AS likes_count
             FROM community_posts p JOIN community_members m ON m.id = p.member_id AND m.status = 'active'
             LEFT JOIN community_post_likes l ON l.post_id = p.id
             WHERE p.status = 'published' AND p.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY p.id ORDER BY likes_count DESC, p.id DESC LIMIT 5`),
    ]);
    res.json({ categories, stats, trending: trending.map((t) => ({ ...t, content: String(t.content || '').slice(0, 90) })) });
  })
);

router.get(
  '/posts',
  optionalMember,
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paging(req);
    const { category, q, sort, member } = req.query;
    const where = ["m.status = 'active'"];
    const params = [];
    const memberId = Number(member) || 0;
    // members also see their own posts that are still waiting for approval
    if (req.member && memberId === req.member.id) where.push("p.status IN ('published','pending')");
    else where.push("p.status = 'published'");
    if (memberId) { where.push('p.member_id = ?'); params.push(memberId); }
    if (category) { where.push('c.slug = ?'); params.push(String(category)); }
    if (q) { where.push('p.content LIKE ?'); params.push(likeTerm(q)); }
    const w = where.join(' AND ');
    const order = sort === 'popular' ? 'p.is_pinned DESC, (likes_count + comments_count) DESC, p.id DESC' : 'p.is_pinned DESC, p.id DESC';
    const rows = await query(`${POST_SELECT(req.member?.id)} WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM community_posts p JOIN community_members m ON m.id = p.member_id LEFT JOIN community_categories c ON c.id = p.category_id WHERE ${w}`,
      params
    );
    res.json({ data: rows.map(shapePost), total, page, limit });
  })
);

router.get(
  '/posts/:id',
  optionalMember,
  asyncHandler(async (req, res) => res.json(shapePost(await visiblePost(positiveId(req.params.id), req.member))))
);

router.post(
  '/posts',
  requireMember,
  postLimiter,
  withUpload(postUploader),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    let id;
    let status;
    try {
      const content = cleanText(req.body.content, MAX_POST, 'Your post');
      const media = await validateUploads(files);
      if (!content && !media.length) throw new HttpError(400, 'Write something or attach an image or video');
      const mood = cleanText(req.body.mood, 16, 'Mood') || null;
      let categoryId = null;
      if (req.body.category_id) {
        const cat = await one("SELECT id FROM community_categories WHERE id = ? AND status = 'active'", [req.body.category_id]);
        if (!cat) throw new HttpError(400, 'Please choose a valid category');
        categoryId = cat.id;
      }
      const s = await getSettings();
      status = s.community_require_approval === '1' ? 'pending' : 'published';
      const r = await query('INSERT INTO community_posts (member_id, category_id, content, mood, media, status) VALUES (?, ?, ?, ?, ?, ?)', [req.member.id, categoryId, content, mood, JSON.stringify(media), status]);
      id = r.insertId;
    } catch (e) {
      await removeUploaded(files);
      throw e;
    }
    res.status(201).json(shapePost(await visiblePost(id, req.member)));
  })
);

router.delete(
  '/posts/:id',
  requireMember,
  asyncHandler(async (req, res) => {
    const p = await one('SELECT id, media FROM community_posts WHERE id = ? AND member_id = ?', [positiveId(req.params.id), req.member.id]);
    if (!p) throw new HttpError(404, 'Post not found');
    await query('DELETE FROM community_posts WHERE id = ?', [p.id]);
    await removeMedia(mediaUrls([p]));
    res.json({ message: 'Post deleted' });
  })
);

router.post(
  '/posts/:id/like',
  requireMember,
  asyncHandler(async (req, res) => {
    const p = await visiblePost(positiveId(req.params.id), req.member);
    if (p.status !== 'published') throw new HttpError(400, 'This post is waiting for approval');
    const removed = await query('DELETE FROM community_post_likes WHERE post_id = ? AND member_id = ?', [p.id, req.member.id]);
    if (!removed.affectedRows) await query('INSERT IGNORE INTO community_post_likes (post_id, member_id) VALUES (?, ?)', [p.id, req.member.id]);
    const [{ count }] = await query('SELECT COUNT(*) AS count FROM community_post_likes WHERE post_id = ?', [p.id]);
    res.json({ liked: !removed.affectedRows, likes_count: count });
  })
);

router.post(
  '/posts/:id/share',
  shareLimiter,
  asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    await query("UPDATE community_posts SET shares_count = shares_count + 1 WHERE id = ? AND status = 'published'", [id]);
    const row = await one('SELECT shares_count FROM community_posts WHERE id = ?', [id]);
    res.json({ shares_count: row?.shares_count || 0 });
  })
);

// ================================================================ COMMENTS
router.get(
  '/posts/:id/comments',
  optionalMember,
  asyncHandler(async (req, res) => {
    const p = await visiblePost(positiveId(req.params.id), req.member);
    const viewer = Number(req.member?.id) || 0;
    const rows = await query(
      `SELECT c.id, c.post_id, c.member_id, c.parent_id, c.content, c.created_at,
              m.name AS member_name, m.avatar AS member_avatar, rt.name AS reply_to_name,
              (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id) AS likes_count,
              ${viewer ? `EXISTS(SELECT 1 FROM community_comment_likes l WHERE l.comment_id = c.id AND l.member_id = ${viewer})` : '0'} AS liked
       FROM community_comments c
       JOIN community_members m ON m.id = c.member_id AND m.status = 'active'
       LEFT JOIN community_members rt ON rt.id = c.reply_to_member_id
       LEFT JOIN community_comments par ON par.id = c.parent_id
       WHERE c.post_id = ? AND c.status = 'published' AND (par.id IS NULL OR par.status = 'published')
       ORDER BY c.id LIMIT 1000`,
      [p.id]
    );
    const map = new Map(rows.map((c) => [c.id, { ...c, liked: !!c.liked, replies: [] }]));
    const top = [];
    map.forEach((c) => {
      if (!c.parent_id) top.push(c);
      else map.get(c.parent_id)?.replies.push(c);
    });
    res.json({ data: top });
  })
);

router.post(
  '/posts/:id/comments',
  requireMember,
  commentLimiter,
  asyncHandler(async (req, res) => {
    const p = await visiblePost(positiveId(req.params.id), req.member);
    if (p.status !== 'published') throw new HttpError(400, 'This post is waiting for approval');
    const content = cleanText(req.body.content, MAX_COMMENT, 'Your comment');
    if (!content) throw new HttpError(400, 'Please write a comment');
    let parentId = null;
    let replyTo = null;
    if (req.body.parent_id) {
      const parent = await one("SELECT id, parent_id, member_id FROM community_comments WHERE id = ? AND post_id = ? AND status = 'published'", [req.body.parent_id, p.id]);
      if (!parent) throw new HttpError(400, 'The comment you are replying to is no longer available');
      // threads stay one level deep: a reply to a reply joins the same thread and names who it answers
      parentId = parent.parent_id || parent.id;
      replyTo = parent.parent_id ? parent.member_id : null;
    }
    const r = await query('INSERT INTO community_comments (post_id, member_id, parent_id, reply_to_member_id, content) VALUES (?, ?, ?, ?, ?)', [p.id, req.member.id, parentId, replyTo, content]);
    res.status(201).json({ id: r.insertId });
  })
);

router.post(
  '/comments/:id/like',
  requireMember,
  asyncHandler(async (req, res) => {
    const c = await one("SELECT id FROM community_comments WHERE id = ? AND status = 'published'", [positiveId(req.params.id)]);
    if (!c) throw new HttpError(404, 'Comment not found');
    const removed = await query('DELETE FROM community_comment_likes WHERE comment_id = ? AND member_id = ?', [c.id, req.member.id]);
    if (!removed.affectedRows) await query('INSERT IGNORE INTO community_comment_likes (comment_id, member_id) VALUES (?, ?)', [c.id, req.member.id]);
    const [{ count }] = await query('SELECT COUNT(*) AS count FROM community_comment_likes WHERE comment_id = ?', [c.id]);
    res.json({ liked: !removed.affectedRows, likes_count: count });
  })
);

router.delete(
  '/comments/:id',
  requireMember,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM community_comments WHERE id = ? AND member_id = ?', [positiveId(req.params.id), req.member.id]);
    if (!r.affectedRows) throw new HttpError(404, 'Comment not found');
    res.json({ message: 'Comment deleted' });
  })
);

// ================================================================ REPORTS
router.post(
  '/reports',
  requireMember,
  reportLimiter,
  asyncHandler(async (req, res) => {
    const postId = Number(req.body.post_id) || null;
    const commentId = Number(req.body.comment_id) || null;
    if (!!postId === !!commentId) throw new HttpError(400, 'Choose a post or a comment to report');
    const exists = postId
      ? await one('SELECT id FROM community_posts WHERE id = ?', [postId])
      : await one('SELECT id FROM community_comments WHERE id = ?', [commentId]);
    if (!exists) throw new HttpError(404, 'That content is no longer available');
    const dup = await one('SELECT id FROM community_reports WHERE member_id = ? AND post_id <=> ? AND comment_id <=> ?', [req.member.id, postId, commentId]);
    if (!dup) await query('INSERT INTO community_reports (member_id, post_id, comment_id, reason) VALUES (?, ?, ?, ?)', [req.member.id, postId, commentId, cleanText(req.body.reason, 300, 'Reason')]);
    res.status(201).json({ message: 'Thanks. Our team will review this.' });
  })
);

// ================================================================ ADMIN
const admin = express.Router();
admin.use(authenticate, authorize());

admin.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const [[counts], s] = await Promise.all([
      query(`SELECT (SELECT COUNT(*) FROM community_members) AS members,
                    (SELECT COUNT(*) FROM community_members WHERE status = 'banned') AS banned,
                    (SELECT COUNT(*) FROM community_posts) AS posts,
                    (SELECT COUNT(*) FROM community_posts WHERE status = 'pending') AS pending,
                    (SELECT COUNT(*) FROM community_comments) AS comments,
                    (SELECT COUNT(*) FROM community_post_likes) AS likes,
                    (SELECT COUNT(*) FROM community_reports WHERE status = 'open') AS reports`),
      getSettings(true),
    ]);
    res.json({ ...counts, require_approval: s.community_require_approval === '1' });
  })
);

admin.put(
  '/settings',
  asyncHandler(async (req, res) => {
    await setSettings({ community_require_approval: req.body.require_approval ? '1' : '0' });
    res.json({ message: 'Settings saved' });
  })
);

admin.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paging(req, 20);
    const where = [];
    const params = [];
    if (req.query.status) { where.push('p.status = ?'); params.push(String(req.query.status)); }
    if (req.query.q) { where.push('(p.content LIKE ? OR m.name LIKE ? OR m.email LIKE ?)'); params.push(...Array(3).fill(likeTerm(req.query.q))); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(`${POST_SELECT(0)} ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM community_posts p JOIN community_members m ON m.id = p.member_id ${w}`, params);
    res.json({ data: rows.map(shapePost), total, page, limit });
  })
);

admin.put(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const data = {};
    if (req.body.status !== undefined) {
      if (!['published', 'pending', 'hidden'].includes(req.body.status)) throw new HttpError(400, 'Invalid status');
      data.status = req.body.status;
    }
    if (req.body.is_pinned !== undefined) data.is_pinned = req.body.is_pinned ? 1 : 0;
    if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update');
    await query('UPDATE community_posts SET ? WHERE id = ?', [data, positiveId(req.params.id)]);
    res.json({ message: 'Post updated' });
  })
);

admin.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const p = await one('SELECT id, media FROM community_posts WHERE id = ?', [positiveId(req.params.id)]);
    if (!p) throw new HttpError(404, 'Post not found');
    await query('DELETE FROM community_posts WHERE id = ?', [p.id]);
    await removeMedia(mediaUrls([p]));
    res.json({ message: 'Post deleted' });
  })
);

admin.get(
  '/comments',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paging(req, 20);
    const where = [];
    const params = [];
    if (req.query.status) { where.push('c.status = ?'); params.push(String(req.query.status)); }
    if (req.query.q) { where.push('(c.content LIKE ? OR m.name LIKE ?)'); params.push(...Array(2).fill(likeTerm(req.query.q))); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = 'FROM community_comments c JOIN community_members m ON m.id = c.member_id';
    const data = await query(`SELECT c.id, c.post_id, c.parent_id, c.content, c.status, c.created_at, m.name AS member_name, m.email AS member_email ${from} ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [{ total }] = await query(`SELECT COUNT(*) AS total ${from} ${w}`, params);
    res.json({ data, total, page, limit });
  })
);

admin.put(
  '/comments/:id',
  asyncHandler(async (req, res) => {
    if (!['published', 'hidden'].includes(req.body.status)) throw new HttpError(400, 'Invalid status');
    await query('UPDATE community_comments SET status = ? WHERE id = ?', [req.body.status, positiveId(req.params.id)]);
    res.json({ message: 'Comment updated' });
  })
);

admin.delete(
  '/comments/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM community_comments WHERE id = ?', [positiveId(req.params.id)]);
    res.json({ message: 'Comment deleted' });
  })
);

admin.get(
  '/members',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paging(req, 20);
    const where = [];
    const params = [];
    if (req.query.status) { where.push('m.status = ?'); params.push(String(req.query.status)); }
    if (req.query.q) { where.push('(m.name LIKE ? OR m.email LIKE ?)'); params.push(...Array(2).fill(likeTerm(req.query.q))); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(
      `SELECT m.id, m.name, m.email, m.avatar, m.status, m.last_login, m.created_at,
              (SELECT COUNT(*) FROM community_posts p WHERE p.member_id = m.id) AS posts,
              (SELECT COUNT(*) FROM community_comments c WHERE c.member_id = m.id) AS comments
       FROM community_members m ${w} ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM community_members m ${w}`, params);
    res.json({ data, total, page, limit });
  })
);

admin.put(
  '/members/:id',
  asyncHandler(async (req, res) => {
    if (!['active', 'banned'].includes(req.body.status)) throw new HttpError(400, 'Invalid status');
    await query('UPDATE community_members SET status = ? WHERE id = ?', [req.body.status, positiveId(req.params.id)]);
    res.json({ message: req.body.status === 'banned' ? 'Member banned' : 'Member reactivated' });
  })
);

admin.delete(
  '/members/:id',
  asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const m = await one('SELECT id, avatar FROM community_members WHERE id = ?', [id]);
    if (!m) throw new HttpError(404, 'Member not found');
    const posts = await query('SELECT media FROM community_posts WHERE member_id = ?', [id]);
    await query('DELETE FROM community_members WHERE id = ?', [id]);
    await removeMedia([...mediaUrls(posts), m.avatar]);
    res.json({ message: 'Member and all their content deleted' });
  })
);

admin.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { limit, page, offset } = paging(req, 20);
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const data = await query(
      `SELECT r.id, r.post_id, r.comment_id, r.reason, r.status, r.created_at, rm.name AS reporter_name,
              COALESCE(p.content, c.content) AS content, COALESCE(p.status, c.status) AS content_status,
              COALESCE(pm.name, cm.name) AS author_name, c.post_id AS comment_post_id
       FROM community_reports r
       JOIN community_members rm ON rm.id = r.member_id
       LEFT JOIN community_posts p ON p.id = r.post_id
       LEFT JOIN community_members pm ON pm.id = p.member_id
       LEFT JOIN community_comments c ON c.id = r.comment_id
       LEFT JOIN community_members cm ON cm.id = c.member_id
       WHERE r.status = ? ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM community_reports WHERE status = ?', [status]);
    res.json({ data, total, page, limit });
  })
);

admin.put(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    const id = positiveId(req.params.id);
    const r = await one('SELECT id, post_id, comment_id FROM community_reports WHERE id = ?', [id]);
    if (!r) throw new HttpError(404, 'Report not found');
    if (req.body.hide_content) {
      if (r.post_id) await query("UPDATE community_posts SET status = 'hidden' WHERE id = ?", [r.post_id]);
      if (r.comment_id) await query("UPDATE community_comments SET status = 'hidden' WHERE id = ?", [r.comment_id]);
    }
    // everyone who reported the same content gets the same outcome
    await query("UPDATE community_reports SET status = 'resolved' WHERE post_id <=> ? AND comment_id <=> ?", [r.post_id, r.comment_id]);
    res.json({ message: req.body.hide_content ? 'Content hidden and report resolved' : 'Report dismissed' });
  })
);

admin.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const data = await query(
      `SELECT c.*, COUNT(p.id) AS posts FROM community_categories c LEFT JOIN community_posts p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.sort_order, c.name`
    );
    res.json({ data });
  })
);

function categoryData(body) {
  const name = cleanText(body.name, 80, 'Name');
  if (!name) throw new HttpError(400, 'Category name is required');
  return {
    name,
    slug: slugify(name) || `category-${Date.now()}`,
    emoji: cleanText(body.emoji, 16, 'Emoji') || null,
    sort_order: Number(body.sort_order) || 0,
    status: body.status === 'inactive' ? 'inactive' : 'active',
  };
}

admin.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const r = await query('INSERT INTO community_categories SET ?', [categoryData(req.body)]);
    res.status(201).json({ id: r.insertId });
  })
);

admin.put(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    await query('UPDATE community_categories SET ? WHERE id = ?', [categoryData(req.body), positiveId(req.params.id)]);
    res.json({ message: 'Category updated' });
  })
);

admin.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM community_categories WHERE id = ?', [positiveId(req.params.id)]);
    res.json({ message: 'Category deleted. Its posts were kept without a category.' });
  })
);

router.use('/admin', admin);

module.exports = router;
