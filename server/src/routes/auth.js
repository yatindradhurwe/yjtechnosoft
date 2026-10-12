const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { query, one } = require('../config/db');
const { signToken, authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { sendEmail } = require('../services/notify');
const { getSettings } = require('../utils/settings');
const { pick } = require('../utils/helpers');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

async function userPayload(id) {
  const user = await one(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.avatar, u.employee_id, e.emp_code, e.photo AS employee_photo,
            d.name AS designation_name
     FROM users u
     LEFT JOIN employees e ON e.id = u.employee_id
     LEFT JOIN designations d ON d.id = e.designation_id
     WHERE u.id = ?`,
    [id]
  );
  return user;
}

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new HttpError(400, 'Email and password are required');
    const user = await one('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Invalid email or password');
    if (user.status !== 'active') throw new HttpError(403, 'Your account is disabled. Contact the administrator.');
    await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    res.json({ token: signToken(user), user: await userPayload(user.id) });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => res.json(await userPayload(req.user.id)))
);

router.put(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['name', 'phone', 'avatar']);
    if (!data.name) delete data.name;
    if (Object.keys(data).length) await query('UPDATE users SET ? WHERE id = ?', [data, req.user.id]);
    res.json(await userPayload(req.user.id));
  })
);

router.put(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
    const user = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(current_password || '', user.password_hash))) throw new HttpError(400, 'Current password is incorrect');
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(new_password, 10), req.user.id]);
    res.json({ message: 'Password updated' });
  })
);

router.post(
  '/forgot-password',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await one("SELECT id, name, email FROM users WHERE email = ? AND status = 'active'", [email]);
    if (user) {
      const token = crypto.randomBytes(24).toString('hex');
      await query('UPDATE users SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [token, user.id]);
      const s = await getSettings();
      const link = `${s.site_url || process.env.APP_URL}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Hi ${user.name},</p><p>Click the button below to reset your password. This link is valid for 1 hour.</p>
               <p><a href="${link}" style="background:#1d6fb8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset Password</a></p>`,
        refType: 'user',
        refId: user.id,
      });
    }
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  })
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    if (!password || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    const user = await one('SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()', [token || '']);
    if (!user) throw new HttpError(400, 'Reset link is invalid or has expired');
    await query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [await bcrypt.hash(password, 10), user.id]);
    res.json({ message: 'Password has been reset. You can login now.' });
  })
);

// ---------------------------------------------------------------- Users (admin)
router.get(
  '/users',
  authenticate,
  authorize(),
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.last_login, u.employee_id, u.created_at, e.emp_code
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.id DESC`
    );
    res.json({ data: rows, total: rows.length });
  })
);

router.post(
  '/users',
  authenticate,
  authorize(),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['name', 'email', 'phone', 'role', 'status', 'employee_id']);
    if (!data.name || !data.email || !req.body.password) throw new HttpError(400, 'Name, email and password are required');
    data.email = data.email.trim().toLowerCase();
    data.password_hash = await bcrypt.hash(req.body.password, 10);
    const r = await query('INSERT INTO users SET ?', [data]);
    res.status(201).json({ id: r.insertId });
  })
);

router.put(
  '/users/:id',
  authenticate,
  authorize(),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['name', 'email', 'phone', 'role', 'status', 'employee_id']);
    if (data.email) data.email = data.email.trim().toLowerCase();
    if (req.body.password) data.password_hash = await bcrypt.hash(req.body.password, 10);
    if (Number(req.params.id) === req.user.id && (data.status === 'inactive' || (data.role && data.role !== 'admin'))) {
      throw new HttpError(400, 'You cannot disable or demote your own account');
    }
    await query('UPDATE users SET ? WHERE id = ?', [data, req.params.id]);
    res.json({ message: 'User updated' });
  })
);

router.delete(
  '/users/:id',
  authenticate,
  authorize(),
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
    await query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  })
);

module.exports = router;
