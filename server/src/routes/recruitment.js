const express = require('express');
const { query, one, transaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { pick, toDateStr, formatDate, formatMoney, renderTemplate } = require('../utils/helpers');
const { nextNumber } = require('../utils/numbering');
const { getSettings } = require('../utils/settings');
const { sendEmail, sendWhatsApp, sendSMS } = require('../services/notify');
const { notifyEmployee, fire } = require('../services/push');

const router = express.Router();
router.use(authenticate);

// ============================================================ APPLICATIONS
router.get(
  '/applications',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const { q, stage, job_id } = req.query;
    const where = [];
    const params = [];
    if (q) { where.push('(a.name LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR a.college LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
    if (stage) { where.push('a.stage = ?'); params.push(stage); }
    if (job_id) { where.push('a.job_id = ?'); params.push(job_id); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(
      `SELECT a.*, j.title AS job_title, j.job_type FROM job_applications a LEFT JOIN job_openings j ON j.id = a.job_id ${w} ORDER BY a.id DESC LIMIT 500`,
      params
    );
    const stages = await query('SELECT stage, COUNT(*) AS count FROM job_applications GROUP BY stage');
    res.json({ data, total: data.length, stages });
  })
);

router.get(
  '/applications/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const a = await one('SELECT a.*, j.title AS job_title, j.job_type, j.department FROM job_applications a LEFT JOIN job_openings j ON j.id = a.job_id WHERE a.id = ?', [req.params.id]);
    if (!a) throw new HttpError(404, 'Application not found');
    a.letters = await query('SELECT id, letter_no, title, type, issue_date, status FROM letters WHERE application_id = ? ORDER BY id DESC', [a.id]);
    res.json(a);
  })
);

router.post(
  '/applications',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['job_id', 'name', 'email', 'phone', 'city', 'qualification', 'college', 'experience', 'current_ctc', 'expected_ctc', 'notice_period', 'resume', 'portfolio_url', 'cover_letter', 'stage', 'notes']);
    if (!data.name || !data.email) throw new HttpError(400, 'Name and email are required');
    const r = await query('INSERT INTO job_applications SET ?', [data]);
    res.status(201).json({ id: r.insertId });
  })
);

router.put(
  '/applications/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['job_id', 'name', 'email', 'phone', 'city', 'qualification', 'college', 'experience', 'current_ctc', 'expected_ctc', 'notice_period', 'resume', 'portfolio_url', 'cover_letter', 'stage', 'interview_at', 'interview_mode', 'interview_link', 'rating', 'notes']);
    await query('UPDATE job_applications SET ? WHERE id = ?', [data, req.params.id]);
    res.json(await one('SELECT * FROM job_applications WHERE id = ?', [req.params.id]));
  })
);

router.delete(
  '/applications/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM job_applications WHERE id = ?', [req.params.id]);
    res.json({ message: 'Application deleted' });
  })
);

// Notify candidate about their stage (interview invite, shortlist, rejection...)
router.post(
  '/applications/:id/notify',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const a = await one('SELECT a.*, j.title AS job_title FROM job_applications a LEFT JOIN job_openings j ON j.id = a.job_id WHERE a.id = ?', [req.params.id]);
    if (!a) throw new HttpError(404, 'Application not found');
    const s = await getSettings();
    const company = s.company_name || 'YJTechnosoft';
    const role = a.job_title || 'the applied position';
    const when = a.interview_at ? new Date(a.interview_at.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) : '';
    const mode = { in_person: `In-person at ${s.address || 'our office'}`, phone: 'Telephonic', video: `Video call${a.interview_link ? `: ${a.interview_link}` : ''}` }[a.interview_mode] || '';
    const defaults = {
      shortlisted: `Dear ${a.name}, congratulations! Your application for ${role} at ${company} has been shortlisted. Our team will contact you shortly for the next steps.`,
      interview: `Dear ${a.name}, you are invited for an interview for ${role} at ${company}${when ? ` on ${when}` : ''}${mode ? ` (${mode})` : ''}. Please confirm your availability.`,
      selected: `Dear ${a.name}, we are delighted to inform you that you have been selected for ${role} at ${company}. Your offer letter will be shared shortly.`,
      rejected: `Dear ${a.name}, thank you for your interest in ${role} at ${company}. After careful consideration we will not be moving forward at this time. We wish you the very best.`,
      applied: `Dear ${a.name}, thank you for applying for ${role} at ${company}. We have received your application.`,
    };
    const message = req.body.message || defaults[a.stage] || defaults.applied;
    const channels = req.body.channels || ['email'];
    const results = {};
    if (channels.includes('email')) results.email = await sendEmail({ to: a.email, subject: req.body.subject || `Your application for ${role} – ${company}`, html: `<p>${message.replace(/\n/g, '<br>')}</p>`, refType: 'application', refId: a.id, userId: req.user.id });
    if (channels.includes('whatsapp')) results.whatsapp = await sendWhatsApp({ to: a.phone, message, refType: 'application', refId: a.id, userId: req.user.id });
    if (channels.includes('sms')) results.sms = await sendSMS({ to: a.phone, message, refType: 'application', refId: a.id, userId: req.user.id });
    res.json({ results, message });
  })
);

// Convert a selected candidate into an employee / intern
router.post(
  '/applications/:id/hire',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const a = await one('SELECT a.*, j.job_type FROM job_applications a LEFT JOIN job_openings j ON j.id = a.job_id WHERE a.id = ?', [req.params.id]);
    if (!a) throw new HttpError(404, 'Application not found');
    if (a.employee_id) throw new HttpError(400, 'Candidate is already added as an employee');
    const s = await getSettings();
    const empId = await transaction(async (q) => {
      const prefix = s.emp_code_prefix || 'YJT';
      const last = (await q('SELECT emp_code FROM employees WHERE emp_code LIKE ? ORDER BY LENGTH(emp_code) DESC, emp_code DESC LIMIT 1', [`${prefix}%`]))[0];
      const n = last ? (parseInt(last.emp_code.slice(prefix.length), 10) || 0) + 1 : 1;
      const r = await q('INSERT INTO employees SET ?', [
        {
          emp_code: `${prefix}${String(n).padStart(3, '0')}`,
          name: a.name,
          email: a.email,
          phone: a.phone,
          address: a.city,
          department_id: req.body.department_id || null,
          designation_id: req.body.designation_id || null,
          employment_type: req.body.employment_type || (a.job_type === 'internship' ? 'intern' : 'full_time'),
          joining_date: req.body.joining_date || toDateStr(),
          salary: req.body.salary || 0,
          status: 'active',
        },
      ]);
      await q("UPDATE job_applications SET stage = 'hired', employee_id = ? WHERE id = ?", [r.insertId, a.id]);
      await q('UPDATE letters SET employee_id = ? WHERE application_id = ?', [r.insertId, a.id]);
      return r.insertId;
    });
    res.json({ employee_id: empId, message: 'Candidate added as employee' });
  })
);

// ============================================================ LETTERS
const to12h = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

async function placeholderData({ employee_id, application_id }) {
  const s = await getSettings();
  const base = {
    company: s.company_name || 'YJTECHNOSOFT PRIVATE LIMITED',
    company_address: s.address || '',
    company_email: s.email || '',
    company_phone: s.phone || '',
    company_website: s.site_url || '',
    signatory: s.signatory_name || 'Authorised Signatory',
    signatory_designation: s.signatory_designation || '',
    issue_date: formatDate(toDateStr(), 'long'),
    working_hours: `${to12h(s.office_start_time || '10:00')} to ${to12h(s.office_end_time || '18:00')}`,
    location: s.city || 'Kawardha, Chhattisgarh',
  };
  if (employee_id) {
    const e = await one(
      `SELECT e.*, d.name AS department, g.name AS designation, r.name AS reporting_to_name
       FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN designations g ON g.id = e.designation_id
       LEFT JOIN employees r ON r.id = e.reporting_to WHERE e.id = ?`,
      [employee_id]
    );
    if (e) {
      Object.assign(base, {
        name: e.name,
        first_name: e.name.split(' ')[0],
        email: e.email,
        phone: e.phone,
        address: e.address,
        father_name: e.father_name,
        emp_code: e.emp_code,
        designation: e.designation,
        department: e.department,
        reporting_to: e.reporting_to_name,
        joining_date: formatDate(e.joining_date, 'long'),
        start_date: formatDate(e.joining_date, 'long'),
        last_working_day: formatDate(e.exit_date, 'long'),
        salary: e.salary ? formatMoney(e.salary, 0) : '',
        ctc: e.salary ? formatMoney(e.salary * 12, 0) : '',
        stipend: e.salary ? formatMoney(e.salary, 0) : '',
        salutation: e.gender === 'female' ? 'Ms.' : 'Mr.',
        pronoun: e.gender === 'female' ? 'She' : e.gender === 'male' ? 'He' : 'They',
        pronoun_his: e.gender === 'female' ? 'her' : e.gender === 'male' ? 'his' : 'their',
      });
    }
  } else if (application_id) {
    const a = await one('SELECT a.*, j.title AS job_title, j.department, j.location FROM job_applications a LEFT JOIN job_openings j ON j.id = a.job_id WHERE a.id = ?', [application_id]);
    if (a) {
      Object.assign(base, {
        name: a.name,
        first_name: a.name.split(' ')[0],
        email: a.email,
        phone: a.phone,
        address: a.city,
        college: a.college,
        qualification: a.qualification,
        designation: a.job_title,
        department: a.department,
        location: a.location || base.location,
        salutation: 'Mr./Ms.',
      });
    }
  }
  return base;
}

router.get(
  '/letters/placeholders',
  authorize('hr'),
  asyncHandler(async (req, res) => res.json(await placeholderData(req.query)))
);

router.get(
  '/letters',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (!['admin', 'hr'].includes(req.user.role) || req.query.mine) {
      if (!req.user.employee_id) return res.json({ data: [], total: 0 });
      where.push("l.employee_id = ? AND l.status <> 'draft'");
      params.push(req.user.employee_id);
    } else {
      if (req.query.q) { where.push('(l.recipient_name LIKE ? OR l.letter_no LIKE ? OR l.title LIKE ?)'); params.push(...Array(3).fill(`%${req.query.q}%`)); }
      if (req.query.type) { where.push('l.type = ?'); params.push(req.query.type); }
      if (req.query.employee_id) { where.push('l.employee_id = ?'); params.push(req.query.employee_id); }
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const data = await query(`SELECT l.id, l.letter_no, l.type, l.title, l.recipient_name, l.recipient_email, l.recipient_phone, l.employee_id, l.application_id, l.issue_date, l.status, l.created_at FROM letters l ${w} ORDER BY l.id DESC LIMIT 500`, params);
    res.json({ data, total: data.length });
  })
);

router.get(
  '/letters/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const l = await one('SELECT * FROM letters WHERE id = ?', [req.params.id]);
    if (!l) throw new HttpError(404, 'Letter not found');
    l.data = l.data ? JSON.parse(l.data) : {};
    res.json(l);
  })
);

// Render a template with data (preview, no save)
router.post(
  '/letters/render',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const tpl = req.body.template_id ? await one('SELECT * FROM letter_templates WHERE id = ?', [req.body.template_id]) : null;
    const base = await placeholderData(req.body);
    const data = { ...base, ...(req.body.data || {}) };
    const bodySrc = req.body.body || (tpl && tpl.body) || '';
    res.json({
      title: renderTemplate(req.body.title || (tpl && tpl.title) || '', data),
      subject: renderTemplate(req.body.subject ?? (tpl && tpl.subject) ?? '', data),
      body: renderTemplate(bodySrc, data),
      data,
    });
  })
);

/** Letters show up in the employee's "My letters" once they leave draft – tell them */
function notifyLetter(before, after) {
  if (!after.employee_id || ['draft', 'revoked'].includes(after.status)) return;
  if (before && Number(before.employee_id) === Number(after.employee_id) && !['draft', 'revoked'].includes(before.status)) return;
  fire(notifyEmployee(after.employee_id, { title: `📄 New letter: ${after.title}`, body: 'Open My letters to view or download it.', link: '/admin/my/letters', type: 'letter', data: { letter_id: after.id } }));
}

async function saveLetter(req, id) {
  const b = req.body;
  if (!b.recipient_name || !b.body || !b.title) throw new HttpError(400, 'Recipient, title and letter body are required');
  const row = {
    template_id: b.template_id || null,
    type: b.type || 'custom',
    title: b.title,
    recipient_name: b.recipient_name,
    recipient_email: b.recipient_email || null,
    recipient_phone: b.recipient_phone || null,
    recipient_address: b.recipient_address || null,
    employee_id: b.employee_id || null,
    application_id: b.application_id || null,
    data: JSON.stringify({ ...(b.data || {}), subject: b.subject || '' }),
    body: b.body,
    issue_date: b.issue_date || toDateStr(),
    status: b.status || 'issued',
  };
  if (id) {
    if (b.letter_no) row.letter_no = b.letter_no;
    const before = await one('SELECT employee_id, status FROM letters WHERE id = ?', [id]);
    await query('UPDATE letters SET ? WHERE id = ?', [row, id]);
    notifyLetter(before, { ...row, id });
    return id;
  }
  row.letter_no = b.letter_no || (await nextNumber('letter', new Date(row.issue_date)));
  row.created_by = req.user.id;
  const r = await query('INSERT INTO letters SET ?', [row]);
  if (row.application_id && ['offer', 'internship_offer'].includes(row.type)) {
    await query("UPDATE job_applications SET stage = 'offered' WHERE id = ? AND stage NOT IN ('hired')", [row.application_id]);
  }
  notifyLetter(null, { ...row, id: r.insertId });
  return r.insertId;
}

router.post('/letters', authorize('hr'), asyncHandler(async (req, res) => res.status(201).json({ id: await saveLetter(req) })));
router.put('/letters/:id', authorize('hr'), asyncHandler(async (req, res) => res.json({ id: await saveLetter(req, req.params.id) })));

router.patch(
  '/letters/:id/status',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    if (!['draft', 'issued', 'sent', 'accepted', 'revoked'].includes(req.body.status)) throw new HttpError(400, 'Invalid status');
    const before = await one('SELECT id, employee_id, status, title FROM letters WHERE id = ?', [req.params.id]);
    if (!before) throw new HttpError(404, 'Letter not found');
    await query('UPDATE letters SET status = ? WHERE id = ?', [req.body.status, before.id]);
    notifyLetter(before, { ...before, status: req.body.status });
    res.json({ message: 'Status updated' });
  })
);

router.delete(
  '/letters/:id',
  authorize('hr'),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM letters WHERE id = ?', [req.params.id]);
    res.json({ message: 'Letter deleted' });
  })
);

module.exports = router;
