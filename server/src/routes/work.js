const express = require('express');
const { query, one } = require('../config/db');
const { authenticate, authorize, isStaffManager } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { pick, toDateStr, toDateTimeStr, formatDate } = require('../utils/helpers');
const { sendEmail } = require('../services/notify');
const { getSettings } = require('../utils/settings');
const { notifyEmployee, notifyUsers, notifyRoles, fire } = require('../services/push');

const router = express.Router();
router.use(authenticate);

const TASK_SELECT = `t.*, e.name AS assignee_name, e.emp_code AS assignee_code, e.photo AS assignee_photo,
  p.name AS project_name, u.name AS assigned_by_name,
  (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count`;
const TASK_FROM = `tasks t LEFT JOIN employees e ON e.id = t.assigned_to
  LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assigned_by`;

async function notifyAssignee(taskId, actor) {
  const t = await one(`SELECT ${TASK_SELECT}, e.email AS assignee_email FROM ${TASK_FROM} WHERE t.id = ?`, [taskId]);
  if (!t) return;
  fire(notifyEmployee(t.assigned_to, {
    title: `📌 New task: ${t.title}`,
    body: `${t.priority.toUpperCase()} priority${t.due_date ? ` · due ${formatDate(t.due_date)}` : ''} · by ${actor.name}`,
    link: '/admin/my/tasks',
    type: 'task',
    data: { task_id: t.id },
  }));
  if (!t.assignee_email) return;
  const s = await getSettings();
  await sendEmail({
    to: t.assignee_email,
    subject: `New task assigned: ${t.title}`,
    html: `<p>Hi ${t.assignee_name},</p><p><b>${actor.name}</b> assigned you a task.</p>
      <table cellpadding="6" style="border-collapse:collapse;background:#f8fafc;border-radius:8px">
      <tr><td><b>Task</b></td><td>${t.title}</td></tr>
      ${t.project_name ? `<tr><td><b>Project</b></td><td>${t.project_name}</td></tr>` : ''}
      <tr><td><b>Priority</b></td><td>${t.priority}</td></tr>
      ${t.due_date ? `<tr><td><b>Due</b></td><td>${formatDate(t.due_date)}</td></tr>` : ''}</table>
      ${t.description ? `<p>${t.description}</p>` : ''}
      <p><a href="${s.site_url || process.env.APP_URL}/admin/tasks">Open task board</a></p>`,
    refType: 'task',
    refId: t.id,
    userId: actor.id,
  });
}

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done', blocked: 'Blocked' };

/** Status changed: tell the other side (assigner ↔ assignee). Shared with the mobile API. */
async function notifyTaskStatus(t, status, actor) {
  if (!status || status === t.status) return;
  const assignee = t.assigned_to ? await one('SELECT id FROM users WHERE employee_id = ?', [t.assigned_to]) : null;
  const targets = [assignee && assignee.id, t.assigned_by].filter((id) => id && id !== actor.id);
  if (!targets.length) return;
  const title = status === 'done' ? `✅ ${actor.name} completed “${t.title}”`
    : status === 'blocked' ? `⛔ ${actor.name} marked “${t.title}” as blocked`
      : `🔄 ${actor.name} moved “${t.title}” to ${STATUS_LABEL[status] || status}`;
  const body = `${STATUS_LABEL[t.status] || t.status} → ${STATUS_LABEL[status] || status}`;
  await Promise.all(targets.map((id) => notifyUsers([id], {
    title, body, type: 'task', data: { task_id: t.id },
    link: assignee && id === assignee.id ? '/admin/my/tasks' : '/admin/tasks',
  })));
}

// ============================================================ TASKS
router.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const { q, status, priority, project_id, assigned_to, mine, due } = req.query;
    const where = [];
    const params = [];
    if (!isStaffManager(req.user) || mine) {
      if (!req.user.employee_id) return res.json({ data: [], total: 0 });
      where.push('t.assigned_to = ?');
      params.push(req.user.employee_id);
    } else if (assigned_to) {
      where.push('t.assigned_to = ?');
      params.push(assigned_to);
    }
    if (q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (status) { where.push('t.status = ?'); params.push(status); }
    if (priority) { where.push('t.priority = ?'); params.push(priority); }
    if (project_id) { where.push('t.project_id = ?'); params.push(project_id); }
    if (due === 'today') where.push('t.due_date = CURDATE()');
    if (due === 'overdue') where.push("t.due_date < CURDATE() AND t.status <> 'done'");
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(
      `SELECT ${TASK_SELECT} FROM ${TASK_FROM} ${w}
       ORDER BY FIELD(t.status,'in_progress','todo','review','blocked','done'), FIELD(t.priority,'urgent','high','medium','low'), t.due_date IS NULL, t.due_date
       LIMIT 500`,
      params
    );
    res.json({ data, total: data.length });
  })
);

router.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const t = await one(`SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.id = ?`, [req.params.id]);
    if (!t) throw new HttpError(404, 'Task not found');
    if (!isStaffManager(req.user) && t.assigned_to !== req.user.employee_id) throw new HttpError(403, 'Not allowed');
    t.comments = await query(
      'SELECT c.*, u.name AS user_name, u.role FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id',
      [t.id]
    );
    res.json(t);
  })
);

router.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['title', 'description', 'project_id', 'assigned_to', 'priority', 'status', 'start_date', 'due_date', 'progress']);
    if (!data.title) throw new HttpError(400, 'Task title is required');
    if (!isStaffManager(req.user)) {
      if (!req.user.employee_id) throw new HttpError(400, 'Your login is not linked to an employee profile');
      data.assigned_to = req.user.employee_id; // employees can only create their own tasks
    }
    data.assigned_by = req.user.id;
    if (data.status === 'done') data.completed_at = toDateTimeStr(new Date());
    const r = await query('INSERT INTO tasks SET ?', [data]);
    if (data.assigned_to && data.assigned_to !== req.user.employee_id && req.body.notify !== false) notifyAssignee(r.insertId, req.user).catch(() => {});
    res.status(201).json(await one(`SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.id = ?`, [r.insertId]));
  })
);

router.put(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const t = await one('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!t) throw new HttpError(404, 'Task not found');
    const manager = isStaffManager(req.user);
    if (!manager && t.assigned_to !== req.user.employee_id) throw new HttpError(403, 'Not allowed');
    const allowed = manager || t.assigned_by === req.user.id
      ? ['title', 'description', 'project_id', 'assigned_to', 'priority', 'status', 'start_date', 'due_date', 'progress']
      : ['status', 'progress'];
    const data = pick(req.body, allowed);
    if (data.status === 'done' && t.status !== 'done') {
      data.completed_at = toDateTimeStr(new Date());
      data.progress = 100;
    } else if (data.status && data.status !== 'done') data.completed_at = null;
    await query('UPDATE tasks SET ? WHERE id = ?', [data, t.id]);
    if (data.assigned_to && Number(data.assigned_to) !== t.assigned_to) notifyAssignee(t.id, req.user).catch(() => {});
    else fire(notifyTaskStatus(t, data.status, req.user));
    res.json(await one(`SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.id = ?`, [t.id]));
  })
);

router.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const t = await one('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!t) throw new HttpError(404, 'Task not found');
    if (!isStaffManager(req.user) && t.assigned_by !== req.user.id) throw new HttpError(403, 'Not allowed');
    await query('DELETE FROM tasks WHERE id = ?', [t.id]);
    res.json({ message: 'Task deleted' });
  })
);

/** Saves a task comment and notifies the other side (assignee / assigner). Shared with the mobile API. */
async function addTaskComment(t, user, comment) {
  if (!comment || !String(comment).trim()) throw new HttpError(400, 'Comment is required', 'VALIDATION_ERROR');
  const r = await query('INSERT INTO task_comments SET ?', [{ task_id: t.id, user_id: user.id, comment }]);
  const assignee = t.assigned_to ? await one('SELECT id FROM users WHERE employee_id = ?', [t.assigned_to]) : null;
  const targets = [assignee && assignee.id, t.assigned_by].filter((id) => id && id !== user.id);
  // assignee and assigner open different pages
  fire(Promise.all(targets.map((id) => notifyUsers([id], {
    title: `💬 ${user.name} commented on “${t.title}”`, body: String(comment).slice(0, 140), type: 'task', data: { task_id: t.id },
    link: assignee && id === assignee.id ? '/admin/my/tasks' : '/admin/tasks',
  }))));
  return r.insertId;
}

router.post(
  '/tasks/:id/comments',
  asyncHandler(async (req, res) => {
    const t = await one('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!t) throw new HttpError(404, 'Task not found');
    if (!isStaffManager(req.user) && t.assigned_to !== req.user.employee_id) throw new HttpError(403, 'Not allowed');
    await addTaskComment(t, req.user, req.body.comment);
    res.status(201).json({ message: 'Comment added' });
  })
);

// ============================================================ PROJECT OVERVIEW
router.get(
  '/projects/:id/overview',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    const p = await one('SELECT p.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Project not found');
    const isBilling = ['admin', 'accounts'].includes(req.user.role);
    const [tasks, team, members, siteAttendance, contracts, documents, invoices, quotations] = await Promise.all([
      query(`SELECT ${TASK_SELECT} FROM ${TASK_FROM} WHERE t.project_id = ? ORDER BY FIELD(t.status,'in_progress','todo','review','blocked','done'), t.due_date`, [p.id]),
      query('SELECT DISTINCT e.id, e.name, e.photo, e.emp_code FROM tasks t JOIN employees e ON e.id = t.assigned_to WHERE t.project_id = ?', [p.id]),
      projectMembers(p.id),
      query(
        `SELECT a.employee_id, e.name, e.emp_code, a.check_in, a.check_out, a.status, a.source, a.check_in_geofence, a.check_in_distance
         FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE a.project_id = ? AND a.date = CURDATE() ORDER BY a.check_in`,
        [p.id]
      ),
      isBilling ? query('SELECT id, contract_no, title, status, agreement_date, end_date, contract_value FROM contracts WHERE project_id = ? ORDER BY id DESC', [p.id]) : [],
      query('SELECT id, title, category, file, file_name, created_at, expiry_date FROM vault_documents WHERE project_id = ? ORDER BY id DESC', [p.id]),
      isBilling ? query('SELECT id, invoice_no, invoice_date, total, amount_paid, status FROM invoices WHERE project_id = ? ORDER BY id DESC', [p.id]) : [],
      isBilling ? query('SELECT id, quote_no, quote_date, total, status FROM quotations WHERE project_id = ? ORDER BY id DESC', [p.id]) : [],
    ]);
    res.json({ ...p, tasks, team, members, site_attendance: siteAttendance, contracts, documents, invoices, quotations });
  })
);

// ============================================================ PROJECT MEMBERS
// Members can check in at the project's geofence and see the project in the mobile app
function projectMembers(projectId) {
  return query(
    `SELECT m.id, m.employee_id, m.role, m.created_at, e.name, e.emp_code, e.photo, e.phone, g.name AS designation_name
     FROM project_members m JOIN employees e ON e.id = m.employee_id LEFT JOIN designations g ON g.id = e.designation_id
     WHERE m.project_id = ? ORDER BY e.name`,
    [projectId]
  );
}

router.get(
  '/projects/:id/members',
  authorize('hr'),
  asyncHandler(async (req, res) => res.json({ data: await projectMembers(req.params.id) }))
);

router.post(
  '/projects/:id/members',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const p = await one('SELECT id FROM projects WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Project not found');
    const ids = (Array.isArray(req.body.employee_ids) ? req.body.employee_ids : [req.body.employee_id]).map(Number).filter(Boolean);
    if (!ids.length) throw new HttpError(400, 'Choose at least one employee');
    await query('INSERT INTO project_members (project_id, employee_id, role) VALUES ? ON DUPLICATE KEY UPDATE role = COALESCE(VALUES(role), role)', [ids.map((id) => [p.id, id, req.body.role || null])]);
    res.status(201).json({ data: await projectMembers(p.id) });
  })
);

router.delete(
  '/projects/:id/members/:employeeId',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM project_members WHERE project_id = ? AND employee_id = ?', [req.params.id, req.params.employeeId]);
    res.json({ data: await projectMembers(req.params.id) });
  })
);

// ============================================================ DAILY REPORTS
/** Insert or update the employee's report for a day. Shared with the mobile API. */
async function saveDailyReport(empId, body, actorUserId) {
  const data = pick(body, ['report_date', 'work_done', 'hours', 'plan_tomorrow', 'blockers', 'project_id']);
  if (!data.work_done) throw new HttpError(400, 'Please describe the work done', 'VALIDATION_ERROR');
  data.report_date = data.report_date || toDateStr();
  if (data.report_date > toDateStr()) throw new HttpError(400, 'Cannot submit a report for a future date', 'VALIDATION_ERROR');
  const before = await one('SELECT id FROM daily_reports WHERE employee_id = ? AND report_date = ?', [empId, data.report_date]);
  // keep the saved project when the client doesn't send one (the web form has no project field)
  await query(
    `INSERT INTO daily_reports (employee_id, report_date, work_done, hours, plan_tomorrow, blockers, project_id)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE work_done = VALUES(work_done), hours = VALUES(hours), plan_tomorrow = VALUES(plan_tomorrow),
       blockers = VALUES(blockers), ${'project_id' in data ? 'project_id = VALUES(project_id),' : ''} status = 'submitted'`,
    [empId, data.report_date, data.work_done, data.hours || 0, data.plan_tomorrow || null, data.blockers || null, data.project_id || null]
  );
  if ((await getSettings()).notify_daily_reports !== '0') {
    const emp = await one('SELECT name FROM employees WHERE id = ?', [empId]);
    fire(notifyRoles(['hr'], {
      title: `📝 ${before ? 'Daily report updated' : 'Daily report'} – ${emp.name}`,
      body: `${formatDate(data.report_date)}${data.hours ? ` · ${data.hours}h` : ''}${data.blockers ? ' · ⚠️ has blockers' : ''} – ${String(data.work_done).replace(/<[^>]+>/g, ' ').slice(0, 120)}`,
      link: '/admin/reports',
      type: 'report',
    }, { excludeUserId: actorUserId }));
  }
  return one('SELECT * FROM daily_reports WHERE employee_id = ? AND report_date = ?', [empId, data.report_date]);
}

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { date, employee_id, from, to, mine } = req.query;
    const where = [];
    const params = [];
    if (!isStaffManager(req.user) || mine) {
      if (!req.user.employee_id) return res.json({ data: [], total: 0 });
      where.push('r.employee_id = ?');
      params.push(req.user.employee_id);
    } else if (employee_id) {
      where.push('r.employee_id = ?');
      params.push(employee_id);
    }
    if (date) { where.push('r.report_date = ?'); params.push(date); }
    if (from) { where.push('r.report_date >= ?'); params.push(from); }
    if (to) { where.push('r.report_date <= ?'); params.push(to); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(
      `SELECT r.*, e.name AS employee_name, e.emp_code, e.photo, p.name AS project_name FROM daily_reports r JOIN employees e ON e.id = r.employee_id
       LEFT JOIN projects p ON p.id = r.project_id ${w}
       ORDER BY r.report_date DESC, e.name LIMIT 300`,
      params
    );
    res.json({ data, total: data.length });
  })
);

router.post(
  '/reports',
  asyncHandler(async (req, res) => {
    if (!req.user.employee_id) throw new HttpError(400, 'Your login is not linked to an employee profile');
    await saveDailyReport(req.user.employee_id, req.body, req.user.id);
    res.status(201).json({ message: 'Daily report submitted' });
  })
);

router.patch(
  '/reports/:id/review',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const r = await one('SELECT id, employee_id, report_date FROM daily_reports WHERE id = ?', [req.params.id]);
    if (!r) throw new HttpError(404, 'Report not found');
    await query("UPDATE daily_reports SET status = 'reviewed', reviewer_remarks = ? WHERE id = ?", [req.body.remarks || null, r.id]);
    fire(notifyEmployee(r.employee_id, {
      title: `👍 ${req.user.name} reviewed your report for ${formatDate(r.report_date)}`,
      body: req.body.remarks ? String(req.body.remarks).slice(0, 200) : 'No remarks',
      link: '/admin/my/reports',
      type: 'report',
      data: { report_id: r.id },
    }));
    res.json({ message: 'Report reviewed' });
  })
);

// Who has not submitted today's report (for managers)
router.get(
  '/reports-missing',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || toDateStr();
    const data = await query(
      `SELECT e.id, e.name, e.emp_code FROM employees e
       WHERE e.status = 'active' AND NOT EXISTS (SELECT 1 FROM daily_reports r WHERE r.employee_id = e.id AND r.report_date = ?)
       ORDER BY e.name`,
      [date]
    );
    res.json({ data });
  })
);

module.exports = router;
Object.assign(module.exports, { TASK_SELECT, TASK_FROM, notifyAssignee, notifyTaskStatus, addTaskComment, saveDailyReport });
