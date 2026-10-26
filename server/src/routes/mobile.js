/**
 * Employee mobile app (Flutter) API – /api/mobile/v1
 * Full reference: docs/mobile-api.md (OpenAPI: docs/mobile-api.openapi.yaml)
 *
 * Every response uses one envelope:
 *   success → { success: true, message?, data, meta? }
 *   error   → { success: false, message, code, details? }
 *
 * Auth: short-lived access token (JWT, audience "mobile") + long-lived refresh
 * token stored hashed in mobile_sessions, rotated on every refresh. Revoking a
 * session (logout, password change, HR) blocks its access token immediately.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { query, one } = require('../config/db');
const { SECRET } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { makeUploader, fileUrl, IMAGE_EXT } = require('../middleware/upload');
const { getSettings } = require('../utils/settings');
const { pick, toDateStr, toDateTimeStr } = require('../utils/helpers');
const attendance = require('../services/attendance');
const { leaveBalance, createLeaveRequest, cancelLeaveRequest, countLeaveDays } = require('./hr');
const { TASK_SELECT, TASK_FROM, notifyTaskStatus, addTaskComment, saveDailyReport } = require('./work');
const { sendPasswordReset } = require('./auth');
const { notifyUsers } = require('../services/push');
const { deliveryMessage } = require('./notifications');

const router = express.Router();

const ACCESS_TTL = process.env.MOBILE_ACCESS_TTL || '1h';
const REFRESH_DAYS = Number(process.env.MOBILE_REFRESH_DAYS || 90);
const TZ_OFFSET = (process.env.DB_TIMEZONE || '+05:30').replace(/[^0-9:+-]/g, '');
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'];

const selfieUpload = makeUploader('attendance', { maxMb: 5, allow: IMAGE_EXT });
const avatarUpload = makeUploader('avatars', { maxMb: 5, allow: IMAGE_EXT });

// ------------------------------------------------------------------ helpers
const ok = (res, data, { message, meta, status = 200 } = {}) =>
  res.status(status).json({ success: true, ...(message ? { message } : {}), data, ...(meta ? { meta } : {}) });

/** "2026-10-26 09:58:00" → "2026-10-26T09:58:00+05:30" so DateTime.parse() in Dart is unambiguous */
const iso = (v) => (v ? `${String(v).replace(' ', 'T').slice(0, 19)}${TZ_OFFSET}` : null);
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const mask = (v, keep = 4) => (v ? `${'•'.repeat(Math.max(0, String(v).length - keep))}${String(v).slice(-keep)}` : null);
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function paging(req, max = 100) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), max);
  const page = Math.max(Number(req.query.page) || 1, 1);
  return { page, limit, offset: (page - 1) * limit };
}

async function baseUrls(req) {
  const s = await getSettings();
  const self = `${req.protocol}://${req.get('host')}`;
  return { api: s.api_public_url || process.env.API_URL || self, site: s.site_url || process.env.APP_URL || self };
}

/** Uploads are served under /api/uploads (works when only /api is forwarded to Node) */
function absUrl(urls, p) {
  if (!p) return null;
  if (/^https?:\/\//.test(p)) return p;
  if (p.startsWith('/uploads/')) return `${urls.api}/api${p}`;
  return `${urls.site}${p.startsWith('/') ? '' : '/'}${p}`;
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
function requireDate(v, name) {
  if (!isDate(v)) throw new HttpError(400, `${name} must be a date in YYYY-MM-DD format`, 'VALIDATION_ERROR');
  return v;
}

// ------------------------------------------------------------------ formatters
function fmtAttendance(a) {
  if (!a) return null;
  return {
    id: a.id,
    date: String(a.date).slice(0, 10),
    status: a.status,
    check_in: iso(a.check_in),
    check_out: iso(a.check_out),
    work_minutes: a.work_minutes || 0,
    source: a.source || null,
    project: a.project_id ? { id: a.project_id, name: a.project_name || null } : null,
    check_in_location: a.check_in_lat !== null && a.check_in_lat !== undefined
      ? { latitude: num(a.check_in_lat), longitude: num(a.check_in_lng), accuracy: a.check_in_accuracy, distance: a.check_in_distance, geofence: a.check_in_geofence }
      : (a.check_in_geofence ? { latitude: null, longitude: null, accuracy: null, distance: null, geofence: a.check_in_geofence } : null),
    check_out_location: a.check_out_lat !== null && a.check_out_lat !== undefined
      ? { latitude: num(a.check_out_lat), longitude: num(a.check_out_lng), accuracy: a.check_out_accuracy, distance: a.check_out_distance, geofence: a.check_out_geofence }
      : (a.check_out_geofence ? { latitude: null, longitude: null, accuracy: null, distance: null, geofence: a.check_out_geofence } : null),
    has_selfie: Boolean(a.check_in_photo),
    notes: a.notes || null,
  };
}

function fmtLeave(l) {
  return {
    id: l.id,
    leave_type: { id: l.leave_type_id, name: l.leave_type, color: l.color, is_paid: Boolean(l.is_paid) },
    from_date: String(l.from_date).slice(0, 10),
    to_date: String(l.to_date).slice(0, 10),
    half_day: Boolean(l.half_day),
    days: Number(l.days),
    reason: l.reason || null,
    status: l.status,
    remarks: l.remarks || null,
    approved_by: l.approved_by_name || null,
    applied_at: iso(l.created_at),
    can_cancel: l.status === 'pending',
  };
}

function fmtTask(t, user) {
  const today = toDateStr();
  return {
    id: t.id,
    title: t.title,
    description: t.description || null,
    priority: t.priority,
    status: t.status,
    progress: t.progress || 0,
    start_date: t.start_date ? String(t.start_date).slice(0, 10) : null,
    due_date: t.due_date ? String(t.due_date).slice(0, 10) : null,
    completed_at: iso(t.completed_at),
    is_overdue: Boolean(t.due_date && String(t.due_date).slice(0, 10) < today && t.status !== 'done'),
    project: t.project_id ? { id: t.project_id, name: t.project_name } : null,
    assigned_by: t.assigned_by_name || null,
    is_self_created: t.assigned_by === user.id,
    comment_count: Number(t.comment_count || 0),
    created_at: iso(t.created_at),
    updated_at: iso(t.updated_at),
  };
}

function fmtProject(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || null,
    status: p.status,
    client_name: p.client_name || null,
    start_date: p.start_date ? String(p.start_date).slice(0, 10) : null,
    deadline: p.deadline ? String(p.deadline).slice(0, 10) : null,
    is_member: Boolean(p.is_member),
    my_role: p.my_role || null,
    my_task_count: Number(p.my_task_count || 0),
    my_open_tasks: Number(p.my_open_tasks || 0),
    site: {
      address: p.site_address || null,
      latitude: num(p.latitude),
      longitude: num(p.longitude),
      radius: p.geofence_radius ? Number(p.geofence_radius) : null,
      geofence_enabled: Boolean(p.geofence_enabled) && p.latitude !== null && p.longitude !== null,
    },
  };
}

function fmtReport(r) {
  return {
    id: r.id,
    report_date: String(r.report_date).slice(0, 10),
    work_done: r.work_done,
    hours: Number(r.hours || 0),
    plan_tomorrow: r.plan_tomorrow || null,
    blockers: r.blockers || null,
    project: r.project_id ? { id: r.project_id, name: r.project_name || null } : null,
    status: r.status,
    reviewer_remarks: r.reviewer_remarks || null,
    submitted_at: iso(r.created_at),
  };
}

async function employeeProfile(req, empId) {
  const e = await one(
    `SELECT e.*, d.name AS department_name, g.name AS designation_name,
            r.name AS manager_name, r.phone AS manager_phone, r.email AS manager_email
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations g ON g.id = e.designation_id
     LEFT JOIN employees r ON r.id = e.reporting_to
     WHERE e.id = ?`,
    [empId]
  );
  if (!e) throw new HttpError(404, 'Employee profile not found', 'NOT_FOUND');
  const urls = await baseUrls(req);
  return {
    id: e.id,
    emp_code: e.emp_code,
    name: e.name,
    email: e.email,
    phone: e.phone,
    gender: e.gender,
    dob: e.dob ? String(e.dob).slice(0, 10) : null,
    father_name: e.father_name,
    address: e.address,
    emergency_contact: e.emergency_contact,
    photo_url: absUrl(urls, e.photo),
    employment_type: e.employment_type,
    status: e.status,
    joining_date: e.joining_date ? String(e.joining_date).slice(0, 10) : null,
    probation_end: e.probation_end ? String(e.probation_end).slice(0, 10) : null,
    shift: { start: e.shift_start ? String(e.shift_start).slice(0, 5) : null, end: e.shift_end ? String(e.shift_end).slice(0, 5) : null },
    department: e.department_id ? { id: e.department_id, name: e.department_name } : null,
    designation: e.designation_id ? { id: e.designation_id, name: e.designation_name } : null,
    reporting_manager: e.reporting_to ? { id: e.reporting_to, name: e.manager_name, phone: e.manager_phone, email: e.manager_email } : null,
    // sensitive numbers are masked – the full values stay in the admin panel
    bank: { bank_name: e.bank_name || null, account_no: mask(e.account_no), ifsc: e.ifsc || null },
    kyc: { pan: mask(e.pan), aadhaar: mask(e.aadhaar) },
  };
}

async function attendanceRules(s = null) {
  s = s || (await getSettings());
  const mode = ['flag', 'enforce'].includes(s.geofence_mode) ? s.geofence_mode : 'off';
  return {
    geofence_mode: mode,
    max_gps_accuracy: Number(s.geofence_max_accuracy) || null,
    allow_wfh: mode === 'off' || s.geofence_allow_wfh !== '0',
    selfie_required: s.attendance_selfie_required === '1',
    late_grace_minutes: Number(s.attendance_grace_minutes || 15),
    half_day_hours: Number(s.half_day_hours || 4),
    weekly_off: String(s.weekly_off ?? '0').split(',').filter((x) => x !== '').map(Number),
  };
}

// ------------------------------------------------------------------ auth
function issueAccessToken(user, sessionId) {
  const token = jwt.sign({ id: user.id, role: user.role, sid: sessionId }, SECRET(), { expiresIn: ACCESS_TTL, audience: 'mobile' });
  const { exp, iat } = jwt.decode(token);
  return { access_token: token, token_type: 'Bearer', expires_in: exp - iat };
}

async function createSession(req, user, device = {}) {
  const refresh = crypto.randomBytes(48).toString('base64url');
  const expires = new Date(Date.now() + REFRESH_DAYS * 86400000);
  // one active session per device – signing in again on the same phone replaces it
  if (device.device_id) await query('UPDATE mobile_sessions SET revoked_at = NOW() WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL', [user.id, device.device_id]);
  const r = await query('INSERT INTO mobile_sessions SET ?', [{
    user_id: user.id,
    refresh_token_hash: sha256(refresh),
    device_id: device.device_id ? String(device.device_id).slice(0, 120) : null,
    device_name: device.device_name ? String(device.device_name).slice(0, 150) : null,
    platform: device.platform ? String(device.platform).slice(0, 20) : null,
    app_version: device.app_version ? String(device.app_version).slice(0, 30) : null,
    fcm_token: device.fcm_token ? String(device.fcm_token).slice(0, 255) : null,
    ip: attendance.clientIp(req),
    expires_at: toDateTimeStr(expires),
    last_used_at: toDateTimeStr(new Date()),
  }]);
  if (device.fcm_token) await claimFcmToken(device.fcm_token, r.insertId);
  return { ...issueAccessToken(user, r.insertId), refresh_token: refresh, refresh_expires_at: iso(toDateTimeStr(expires)) };
}

// a push token belongs to one phone: detach it from older sessions (e.g. another employee who used this phone)
const claimFcmToken = (token, sessionId) => query('UPDATE mobile_sessions SET fcm_token = NULL WHERE fcm_token = ? AND id <> ?', [String(token).slice(0, 255), sessionId]);

const userSummary = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

async function mobileAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Authentication required', 'UNAUTHORIZED');
    let payload;
    try {
      payload = jwt.verify(token, SECRET(), { audience: 'mobile' });
    } catch (e) {
      if (e.name === 'TokenExpiredError') throw new HttpError(401, 'Access token expired', 'TOKEN_EXPIRED');
      throw new HttpError(401, 'Invalid access token', 'TOKEN_INVALID');
    }
    const row = await one(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.employee_id, u.status, s.id AS session_id, s.revoked_at
       FROM users u JOIN mobile_sessions s ON s.user_id = u.id AND s.id = ? WHERE u.id = ?`,
      [payload.sid, payload.id]
    );
    if (!row || row.revoked_at) throw new HttpError(401, 'You have been signed out. Please sign in again.', 'SESSION_REVOKED');
    if (row.status !== 'active') throw new HttpError(401, 'Your account is disabled. Contact HR.', 'ACCOUNT_DISABLED');
    if (!row.employee_id) throw new HttpError(403, 'Your login is not linked to an employee profile', 'NOT_EMPLOYEE');
    req.user = row;
    req.sessionId = row.session_id;
    req.empId = row.employee_id;
    next();
  } catch (e) {
    next(e);
  }
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.', code: 'RATE_LIMITED' },
});
// many employees can share one office IP, so token refresh gets a higher limit
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again shortly.', code: 'RATE_LIMITED' },
});

// ================================================================== PUBLIC
router.get(
  '/app-config',
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const urls = await baseUrls(req);
    ok(res, {
      api_version: 'v1',
      company_name: s.company_name || null,
      logo_url: absUrl(urls, s.logo),
      support_email: s.email || null,
      support_phone: s.phone || null,
      timezone: process.env.TZ || 'Asia/Kolkata',
      utc_offset: TZ_OFFSET,
      server_time: iso(toDateTimeStr(new Date())),
      push_enabled: !!s.fcm_service_account, // FCM is set up on the server – register the device token
    });
  })
);

// OpenAPI spec for Postman / code generators
const SPEC = path.join(__dirname, '..', '..', '..', 'docs', 'mobile-api.openapi.yaml');
router.get('/openapi.yaml', (req, res, next) => res.type('text/yaml').sendFile(SPEC, (err) => err && next(new HttpError(404, 'API spec not found', 'NOT_FOUND'))));

router.post(
  '/auth/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new HttpError(400, 'Email and password are required', 'VALIDATION_ERROR');
    const user = await one('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    if (user.status !== 'active') throw new HttpError(403, 'Your account is disabled. Contact HR.', 'ACCOUNT_DISABLED');
    if (!user.employee_id) throw new HttpError(403, 'This app is for employees. Your login is not linked to an employee profile.', 'NOT_EMPLOYEE');
    const emp = await one('SELECT status FROM employees WHERE id = ?', [user.employee_id]);
    if (!emp || !['active', 'on_notice'].includes(emp.status)) throw new HttpError(403, 'Your employee profile is not active. Contact HR.', 'ACCOUNT_DISABLED');
    await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    const tokens = await createSession(req, user, pick(req.body, ['device_id', 'device_name', 'platform', 'app_version', 'fcm_token']));
    ok(res, { ...tokens, user: userSummary(user), employee: await employeeProfile(req, user.employee_id) }, { message: 'Signed in' });
  })
);

router.post(
  '/auth/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const refresh = req.body.refresh_token;
    if (!refresh) throw new HttpError(400, 'refresh_token is required', 'VALIDATION_ERROR');
    const session = await one('SELECT *, expires_at > NOW() AS valid FROM mobile_sessions WHERE refresh_token_hash = ?', [sha256(refresh)]);
    if (!session) throw new HttpError(401, 'Invalid refresh token. Please sign in again.', 'REFRESH_INVALID');
    if (session.revoked_at) throw new HttpError(401, 'You have been signed out. Please sign in again.', 'SESSION_REVOKED');
    if (!session.valid) throw new HttpError(401, 'Your session has expired. Please sign in again.', 'REFRESH_EXPIRED');
    const user = await one('SELECT id, role, status, employee_id FROM users WHERE id = ?', [session.user_id]);
    if (!user || user.status !== 'active' || !user.employee_id) throw new HttpError(401, 'Your account is disabled. Contact HR.', 'ACCOUNT_DISABLED');
    // rotate: the old refresh token stops working
    const next = crypto.randomBytes(48).toString('base64url');
    const expires = new Date(Date.now() + REFRESH_DAYS * 86400000);
    await query('UPDATE mobile_sessions SET refresh_token_hash = ?, expires_at = ?, last_used_at = NOW(), ip = ? WHERE id = ?', [sha256(next), toDateTimeStr(expires), attendance.clientIp(req), session.id]);
    ok(res, { ...issueAccessToken(user, session.id), refresh_token: next, refresh_expires_at: iso(toDateTimeStr(expires)) });
  })
);

router.post(
  '/auth/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!req.body.email) throw new HttpError(400, 'Email is required', 'VALIDATION_ERROR');
    await sendPasswordReset(req.body.email);
    ok(res, null, { message: 'If the email is registered, a password reset link has been sent.' });
  })
);

// ================================================================== AUTHENTICATED
router.use(mobileAuth);

// ------------------------------------------------------------------ session & account
router.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    if (bool(req.body.all_devices)) await query('UPDATE mobile_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [req.user.id]);
    else await query('UPDATE mobile_sessions SET revoked_at = NOW() WHERE id = ?', [req.sessionId]);
    ok(res, null, { message: 'Signed out' });
  })
);

router.put(
  '/auth/password',
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!new_password || String(new_password).length < 6) throw new HttpError(400, 'New password must be at least 6 characters', 'VALIDATION_ERROR');
    const user = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!(await bcrypt.compare(String(current_password || ''), user.password_hash))) throw new HttpError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(new_password), 10), req.user.id]);
    // sign out every other device
    await query('UPDATE mobile_sessions SET revoked_at = NOW() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL', [req.user.id, req.sessionId]);
    ok(res, null, { message: 'Password updated. Other devices have been signed out.' });
  })
);

router.put(
  '/auth/device',
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['fcm_token', 'app_version', 'device_name', 'platform']);
    if (data.fcm_token) data.fcm_token = String(data.fcm_token).slice(0, 255);
    if (Object.keys(data).length) await query('UPDATE mobile_sessions SET ? WHERE id = ?', [data, req.sessionId]);
    if (data.fcm_token) await claimFcmToken(data.fcm_token, req.sessionId);
    ok(res, null, { message: 'Device updated' });
  })
);

router.get(
  '/auth/sessions',
  asyncHandler(async (req, res) => {
    const rows = await query(
      'SELECT id, device_name, platform, app_version, ip, created_at, last_used_at FROM mobile_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY last_used_at DESC',
      [req.user.id]
    );
    ok(res, rows.map((r) => ({ ...r, created_at: iso(r.created_at), last_used_at: iso(r.last_used_at), is_current: r.id === req.sessionId })));
  })
);

router.delete(
  '/auth/sessions/:id',
  asyncHandler(async (req, res) => {
    const r = await query('UPDATE mobile_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL', [req.params.id, req.user.id]);
    if (!r.affectedRows) throw new HttpError(404, 'Session not found', 'NOT_FOUND');
    ok(res, null, { message: 'Device signed out' });
  })
);

// ------------------------------------------------------------------ profile
router.get(
  '/me',
  asyncHandler(async (req, res) => ok(res, { user: userSummary(req.user), employee: await employeeProfile(req, req.empId) }))
);

router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['phone', 'address', 'emergency_contact']);
    if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update. Allowed fields: phone, address, emergency_contact', 'VALIDATION_ERROR');
    await query('UPDATE employees SET ? WHERE id = ?', [data, req.empId]);
    if (data.phone !== undefined) await query('UPDATE users SET phone = ? WHERE id = ?', [data.phone, req.user.id]);
    ok(res, await employeeProfile(req, req.empId), { message: 'Profile updated' });
  })
);

router.post(
  '/me/photo',
  avatarUpload.single('photo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Attach an image in the "photo" field', 'VALIDATION_ERROR');
    const url = fileUrl('avatars', req.file);
    await query('UPDATE employees SET photo = ? WHERE id = ?', [url, req.empId]);
    await query('UPDATE users SET avatar = ? WHERE id = ?', [url, req.user.id]);
    ok(res, await employeeProfile(req, req.empId), { message: 'Photo updated' });
  })
);

// ------------------------------------------------------------------ dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const empId = req.empId;
    const s = await getSettings();
    const today = toDateStr();
    const month = today.slice(0, 7);
    const [profile, todayRow, summary, balance, counts, openTasks, report, announcements, holidays, unread, projectCount] = await Promise.all([
      employeeProfile(req, empId),
      attendance.todayStatus(empId),
      one(
        `SELECT COALESCE(SUM(status IN ('present','late','wfh')),0) present, COALESCE(SUM(status='late'),0) late, COALESCE(SUM(status='half_day'),0) half_day,
                COALESCE(SUM(status='absent'),0) absent, COALESCE(SUM(status='leave'),0) on_leave, COALESCE(SUM(status='wfh'),0) wfh, COALESCE(SUM(work_minutes),0) work_minutes
         FROM attendance WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
        [empId, month]
      ),
      leaveBalance(empId),
      one(
        `SELECT COALESCE(SUM(status='todo'),0) todo, COALESCE(SUM(status='in_progress'),0) in_progress, COALESCE(SUM(status='review'),0) review,
                COALESCE(SUM(status='blocked'),0) blocked, COALESCE(SUM(status='done'),0) done,
                COALESCE(SUM(due_date < CURDATE() AND status <> 'done'),0) overdue, COALESCE(SUM(due_date = CURDATE() AND status <> 'done'),0) due_today
         FROM tasks WHERE assigned_to = ?`,
        [empId]
      ),
      query(
        `SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.assigned_to = ? AND t.status <> 'done'
         ORDER BY t.due_date IS NULL, t.due_date, FIELD(t.priority,'urgent','high','medium','low') LIMIT 10`,
        [empId]
      ),
      one('SELECT id FROM daily_reports WHERE employee_id = ? AND report_date = ?', [empId, today]),
      query("SELECT id, title, message, priority, created_at FROM announcements WHERE status = 'active' ORDER BY id DESC LIMIT 5"),
      query('SELECT id, title, date, type FROM holidays WHERE date >= ? ORDER BY date LIMIT 5', [today]),
      one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]),
      one('SELECT COUNT(*) AS c FROM project_members WHERE employee_id = ?', [empId]),
    ]);
    const a = todayRow.attendance;
    ok(res, {
      date: today,
      server_time: iso(toDateTimeStr(new Date())),
      employee: profile,
      attendance: {
        today: fmtAttendance(a),
        can_check_in: !a || !a.check_in,
        can_check_out: Boolean(a && a.check_in && !a.check_out),
        rules: await attendanceRules(s),
      },
      month_summary: { month, ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, Number(v)])) },
      leave_balance: balance.map((b) => ({ leave_type_id: b.id, name: b.name, color: b.color, is_paid: Boolean(b.is_paid), quota: Number(b.days_per_year), used: b.used, pending: b.pending, remaining: b.remaining })),
      tasks: { counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])), open: openTasks.map((t) => fmtTask(t, req.user)) },
      daily_report_submitted: Boolean(report),
      project_count: projectCount.c,
      announcements: announcements.map((x) => ({ ...x, created_at: iso(x.created_at) })),
      upcoming_holidays: holidays.map((h) => ({ ...h, date: String(h.date).slice(0, 10) })),
      unread_notifications: unread.c,
    });
  })
);

// ------------------------------------------------------------------ projects
const PROJECT_SELECT = `p.*, c.name AS client_name, m.role AS my_role, (m.id IS NOT NULL) AS is_member,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.assigned_to = ?) AS my_task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.assigned_to = ? AND t.status <> 'done') AS my_open_tasks`;
const PROJECT_FROM = `projects p LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN project_members m ON m.project_id = p.id AND m.employee_id = ?`;
const PROJECT_VISIBLE = '(m.id IS NOT NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assigned_to = ?))';

router.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const e = req.empId;
    const where = [PROJECT_VISIBLE];
    const params = [e, e, e, e];
    if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    const rows = await query(`SELECT ${PROJECT_SELECT} FROM ${PROJECT_FROM} WHERE ${where.join(' AND ')} ORDER BY FIELD(p.status,'in_progress','planning','on_hold','completed','cancelled'), p.name`, params);
    ok(res, rows.map(fmtProject));
  })
);

router.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const e = req.empId;
    const p = await one(`SELECT ${PROJECT_SELECT} FROM ${PROJECT_FROM} WHERE p.id = ? AND ${PROJECT_VISIBLE}`, [e, e, e, req.params.id, e]);
    if (!p) throw new HttpError(404, 'Project not found', 'NOT_FOUND');
    const urls = await baseUrls(req);
    const [team, tasks, att] = await Promise.all([
      query(
        `SELECT e.id, e.name, e.emp_code, e.photo, e.phone, g.name AS designation, m.role
         FROM project_members m JOIN employees e ON e.id = m.employee_id LEFT JOIN designations g ON g.id = e.designation_id
         WHERE m.project_id = ? ORDER BY e.name`,
        [p.id]
      ),
      query(`SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.project_id = ? AND t.assigned_to = ? ORDER BY FIELD(t.status,'in_progress','todo','review','blocked','done'), t.due_date`, [p.id, e]),
      one('SELECT a.*, pr.name AS project_name FROM attendance a LEFT JOIN projects pr ON pr.id = a.project_id WHERE a.employee_id = ? AND a.date = ? AND a.project_id = ?', [e, toDateStr(), p.id]),
    ]);
    ok(res, {
      ...fmtProject(p),
      team: team.map((m) => ({ id: m.id, name: m.name, emp_code: m.emp_code, designation: m.designation, role: m.role, phone: m.phone, photo_url: absUrl(urls, m.photo) })),
      my_tasks: tasks.map((t) => fmtTask(t, req.user)),
      today_attendance: fmtAttendance(att),
    });
  })
);

// ------------------------------------------------------------------ attendance
router.get(
  '/attendance/geofences',
  asyncHandler(async (req, res) => {
    const rules = await attendanceRules();
    const sites = await attendance.employeeGeofences(req.empId);
    ok(res, { mode: rules.geofence_mode, max_gps_accuracy: rules.max_gps_accuracy, sites });
  })
);

router.get(
  '/attendance/today',
  asyncHandler(async (req, res) => {
    const { attendance: a, shift } = await attendance.todayStatus(req.empId);
    ok(res, {
      date: toDateStr(),
      server_time: iso(toDateTimeStr(new Date())),
      attendance: fmtAttendance(a),
      shift: { start: shift?.shift_start ? String(shift.shift_start).slice(0, 5) : null, end: shift?.shift_end ? String(shift.shift_end).slice(0, 5) : null },
      can_check_in: !a || !a.check_in,
      can_check_out: Boolean(a && a.check_in && !a.check_out),
      rules: await attendanceRules(),
    });
  })
);

const LOCATION_FIELDS = ['latitude', 'longitude', 'accuracy', 'is_mocked'];
const deviceInfo = (req) => [req.body.device_name, req.body.platform, req.body.app_version].filter(Boolean).join(' · ') || req.get('user-agent');

router.post(
  '/attendance/check-in',
  selfieUpload.single('photo'),
  asyncHandler(async (req, res) => {
    let result;
    try {
      result = await attendance.checkIn(req.empId, {
        ...pick(req.body, [...LOCATION_FIELDS, 'wfh', 'notes', 'project_id']),
        source: 'mobile',
        ip: attendance.clientIp(req),
        photo: req.file ? fileUrl('attendance', req.file) : null,
        device_info: deviceInfo(req),
      });
    } catch (e) {
      // refused check-in (outside geofence etc.) – don't keep the selfie
      if (req.file) fs.unlink(req.file.path, () => {});
      throw e;
    }
    ok(res, { attendance: fmtAttendance(result.attendance), geofence: result.geofence }, { message: result.message });
  })
);

router.post(
  '/attendance/check-out',
  asyncHandler(async (req, res) => {
    const result = await attendance.checkOut(req.empId, pick(req.body, LOCATION_FIELDS));
    ok(res, { attendance: fmtAttendance(result.attendance), geofence: result.geofence }, { message: result.message });
  })
);

router.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const month = req.query.month || toDateStr().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'month must be in YYYY-MM format', 'VALIDATION_ERROR');
    const [rows, holidays, rules] = await Promise.all([
      query(
        `SELECT a.*, p.name AS project_name FROM attendance a LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.employee_id = ? AND DATE_FORMAT(a.date, '%Y-%m') = ? ORDER BY a.date`,
        [req.empId, month]
      ),
      query("SELECT id, title, date, type FROM holidays WHERE DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date", [month]),
      attendanceRules(),
    ]);
    const summary = { present: 0, late: 0, half_day: 0, absent: 0, leave: 0, wfh: 0, holiday: 0, work_minutes: 0 };
    rows.forEach((r) => {
      if (r.status in summary) summary[r.status] += 1;
      summary.work_minutes += r.work_minutes || 0;
    });
    // "present" counts every day the employee worked (on time, late or WFH)
    summary.present += summary.late + summary.wfh;
    ok(res, {
      month,
      summary,
      records: rows.map(fmtAttendance),
      holidays: holidays.map((h) => ({ ...h, date: String(h.date).slice(0, 10) })),
      weekly_off: rules.weekly_off,
    });
  })
);

// ------------------------------------------------------------------ leaves & holidays
router.get(
  '/leaves/types',
  asyncHandler(async (req, res) => {
    const rows = await query("SELECT id, name, days_per_year, is_paid, color FROM leave_types WHERE status = 'active' ORDER BY id");
    ok(res, rows.map((t) => ({ id: t.id, name: t.name, quota: Number(t.days_per_year), is_paid: Boolean(t.is_paid), color: t.color })));
  })
);

router.get(
  '/leaves/balance',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = await leaveBalance(req.empId, year);
    ok(res, { year, balance: rows.map((b) => ({ leave_type_id: b.id, name: b.name, color: b.color, is_paid: Boolean(b.is_paid), quota: Number(b.days_per_year), used: b.used, pending: b.pending, remaining: b.remaining })) });
  })
);

router.get(
  '/leaves/calculate',
  asyncHandler(async (req, res) => {
    const from = requireDate(req.query.from_date, 'from_date');
    const to = req.query.to_date ? requireDate(req.query.to_date, 'to_date') : from;
    if (to < from) throw new HttpError(400, 'End date cannot be before start date', 'VALIDATION_ERROR');
    ok(res, { from_date: from, to_date: to, half_day: bool(req.query.half_day), days: await countLeaveDays(from, to, bool(req.query.half_day)) });
  })
);

router.get(
  '/leaves',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = paging(req);
    const where = ['l.employee_id = ?'];
    const params = [req.empId];
    if (req.query.status) { where.push('l.status = ?'); params.push(req.query.status); }
    if (req.query.year) { where.push('YEAR(l.from_date) = ?'); params.push(Number(req.query.year)); }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM leave_requests l WHERE ${w}`, params);
    const rows = await query(
      `SELECT l.*, t.name AS leave_type, t.color, t.is_paid, u.name AS approved_by_name
       FROM leave_requests l JOIN leave_types t ON t.id = l.leave_type_id LEFT JOIN users u ON u.id = l.approved_by
       WHERE ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    ok(res, rows.map(fmtLeave), { meta: { page, limit, total } });
  })
);

async function myLeave(empId, id) {
  const l = await one(
    `SELECT l.*, t.name AS leave_type, t.color, t.is_paid, u.name AS approved_by_name
     FROM leave_requests l JOIN leave_types t ON t.id = l.leave_type_id LEFT JOIN users u ON u.id = l.approved_by
     WHERE l.id = ? AND l.employee_id = ?`,
    [id, empId]
  );
  if (!l) throw new HttpError(404, 'Leave request not found', 'NOT_FOUND');
  return fmtLeave(l);
}

router.get('/leaves/:id', asyncHandler(async (req, res) => ok(res, await myLeave(req.empId, req.params.id))));

router.post(
  '/leaves',
  asyncHandler(async (req, res) => {
    requireDate(req.body.from_date, 'from_date');
    if (req.body.to_date) requireDate(req.body.to_date, 'to_date');
    const { id } = await createLeaveRequest(req.empId, req.body, req.user.id);
    ok(res, await myLeave(req.empId, id), { status: 201, message: 'Leave request submitted' });
  })
);

router.post(
  '/leaves/:id/cancel',
  asyncHandler(async (req, res) => {
    await cancelLeaveRequest(req.empId, req.params.id, req.user.id);
    ok(res, await myLeave(req.empId, req.params.id), { message: 'Leave request cancelled' });
  })
);

router.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = await query('SELECT id, title, date, type FROM holidays WHERE YEAR(date) = ? ORDER BY date', [year]);
    ok(res, rows.map((h) => ({ ...h, date: String(h.date).slice(0, 10) })));
  })
);

// ------------------------------------------------------------------ tasks
async function myTask(req, id) {
  const t = await one(`SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.id = ? AND t.assigned_to = ?`, [id, req.empId]);
  if (!t) throw new HttpError(404, 'Task not found', 'NOT_FOUND');
  return t;
}

async function assertProjectAccess(empId, projectId) {
  if (!projectId) return;
  const p = await one(
    'SELECT p.id FROM projects p WHERE p.id = ? AND (EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.employee_id = ?) OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assigned_to = ?))',
    [projectId, empId, empId]
  );
  if (!p) throw new HttpError(403, 'You are not assigned to this project', 'NOT_PROJECT_MEMBER');
}

function validateTaskFields(data) {
  if (data.priority && !PRIORITIES.includes(data.priority)) throw new HttpError(400, `priority must be one of ${PRIORITIES.join(', ')}`, 'VALIDATION_ERROR');
  if (data.status && !TASK_STATUSES.includes(data.status)) throw new HttpError(400, `status must be one of ${TASK_STATUSES.join(', ')}`, 'VALIDATION_ERROR');
  if (data.progress !== undefined && data.progress !== null) {
    const p = Number(data.progress);
    if (!Number.isInteger(p) || p < 0 || p > 100) throw new HttpError(400, 'progress must be a whole number from 0 to 100', 'VALIDATION_ERROR');
    data.progress = p;
  }
  ['start_date', 'due_date'].forEach((k) => data[k] && requireDate(data[k], k));
}

router.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = paging(req);
    const { q, status, priority, project_id, due, date } = req.query;
    const where = ['t.assigned_to = ?'];
    const params = [req.empId];
    if (q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (status) {
      const list = String(status).split(',').filter((x) => TASK_STATUSES.includes(x));
      if (list.length) { where.push('t.status IN (?)'); params.push(list); }
    }
    if (priority) { where.push('t.priority = ?'); params.push(priority); }
    if (project_id) { where.push('t.project_id = ?'); params.push(project_id); }
    if (due === 'today') where.push('t.due_date = CURDATE()');
    if (due === 'overdue') where.push("t.due_date < CURDATE() AND t.status <> 'done'");
    if (due === 'upcoming') where.push("t.due_date > CURDATE() AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND t.status <> 'done'");
    if (date) {
      // tasks planned for a day: started on/before it and not due before it, or completed that day
      requireDate(date, 'date');
      where.push("(((t.start_date IS NULL OR t.start_date <= ?) AND (t.due_date IS NULL OR t.due_date >= ?) AND t.status <> 'done') OR DATE(t.completed_at) = ? OR t.due_date = ?)");
      params.push(date, date, date, date);
    }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM tasks t WHERE ${w}`, params);
    const rows = await query(
      `SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE ${w}
       ORDER BY FIELD(t.status,'in_progress','todo','review','blocked','done'), FIELD(t.priority,'urgent','high','medium','low'), t.due_date IS NULL, t.due_date
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    ok(res, rows.map((t) => fmtTask(t, req.user)), { meta: { page, limit, total } });
  })
);

router.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const t = await myTask(req, req.params.id);
    const comments = await query(
      'SELECT c.id, c.comment, c.created_at, c.user_id, u.name AS user_name, u.role FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id',
      [t.id]
    );
    ok(res, { ...fmtTask(t, req.user), comments: comments.map((c) => ({ id: c.id, comment: c.comment, user: { id: c.user_id, name: c.user_name, role: c.role }, is_mine: c.user_id === req.user.id, created_at: iso(c.created_at) })) });
  })
);

router.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['title', 'description', 'project_id', 'priority', 'status', 'start_date', 'due_date', 'progress']);
    if (!data.title || !String(data.title).trim()) throw new HttpError(400, 'Task title is required', 'VALIDATION_ERROR');
    validateTaskFields(data);
    await assertProjectAccess(req.empId, data.project_id);
    data.assigned_to = req.empId; // employees create tasks for themselves
    data.assigned_by = req.user.id;
    data.start_date = data.start_date || toDateStr();
    if (data.status === 'done') { data.completed_at = toDateTimeStr(new Date()); data.progress = 100; }
    const r = await query('INSERT INTO tasks SET ?', [data]);
    ok(res, fmtTask(await myTask(req, r.insertId), req.user), { status: 201, message: 'Task created' });
  })
);

router.patch(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const t = await myTask(req, req.params.id);
    // tasks assigned by a manager: only status & progress can change
    const allowed = t.assigned_by === req.user.id
      ? ['title', 'description', 'project_id', 'priority', 'status', 'start_date', 'due_date', 'progress']
      : ['status', 'progress'];
    const data = pick(req.body, allowed);
    if (!Object.keys(data).length) throw new HttpError(400, `Nothing to update. Allowed fields: ${allowed.join(', ')}`, 'VALIDATION_ERROR');
    validateTaskFields(data);
    if (data.project_id) await assertProjectAccess(req.empId, data.project_id);
    if (data.status === 'done' && t.status !== 'done') { data.completed_at = toDateTimeStr(new Date()); data.progress = 100; }
    else if (data.status && data.status !== 'done') data.completed_at = null;
    await query('UPDATE tasks SET ? WHERE id = ?', [data, t.id]);
    notifyTaskStatus(t, data.status, req.user).catch(() => {});
    ok(res, fmtTask(await myTask(req, t.id), req.user), { message: 'Task updated' });
  })
);

router.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const t = await myTask(req, req.params.id);
    if (t.assigned_by !== req.user.id) throw new HttpError(403, 'Only tasks you created yourself can be deleted', 'FORBIDDEN');
    await query('DELETE FROM tasks WHERE id = ?', [t.id]);
    ok(res, null, { message: 'Task deleted' });
  })
);

router.post(
  '/tasks/:id/comments',
  asyncHandler(async (req, res) => {
    const t = await myTask(req, req.params.id);
    const id = await addTaskComment(t, req.user, req.body.comment);
    const c = await one('SELECT id, comment, created_at FROM task_comments WHERE id = ?', [id]);
    ok(res, { id: c.id, comment: c.comment, user: { id: req.user.id, name: req.user.name, role: req.user.role }, is_mine: true, created_at: iso(c.created_at) }, { status: 201, message: 'Comment added' });
  })
);

// ------------------------------------------------------------------ daily work reports
router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = paging(req);
    const where = ['r.employee_id = ?'];
    const params = [req.empId];
    if (req.query.date) { where.push('r.report_date = ?'); params.push(requireDate(req.query.date, 'date')); }
    if (req.query.from) { where.push('r.report_date >= ?'); params.push(requireDate(req.query.from, 'from')); }
    if (req.query.to) { where.push('r.report_date <= ?'); params.push(requireDate(req.query.to, 'to')); }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM daily_reports r WHERE ${w}`, params);
    const rows = await query(
      `SELECT r.*, p.name AS project_name FROM daily_reports r LEFT JOIN projects p ON p.id = r.project_id WHERE ${w} ORDER BY r.report_date DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    ok(res, rows.map(fmtReport), { meta: { page, limit, total } });
  })
);

router.post(
  '/reports',
  asyncHandler(async (req, res) => {
    if (req.body.report_date) requireDate(req.body.report_date, 'report_date');
    if (req.body.project_id) await assertProjectAccess(req.empId, req.body.project_id);
    const r = await saveDailyReport(req.empId, req.body, req.user.id);
    const full = await one('SELECT r.*, p.name AS project_name FROM daily_reports r LEFT JOIN projects p ON p.id = r.project_id WHERE r.id = ?', [r.id]);
    ok(res, fmtReport(full), { status: 201, message: 'Daily report submitted' });
  })
);

// ------------------------------------------------------------------ notifications & announcements
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = paging(req);
    const unreadOnly = bool(req.query.unread);
    const w = `user_id = ?${unreadOnly ? ' AND is_read = 0' : ''}`;
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM notifications WHERE ${w}`, [req.user.id]);
    const [{ unread }] = await query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
    const rows = await query(`SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [req.user.id, limit, offset]);
    ok(res, rows.map((n) => ({ ...n, is_read: Boolean(n.is_read), created_at: iso(n.created_at) })), { meta: { page, limit, total, unread } });
  })
);

router.post(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    ok(res, null, { message: 'Marked as read' });
  })
);

// sends a test push to every device of the signed-in user (this phone included)
router.post(
  '/notifications/test',
  asyncHandler(async (req, res) => {
    const result = await notifyUsers([req.user.id], { title: 'Test notification 🔔', body: 'Push notifications are working on this phone.', link: '/admin', type: 'test' });
    const out = await deliveryMessage(result);
    ok(res, { web: result && result.web, mobile: result && result.mobile && { sent: result.mobile.sent, failed: result.mobile.failed, devices: result.mobile.devices } }, { message: out.message });
  })
);

router.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    ok(res, null, { message: 'All notifications marked as read' });
  })
);

router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = paging(req);
    const [{ total }] = await query("SELECT COUNT(*) AS total FROM announcements WHERE status = 'active'");
    const rows = await query("SELECT id, title, message, priority, created_at FROM announcements WHERE status = 'active' ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);
    ok(res, rows.map((x) => ({ ...x, created_at: iso(x.created_at) })), { meta: { page, limit, total } });
  })
);

// ------------------------------------------------------------------ 404 & errors (same envelope)
router.use((req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' }));

const DEFAULT_CODES = { 400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'FILE_TOO_LARGE', 429: 'RATE_LIMITED' };
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let code = err instanceof HttpError ? err.code : undefined;
  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large (max 5 MB)' : message;
  } else if (/^File type .* is not allowed$/.test(message)) {
    status = 400;
    code = 'INVALID_FILE';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'A record with the same unique value already exists';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    message = 'A referenced record does not exist';
  }
  if (status >= 500) {
    console.error(err);
    message = 'Something went wrong on the server. Please try again.';
  }
  res.status(status).json({ success: false, message, code: code || DEFAULT_CODES[status] || 'SERVER_ERROR', ...(err.details ? { details: err.details } : {}) });
});

module.exports = router;
