const express = require('express');
const { query, one } = require('../config/db');
const { authenticate, authorize, isStaffManager } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { pick, toDateStr, toDateTimeStr, formatDate } = require('../utils/helpers');
const { sendEmail } = require('../services/notify');
const { getSettings } = require('../utils/settings');

const router = express.Router();
router.use(authenticate);

const TASK_SELECT = `t.*, e.name AS assignee_name, e.emp_code AS assignee_code, e.photo AS assignee_photo,
  p.name AS project_name, u.name AS assigned_by_name,
  (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count`;
const TASK_FROM = `tasks t LEFT JOIN employees e ON e.id = t.assigned_to
  LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assigned_by`;

async function notifyAssignee(taskId, actor) {
  const t = await one(`SELECT ${TASK_SELECT}, e.email AS assignee_email FROM ${TASK_FROM} WHERE t.id = ?`, [taskId]);
  if (!t || !t.assignee_email) return;
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

router.post(
  '/tasks/:id/comments',
  asyncHandler(async (req, res) => {
    const t = await one('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!t) throw new HttpError(404, 'Task not found');
    if (!isStaffManager(req.user) && t.assigned_to !== req.user.employee_id) throw new HttpError(403, 'Not allowed');
    if (!req.body.comment) throw new HttpError(400, 'Comment is required');
    await query('INSERT INTO task_comments SET ?', [{ task_id: t.id, user_id: req.user.id, comment: req.body.comment }]);
    res.status(201).json({ message: 'Comment added' });
  })
);

// ============================================================ DAILY REPORTS
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
      `SELECT r.*, e.name AS employee_name, e.emp_code, e.photo FROM daily_reports r JOIN employees e ON e.id = r.employee_id ${w}
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
    const data = pick(req.body, ['report_date', 'work_done', 'hours', 'plan_tomorrow', 'blockers']);
    if (!data.work_done) throw new HttpError(400, 'Please describe the work done');
    data.report_date = data.report_date || toDateStr();
    if (data.report_date > toDateStr()) throw new HttpError(400, 'Cannot submit a report for a future date');
    await query(
      `INSERT INTO daily_reports (employee_id, report_date, work_done, hours, plan_tomorrow, blockers)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE work_done = VALUES(work_done), hours = VALUES(hours), plan_tomorrow = VALUES(plan_tomorrow),
         blockers = VALUES(blockers), status = 'submitted'`,
      [req.user.employee_id, data.report_date, data.work_done, data.hours || 0, data.plan_tomorrow || null, data.blockers || null]
    );
    res.status(201).json({ message: 'Daily report submitted' });
  })
);

router.patch(
  '/reports/:id/review',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    await query("UPDATE daily_reports SET status = 'reviewed', reviewer_remarks = ? WHERE id = ?", [req.body.remarks || null, req.params.id]);
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
