const express = require('express');
const { query, one } = require('../config/db');
const { authenticate, isStaffManager } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { toDateStr } = require('../utils/helpers');
const { leaveBalance } = require('./hr');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.user.role;
    const out = { role };
    const today = toDateStr();

    if (['admin', 'accounts'].includes(role)) {
      await query("UPDATE invoices SET status = 'overdue' WHERE status = 'unpaid' AND due_date < CURDATE()");
      out.billing = await one(`SELECT
          (SELECT COUNT(*) FROM clients WHERE status = 'active') AS clients,
          (SELECT COALESCE(SUM(amount),0) FROM payments WHERE DATE_FORMAT(payment_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')) AS collected_month,
          (SELECT COALESCE(SUM(total),0) FROM invoices WHERE status <> 'cancelled' AND DATE_FORMAT(invoice_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')) AS billed_month,
          (SELECT COALESCE(SUM(total - amount_paid),0) FROM invoices WHERE status IN ('unpaid','partial','overdue')) AS outstanding,
          (SELECT COUNT(*) FROM invoices WHERE status = 'overdue') AS overdue_count,
          (SELECT COUNT(*) FROM quotations WHERE status IN ('draft','sent')) AS open_quotes,
          (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE DATE_FORMAT(expense_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')) AS expenses_month,
          (SELECT COUNT(*) FROM enquiries WHERE status = 'new') AS new_enquiries,
          (SELECT COUNT(*) FROM client_servers WHERE status = 'active' AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS servers_expiring`);
      out.revenue = await query(`SELECT DATE_FORMAT(m.month,'%b %y') AS label,
          (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE DATE_FORMAT(p.payment_date,'%Y-%m') = DATE_FORMAT(m.month,'%Y-%m')) AS collected,
          (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.status <> 'cancelled' AND DATE_FORMAT(i.invoice_date,'%Y-%m') = DATE_FORMAT(m.month,'%Y-%m')) AS billed,
          (SELECT COALESCE(SUM(amount),0) FROM expenses x WHERE DATE_FORMAT(x.expense_date,'%Y-%m') = DATE_FORMAT(m.month,'%Y-%m')) AS expenses
        FROM (SELECT DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL n MONTH) AS month
              FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) x) m
        ORDER BY m.month`);
      out.invoice_status = await query("SELECT status, COUNT(*) AS count, COALESCE(SUM(total),0) AS amount FROM invoices GROUP BY status");
      out.recent_invoices = await query('SELECT i.id, i.invoice_no, i.total, i.amount_paid, i.status, i.invoice_date, c.name AS client_name FROM invoices i JOIN clients c ON c.id = i.client_id ORDER BY i.id DESC LIMIT 6');
      out.recent_enquiries = await query('SELECT id, name, email, phone, service, status, created_at FROM enquiries ORDER BY id DESC LIMIT 6');
      out.expiring_servers = await query(`SELECT s.id, s.name, s.domain, s.type, s.expiry_date, s.renewal_amount, c.name AS client_name, DATEDIFF(s.expiry_date, CURDATE()) AS days_left
        FROM client_servers s JOIN clients c ON c.id = s.client_id WHERE s.status = 'active' AND s.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY s.expiry_date LIMIT 8`);
    }

    if (isStaffManager(req.user)) {
      out.hr = await one(`SELECT
          (SELECT COUNT(*) FROM employees WHERE status IN ('active','on_notice')) AS employees,
          (SELECT COUNT(*) FROM employees WHERE status = 'active' AND employment_type = 'intern') AS interns,
          (SELECT COUNT(*) FROM attendance WHERE date = ? AND status IN ('present','late','wfh','half_day')) AS present_today,
          (SELECT COUNT(*) FROM attendance WHERE date = ? AND status = 'late') AS late_today,
          (SELECT COUNT(*) FROM attendance WHERE date = ? AND status = 'leave') AS on_leave_today,
          (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending') AS pending_leaves,
          (SELECT COUNT(*) FROM job_openings WHERE status = 'open') AS open_jobs,
          (SELECT COUNT(*) FROM job_applications WHERE stage IN ('applied','shortlisted','interview')) AS active_candidates,
          (SELECT COUNT(*) FROM tasks WHERE status <> 'done') AS open_tasks,
          (SELECT COUNT(*) FROM tasks WHERE status <> 'done' AND due_date < CURDATE()) AS overdue_tasks,
          (SELECT COUNT(*) FROM daily_reports WHERE report_date = ?) AS reports_today`, [today, today, today, today]);
      out.attendance_week = await query(`SELECT DATE_FORMAT(date,'%a %d') AS label,
          SUM(status IN ('present','wfh')) AS present, SUM(status='late') AS late, SUM(status IN ('absent')) AS absent, SUM(status IN ('leave','half_day')) AS on_leave
        FROM attendance WHERE date BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE() GROUP BY date ORDER BY date`);
      out.pending_leaves = await query(`SELECT l.id, l.from_date, l.to_date, l.days, l.reason, e.name AS employee_name, t.name AS leave_type
        FROM leave_requests l JOIN employees e ON e.id = l.employee_id JOIN leave_types t ON t.id = l.leave_type_id WHERE l.status = 'pending' ORDER BY l.id DESC LIMIT 6`);
      out.recent_applications = await query(`SELECT a.id, a.name, a.stage, a.created_at, j.title AS job_title FROM job_applications a LEFT JOIN job_openings j ON j.id = a.job_id ORDER BY a.id DESC LIMIT 6`);
      out.task_status = await query('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status');
      out.birthdays = await query(`SELECT id, name, dob FROM employees WHERE status = 'active' AND dob IS NOT NULL
        AND DATE_FORMAT(dob,'%m-%d') BETWEEN DATE_FORMAT(CURDATE(),'%m-%d') AND DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 15 DAY),'%m-%d') ORDER BY DATE_FORMAT(dob,'%m-%d')`);
    }

    if (req.user.employee_id) {
      const empId = req.user.employee_id;
      out.me = {
        today: await one('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [empId, today]),
        month: await one(`SELECT SUM(status IN ('present','late','wfh')) present, SUM(status='late') late, SUM(status='half_day') half_day,
            SUM(status='absent') absent, SUM(status='leave') on_leave, COALESCE(SUM(work_minutes),0) minutes
          FROM attendance WHERE employee_id = ? AND DATE_FORMAT(date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')`, [empId]),
        tasks: await one(`SELECT SUM(status <> 'done') open, SUM(status = 'done') done, SUM(status <> 'done' AND due_date < CURDATE()) overdue,
            SUM(status <> 'done' AND due_date = CURDATE()) due_today FROM tasks WHERE assigned_to = ?`, [empId]),
        my_tasks: await query(`SELECT t.id, t.title, t.priority, t.status, t.due_date, t.progress, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.assigned_to = ? AND t.status <> 'done' ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.due_date IS NULL, t.due_date LIMIT 6`, [empId]),
        report_today: await one('SELECT id FROM daily_reports WHERE employee_id = ? AND report_date = ?', [empId, today]),
        leave_balance: await leaveBalance(empId),
      };
    }
    out.announcements = await query("SELECT * FROM announcements WHERE status = 'active' ORDER BY priority = 'important' DESC, id DESC LIMIT 5");
    out.holidays = await query('SELECT * FROM holidays WHERE date >= CURDATE() ORDER BY date LIMIT 5');
    res.json(out);
  })
);

module.exports = router;
