const express = require('express');
const bcrypt = require('bcryptjs');
const { query, one, transaction } = require('../config/db');
const { authenticate, authorize, isStaffManager } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { pick, toDateStr, round2, formatDate } = require('../utils/helpers');
const { getSettings } = require('../utils/settings');
const { sendEmail, notifyAdmins } = require('../services/notify');
const { notifyRoles, notifyEmployee, fire } = require('../services/push');
const attendance = require('../services/attendance');

const router = express.Router();
router.use(authenticate);

const EMP_FIELDS = [
  'name', 'email', 'phone', 'gender', 'dob', 'father_name', 'address', 'department_id', 'designation_id', 'reporting_to',
  'employment_type', 'joining_date', 'probation_end', 'exit_date', 'salary', 'shift_start', 'shift_end', 'bank_name',
  'account_no', 'ifsc', 'pan', 'aadhaar', 'photo', 'emergency_contact', 'status',
];

const EMP_SELECT = `e.*, d.name AS department_name, g.name AS designation_name, r.name AS reporting_name,
  u.id AS user_id, u.role AS user_role, u.status AS user_status`;
const EMP_FROM = `employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations g ON g.id = e.designation_id
  LEFT JOIN employees r ON r.id = e.reporting_to
  LEFT JOIN users u ON u.employee_id = e.id`;

function requireEmployee(req) {
  if (!req.user.employee_id) throw new HttpError(400, 'Your login is not linked to an employee profile');
  return req.user.employee_id;
}

async function nextEmpCode(q = null) {
  const s = await getSettings();
  const prefix = s.emp_code_prefix || 'YJT';
  const sql = 'SELECT emp_code FROM employees WHERE emp_code LIKE ? ORDER BY LENGTH(emp_code) DESC, emp_code DESC LIMIT 1';
  const row = q ? (await q(sql, [`${prefix}%`]))[0] : await one(sql, [`${prefix}%`]);
  const n = row ? (parseInt(row.emp_code.slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

// ============================================================ EMPLOYEES
router.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const { q, status, department_id, employment_type, all } = req.query;
    // Lightweight list for dropdowns is available to everyone
    if (!isStaffManager(req.user) && !['accounts'].includes(req.user.role)) {
      const data = await query("SELECT id, name, emp_code, photo FROM employees WHERE status = 'active' ORDER BY name");
      return res.json({ data, total: data.length });
    }
    const where = [];
    const params = [];
    if (q) { where.push('(e.name LIKE ? OR e.emp_code LIKE ? OR e.email LIKE ? OR e.phone LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
    if (status) { where.push('e.status = ?'); params.push(status); }
    if (department_id) { where.push('e.department_id = ?'); params.push(department_id); }
    if (employment_type) { where.push('e.employment_type = ?'); params.push(employment_type); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(`SELECT ${EMP_SELECT} FROM ${EMP_FROM} ${w} ORDER BY e.status = 'active' DESC, e.name ASC ${all ? '' : 'LIMIT 500'}`, params);
    res.json({ data, total: data.length });
  })
);

router.get('/employees/next-code', authorize('hr'), asyncHandler(async (req, res) => res.json({ code: await nextEmpCode() })));

router.get(
  '/employees/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!isStaffManager(req.user) && req.user.employee_id !== id) throw new HttpError(403, 'Not allowed');
    const emp = await one(`SELECT ${EMP_SELECT}, u.email AS login_email FROM ${EMP_FROM} WHERE e.id = ?`, [id]);
    if (!emp) throw new HttpError(404, 'Employee not found');
    emp.documents = await query('SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC', [id]);
    emp.letters = await query("SELECT id, letter_no, title, type, issue_date, status FROM letters WHERE employee_id = ? ORDER BY id DESC", [id]);
    emp.leave_balance = await leaveBalance(id);
    const month = toDateStr().slice(0, 7);
    emp.attendance_summary = await one(
      `SELECT SUM(status IN ('present','late','wfh')) present, SUM(status='late') late, SUM(status='half_day') half_day,
              SUM(status='absent') absent, SUM(status='leave') on_leave
       FROM attendance WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
      [id, month]
    );
    res.json(emp);
  })
);

async function upsertLogin(q, empId, { email, name, phone, password, role = 'employee' }) {
  const existing = (await q('SELECT id FROM users WHERE employee_id = ?', [empId]))[0];
  if (existing) {
    const data = { email, name, phone };
    if (password) data.password_hash = await bcrypt.hash(password, 10);
    await q('UPDATE users SET ? WHERE id = ?', [data, existing.id]);
    if (password) await q('UPDATE mobile_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [existing.id]);
    return existing.id;
  }
  if (!password) throw new HttpError(400, 'Password is required to create a login');
  const r = await q('INSERT INTO users SET ?', [{ name, email, phone, role, employee_id: empId, password_hash: await bcrypt.hash(password, 10) }]);
  return r.insertId;
}

router.post(
  '/employees',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, EMP_FIELDS);
    if (!data.name) throw new HttpError(400, 'Employee name is required');
    const id = await transaction(async (q) => {
      data.emp_code = req.body.emp_code || (await nextEmpCode(q));
      const r = await q('INSERT INTO employees SET ?', [data]);
      if (req.body.create_login && data.email) {
        await upsertLogin(q, r.insertId, { email: data.email.toLowerCase(), name: data.name, phone: data.phone, password: req.body.password, role: req.body.login_role || 'employee' });
      }
      return r.insertId;
    });
    const s = await getSettings();
    if (req.body.create_login && data.email && req.body.send_welcome) {
      await sendEmail({
        to: data.email,
        subject: `Welcome to ${s.company_name || 'YJTechnosoft'}`,
        html: `<p>Dear ${data.name},</p><p>Welcome aboard! Your employee portal account has been created.</p>
          <p><b>Login URL:</b> <a href="${s.site_url || process.env.APP_URL}/login">${s.site_url || process.env.APP_URL}/login</a><br>
          <b>Email:</b> ${data.email}<br><b>Password:</b> ${req.body.password}</p>
          <p>Use the portal to mark attendance, apply for leave, view tasks and submit daily reports. Please change your password after first login.</p>`,
        refType: 'employee',
        refId: id,
        userId: req.user.id,
      });
    }
    res.status(201).json(await one(`SELECT ${EMP_SELECT} FROM ${EMP_FROM} WHERE e.id = ?`, [id]));
  })
);

router.put(
  '/employees/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, [...EMP_FIELDS, 'emp_code']);
    await transaction(async (q) => {
      if (Object.keys(data).length) await q('UPDATE employees SET ? WHERE id = ?', [data, req.params.id]);
      const emp = (await q('SELECT * FROM employees WHERE id = ?', [req.params.id]))[0];
      if (!emp) throw new HttpError(404, 'Employee not found');
      if (req.body.create_login && emp.email) {
        await upsertLogin(q, emp.id, { email: emp.email.toLowerCase(), name: emp.name, phone: emp.phone, password: req.body.password, role: req.body.login_role || 'employee' });
      }
      if (['resigned', 'terminated'].includes(emp.status)) await q("UPDATE users SET status = 'inactive' WHERE employee_id = ?", [emp.id]);
      else await q("UPDATE users SET status = 'active', name = ? WHERE employee_id = ?", [emp.name, emp.id]);
    });
    res.json(await one(`SELECT ${EMP_SELECT} FROM ${EMP_FROM} WHERE e.id = ?`, [req.params.id]));
  })
);

router.delete(
  '/employees/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    await transaction(async (q) => {
      await q("DELETE FROM users WHERE employee_id = ? AND role <> 'admin'", [req.params.id]);
      await q('UPDATE users SET employee_id = NULL WHERE employee_id = ?', [req.params.id]);
      await q('DELETE FROM employees WHERE id = ?', [req.params.id]);
    });
    res.json({ message: 'Employee deleted' });
  })
);

// Mobile app devices signed in as this employee (HR can sign out a lost phone)
router.get(
  '/employees/:id/mobile-sessions',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const data = await query(
      `SELECT s.id, s.device_name, s.platform, s.app_version, s.ip, s.created_at, s.last_used_at
       FROM mobile_sessions s JOIN users u ON u.id = s.user_id
       WHERE u.employee_id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW() ORDER BY s.last_used_at DESC`,
      [req.params.id]
    );
    res.json({ data });
  })
);

router.delete(
  '/employees/:id/mobile-sessions/:sessionId?',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const params = [req.params.id];
    let extra = '';
    if (req.params.sessionId) { extra = ' AND s.id = ?'; params.push(req.params.sessionId); }
    const r = await query(`UPDATE mobile_sessions s JOIN users u ON u.id = s.user_id SET s.revoked_at = NOW() WHERE u.employee_id = ? AND s.revoked_at IS NULL${extra}`, params);
    res.json({ message: `${r.affectedRows} device(s) signed out` });
  })
);

// ============================================================ ATTENDANCE
router.get(
  '/attendance/today',
  asyncHandler(async (req, res) => res.json(await attendance.todayStatus(requireEmployee(req))))
);

router.post(
  '/attendance/check-in',
  asyncHandler(async (req, res) => {
    const empId = requireEmployee(req);
    const { message, attendance: row, geofence } = await attendance.checkIn(empId, { ...pick(req.body, ['wfh', 'notes', 'project_id', 'latitude', 'longitude', 'accuracy', 'location']), source: 'web', ip: attendance.clientIp(req) });
    res.json({ message, attendance: row, geofence });
  })
);

router.post(
  '/attendance/check-out',
  asyncHandler(async (req, res) => {
    const empId = requireEmployee(req);
    const { message, attendance: row, geofence } = await attendance.checkOut(empId, pick(req.body, ['latitude', 'longitude', 'accuracy', 'location']));
    res.json({ message, attendance: row, geofence });
  })
);

router.get(
  '/attendance/my',
  asyncHandler(async (req, res) => {
    const empId = req.query.employee_id && isStaffManager(req.user) ? req.query.employee_id : requireEmployee(req);
    const month = req.query.month || toDateStr().slice(0, 7);
    const rows = await query("SELECT * FROM attendance WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date", [empId, month]);
    const holidays = await query("SELECT * FROM holidays WHERE DATE_FORMAT(date, '%Y-%m') = ?", [month]);
    res.json({ data: rows, holidays });
  })
);

// Daily register for HR: every active employee with today's (or chosen date's) status
router.get(
  '/attendance',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || toDateStr();
    const rows = await query(
      `SELECT e.id AS employee_id, e.name, e.emp_code, e.photo, e.shift_start, d.name AS department_name,
              a.id, a.check_in, a.check_out, a.work_minutes, a.status, a.notes, a.check_in_ip, a.check_in_location,
              a.check_out_location, a.source, a.project_id, p.name AS project_name, a.check_in_geofence, a.check_in_distance,
              a.check_out_geofence, a.check_out_distance, a.check_in_accuracy, a.check_in_photo
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE e.status IN ('active','on_notice') AND (e.joining_date IS NULL OR e.joining_date <= ?)
       ORDER BY e.name`,
      [date, date]
    );
    const holiday = await one('SELECT * FROM holidays WHERE date = ?', [date]);
    res.json({ data: rows, date, holiday });
  })
);

router.post(
  '/attendance/mark',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const { date, records = [] } = req.body;
    if (!date) throw new HttpError(400, 'Date is required');
    for (const r of records) {
      if (!r.employee_id || !r.status) continue;
      const checkIn = r.check_in ? (r.check_in.length <= 5 ? `${date} ${r.check_in}:00` : r.check_in) : null;
      const checkOut = r.check_out ? (r.check_out.length <= 5 ? `${date} ${r.check_out}:00` : r.check_out) : null;
      const minutes = checkIn && checkOut ? Math.max(0, Math.round((new Date(checkOut.replace(' ', 'T')) - new Date(checkIn.replace(' ', 'T'))) / 60000)) : 0;
      await query(
        `INSERT INTO attendance (employee_id, date, status, check_in, check_out, work_minutes, notes, marked_by)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), check_in = COALESCE(VALUES(check_in), check_in),
           check_out = COALESCE(VALUES(check_out), check_out), work_minutes = IF(VALUES(work_minutes) > 0, VALUES(work_minutes), work_minutes),
           notes = VALUES(notes), marked_by = VALUES(marked_by)`,
        [r.employee_id, date, r.status, checkIn, checkOut, minutes, r.notes || null, req.user.id]
      );
    }
    res.json({ message: 'Attendance saved' });
  })
);

router.get(
  '/attendance/report',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const month = req.query.month || toDateStr().slice(0, 7);
    const employees = await query(
      "SELECT e.id, e.name, e.emp_code, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.status IN ('active','on_notice') ORDER BY e.name"
    );
    const rows = await query(
      "SELECT employee_id, DAY(date) AS day, status, work_minutes FROM attendance WHERE DATE_FORMAT(date, '%Y-%m') = ?",
      [month]
    );
    const holidays = await query("SELECT DAY(date) AS day, title FROM holidays WHERE DATE_FORMAT(date, '%Y-%m') = ?", [month]);
    const map = {};
    rows.forEach((r) => {
      map[r.employee_id] = map[r.employee_id] || { days: {}, present: 0, late: 0, half_day: 0, absent: 0, leave: 0, wfh: 0, minutes: 0 };
      const m = map[r.employee_id];
      m.days[r.day] = r.status;
      if (r.status in m) m[r.status] += 1;
      m.minutes += r.work_minutes || 0;
    });
    const data = employees.map((e) => ({ ...e, ...(map[e.id] || { days: {}, present: 0, late: 0, half_day: 0, absent: 0, leave: 0, wfh: 0, minutes: 0 }) }));
    res.json({ month, data, holidays });
  })
);

// ============================================================ LEAVES
async function leaveBalance(empId, year = new Date().getFullYear()) {
  const types = await query("SELECT * FROM leave_types WHERE status = 'active' ORDER BY id");
  const used = await query(
    "SELECT leave_type_id, SUM(days) AS used FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND YEAR(from_date) = ? GROUP BY leave_type_id",
    [empId, year]
  );
  const pending = await query(
    "SELECT leave_type_id, SUM(days) AS pending FROM leave_requests WHERE employee_id = ? AND status = 'pending' AND YEAR(from_date) = ? GROUP BY leave_type_id",
    [empId, year]
  );
  return types.map((t) => {
    const u = Number((used.find((x) => x.leave_type_id === t.id) || {}).used || 0);
    const p = Number((pending.find((x) => x.leave_type_id === t.id) || {}).pending || 0);
    return { ...t, used: u, pending: p, remaining: Math.max(0, Number(t.days_per_year) - u) };
  });
}

async function countLeaveDays(from, to, halfDay) {
  if (halfDay) return 0.5;
  const s = await getSettings();
  const weeklyOff = String(s.weekly_off ?? '0').split(',').filter((x) => x !== '').map(Number);
  const holidays = (await query('SELECT date FROM holidays WHERE date BETWEEN ? AND ?', [from, to])).map((h) => String(h.date).slice(0, 10));
  let days = 0;
  for (let d = new Date(`${from}T00:00:00`); d <= new Date(`${to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    if (!weeklyOff.includes(d.getDay()) && !holidays.includes(toDateStr(d))) days += 1;
  }
  return days;
}

router.get(
  '/leaves/balance',
  asyncHandler(async (req, res) => {
    const empId = req.query.employee_id && isStaffManager(req.user) ? req.query.employee_id : requireEmployee(req);
    res.json(await leaveBalance(empId, Number(req.query.year) || new Date().getFullYear()));
  })
);

router.get(
  '/leaves',
  asyncHandler(async (req, res) => {
    const { status, employee_id, mine } = req.query;
    const where = [];
    const params = [];
    if (!isStaffManager(req.user) || mine) {
      where.push('l.employee_id = ?');
      params.push(requireEmployee(req));
    } else if (employee_id) {
      where.push('l.employee_id = ?');
      params.push(employee_id);
    }
    if (status) { where.push('l.status = ?'); params.push(status); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(
      `SELECT l.*, e.name AS employee_name, e.emp_code, t.name AS leave_type, t.color, u.name AS approved_by_name
       FROM leave_requests l JOIN employees e ON e.id = l.employee_id
       JOIN leave_types t ON t.id = l.leave_type_id LEFT JOIN users u ON u.id = l.approved_by
       ${w} ORDER BY l.status = 'pending' DESC, l.id DESC LIMIT 300`,
      params
    );
    res.json({ data, total: data.length });
  })
);

/** Validates and saves a leave request, then notifies HR. Shared with the mobile API. */
async function createLeaveRequest(empId, body, actorUserId) {
  const { leave_type_id, from_date, to_date, reason, half_day } = body;
  if (!leave_type_id || !from_date) throw new HttpError(400, 'Leave type and dates are required', 'VALIDATION_ERROR');
  const to = to_date || from_date;
  if (to < from_date) throw new HttpError(400, 'End date cannot be before start date', 'VALIDATION_ERROR');
  const type = await one("SELECT id FROM leave_types WHERE id = ? AND status = 'active'", [leave_type_id]);
  if (!type) throw new HttpError(400, 'Invalid leave type', 'VALIDATION_ERROR');
  const overlap = await one(
    "SELECT id FROM leave_requests WHERE employee_id = ? AND status IN ('pending','approved') AND from_date <= ? AND to_date >= ?",
    [empId, to, from_date]
  );
  if (overlap) throw new HttpError(409, 'You already have a leave request for these dates', 'LEAVE_OVERLAP');
  const halfDay = half_day === true || half_day === 1 || half_day === '1' || half_day === 'true';
  const days = await countLeaveDays(from_date, to, halfDay);
  if (!days) throw new HttpError(400, 'Selected dates fall on holidays / weekly offs', 'NO_WORKING_DAYS');
  const r = await query('INSERT INTO leave_requests SET ?', [{ employee_id: empId, leave_type_id, from_date, to_date: to, half_day: halfDay ? 1 : 0, days, reason: reason || null }]);
  const emp = await one('SELECT name FROM employees WHERE id = ?', [empId]);
  fire(notifyRoles(['hr'], { title: `🗓️ Leave request – ${emp.name}`, body: `${days} day(s): ${formatDate(from_date)} to ${formatDate(to)}`, link: '/admin/leaves', type: 'leave' }, { excludeUserId: actorUserId }));
  notifyAdmins(
    `Leave request – ${emp.name}`,
    `<p><b>${emp.name}</b> applied for ${days} day(s) leave from ${formatDate(from_date)} to ${formatDate(to)}.</p><p>Reason: ${reason || '-'}</p>`
  ).catch(() => {});
  return { id: r.insertId, days };
}

router.post(
  '/leaves',
  asyncHandler(async (req, res) => {
    const empId = req.body.employee_id && isStaffManager(req.user) ? req.body.employee_id : requireEmployee(req);
    res.status(201).json(await createLeaveRequest(empId, req.body, req.user.id));
  })
);

router.patch(
  '/leaves/:id/status',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const { status, remarks } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) throw new HttpError(400, 'Invalid status');
    const lr = await one('SELECT l.*, e.name, e.email, t.name AS type_name, t.is_paid FROM leave_requests l JOIN employees e ON e.id = l.employee_id JOIN leave_types t ON t.id = l.leave_type_id WHERE l.id = ?', [req.params.id]);
    if (!lr) throw new HttpError(404, 'Leave request not found');
    await transaction(async (q) => {
      await q('UPDATE leave_requests SET status = ?, remarks = ?, approved_by = ? WHERE id = ?', [status, remarks || null, req.user.id, lr.id]);
      if (status === 'approved') {
        for (let d = new Date(`${lr.from_date}T00:00:00`); d <= new Date(`${lr.to_date}T00:00:00`); d.setDate(d.getDate() + 1)) {
          await q(
            `INSERT INTO attendance (employee_id, date, status, notes, marked_by) VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE status = IF(check_in IS NULL, VALUES(status), status), notes = VALUES(notes)`,
            [lr.employee_id, toDateStr(d), lr.half_day ? 'half_day' : 'leave', `${lr.type_name}${lr.is_paid ? '' : ' (unpaid)'}`, req.user.id]
          );
        }
      } else {
        await q("DELETE FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? AND status IN ('leave') AND check_in IS NULL", [lr.employee_id, lr.from_date, lr.to_date]);
      }
    });
    if (status !== 'pending') {
      fire(notifyEmployee(lr.employee_id, {
        title: status === 'approved' ? '✅ Leave approved' : '❌ Leave rejected',
        body: `${lr.type_name}: ${formatDate(lr.from_date)} to ${formatDate(lr.to_date)}${remarks ? ` – ${remarks}` : ''}`,
        link: '/admin/my/leaves',
        type: 'leave',
      }));
    }
    if (lr.email && status !== 'pending') {
      sendEmail({
        to: lr.email,
        subject: `Your leave request has been ${status}`,
        html: `<p>Dear ${lr.name},</p><p>Your ${lr.type_name} request from <b>${formatDate(lr.from_date)}</b> to <b>${formatDate(lr.to_date)}</b> (${lr.days} day/s) has been <b>${status}</b>.</p>${remarks ? `<p>Remarks: ${remarks}</p>` : ''}`,
        refType: 'leave',
        refId: lr.id,
        userId: req.user.id,
      }).catch(() => {});
    }
    res.json({ message: `Leave ${status}` });
  })
);

router.patch(
  '/leaves/:id/cancel',
  asyncHandler(async (req, res) => {
    const empId = requireEmployee(req);
    const r = await query("UPDATE leave_requests SET status = 'cancelled' WHERE id = ? AND employee_id = ? AND status = 'pending'", [req.params.id, empId]);
    if (!r.affectedRows) throw new HttpError(400, 'Only your pending requests can be cancelled');
    res.json({ message: 'Leave request cancelled' });
  })
);

// ============================================================ PAYROLL
async function computePayslip(emp, month, year, extra = {}) {
  const s = await getSettings();
  const weeklyOff = String(s.weekly_off ?? '0').split(',').filter((x) => x !== '').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const ym = `${year}-${pad(month)}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidays = (await query("SELECT date FROM holidays WHERE DATE_FORMAT(date, '%Y-%m') = ?", [ym])).map((h) => String(h.date).slice(0, 10));
  const att = await query("SELECT date, status, notes FROM attendance WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?", [emp.id, ym]);
  const byDate = {};
  att.forEach((a) => (byDate[String(a.date).slice(0, 10)] = a));
  const today = toDateStr();
  let working = 0;
  let lop = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${ym}-${pad(d)}`;
    const dow = new Date(`${ds}T00:00:00`).getDay();
    if (weeklyOff.includes(dow) || holidays.includes(ds)) continue;
    working += 1;
    if (emp.joining_date && ds < String(emp.joining_date).slice(0, 10)) { lop += 1; continue; }
    if (emp.exit_date && ds > String(emp.exit_date).slice(0, 10)) { lop += 1; continue; }
    const a = byDate[ds];
    if (!a) { if (ds <= today && s.payroll_missing_as_absent !== '0') lop += 1; continue; }
    if (a.status === 'absent') lop += 1;
    else if (a.status === 'half_day') lop += 0.5;
    else if (a.status === 'leave' && /unpaid/i.test(a.notes || '')) lop += 1;
  }
  const gross = Number(emp.salary) || 0;
  const basicPct = Number(s.salary_basic_pct || 50) / 100;
  const hraPct = Number(s.salary_hra_pct || 20) / 100;
  const basic = round2(gross * basicPct);
  const hra = round2(gross * hraPct);
  const allowances = round2(gross - basic - hra);
  const lop_amount = working ? round2((gross / working) * lop) : 0;
  const bonus = round2(extra.bonus || 0);
  const deductions = round2(extra.deductions || 0);
  return {
    employee_id: emp.id,
    month,
    year,
    working_days: working,
    paid_days: Math.max(0, working - lop),
    lop_days: lop,
    gross,
    basic,
    hra,
    allowances,
    bonus,
    deductions,
    lop_amount,
    net_pay: Math.max(0, round2(gross + bonus - deductions - lop_amount)),
  };
}

router.get(
  '/payslips',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (!['admin', 'hr', 'accounts'].includes(req.user.role) || req.query.mine) {
      where.push('p.employee_id = ?');
      params.push(requireEmployee(req));
    } else {
      if (req.query.month) { where.push('p.month = ?'); params.push(req.query.month); }
      if (req.query.year) { where.push('p.year = ?'); params.push(req.query.year); }
      if (req.query.employee_id) { where.push('p.employee_id = ?'); params.push(req.query.employee_id); }
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(
      `SELECT p.*, e.name, e.emp_code, e.email, e.phone FROM payslips p JOIN employees e ON e.id = p.employee_id ${w} ORDER BY p.year DESC, p.month DESC, e.name LIMIT 500`,
      params
    );
    res.json({ data, total: data.length });
  })
);

router.post(
  '/payslips/generate',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    if (!month || !year) throw new HttpError(400, 'Month and year are required');
    const ids = Array.isArray(req.body.employee_ids) && req.body.employee_ids.length ? req.body.employee_ids : null;
    const emps = await query(
      `SELECT * FROM employees WHERE status IN ('active','on_notice') ${ids ? 'AND id IN (?)' : ''} AND salary > 0`,
      ids ? [ids] : []
    );
    let created = 0;
    let skipped = 0;
    for (const emp of emps) {
      const existing = await one('SELECT * FROM payslips WHERE employee_id = ? AND month = ? AND year = ?', [emp.id, month, year]);
      if (existing && existing.status === 'paid') { skipped += 1; continue; }
      const p = await computePayslip(emp, month, year, existing || {});
      if (existing) await query('UPDATE payslips SET ? WHERE id = ?', [p, existing.id]);
      else await query('INSERT INTO payslips SET ?', [p]);
      created += 1;
    }
    res.json({ message: `${created} payslip(s) generated${skipped ? `, ${skipped} already paid` : ''}` });
  })
);

router.put(
  '/payslips/:id',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    const p = await one('SELECT * FROM payslips WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Payslip not found');
    const upd = pick(req.body, ['bonus', 'deductions', 'lop_days', 'notes']);
    const merged = { ...p, ...upd };
    merged.lop_amount = Number(p.working_days) ? round2((Number(p.gross) / Number(p.working_days)) * Number(merged.lop_days)) : 0;
    merged.paid_days = Math.max(0, Number(p.working_days) - Number(merged.lop_days));
    merged.net_pay = Math.max(0, round2(Number(p.gross) + Number(merged.bonus || 0) - Number(merged.deductions || 0) - merged.lop_amount));
    await query('UPDATE payslips SET bonus = ?, deductions = ?, lop_days = ?, lop_amount = ?, paid_days = ?, net_pay = ?, notes = ? WHERE id = ?', [
      merged.bonus || 0, merged.deductions || 0, merged.lop_days, merged.lop_amount, merged.paid_days, merged.net_pay, merged.notes || null, p.id,
    ]);
    res.json(await one('SELECT * FROM payslips WHERE id = ?', [p.id]));
  })
);

router.patch(
  '/payslips/:id/paid',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    await query("UPDATE payslips SET status = 'paid', paid_on = ? WHERE id = ?", [req.body.paid_on || toDateStr(), req.params.id]);
    res.json({ message: 'Marked as paid' });
  })
);

router.delete(
  '/payslips/:id',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM payslips WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payslip deleted' });
  })
);

module.exports = router;
module.exports.leaveBalance = leaveBalance;
module.exports.createLeaveRequest = createLeaveRequest;
module.exports.countLeaveDays = countLeaveDays;
