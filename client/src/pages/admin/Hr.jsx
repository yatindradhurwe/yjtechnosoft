import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, UserCog, Pencil, Mail, Phone, CalendarCheck, CalendarOff, Banknote, FileSignature, FileText, Trash2, Check, X, Download, Send, Eye, ArrowLeft, Save, KeyRound, UserCheck, Clock, Upload } from 'lucide-react';
import api, { errMsg, openPdf } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { cn, fmtDate, fmtTime, minutesToHours, money, MONTHS, titleCase, today, waLink, asset } from '../../lib/utils';
import { PageHeader, SearchInput, StatusBadge, Spinner, Modal, Field, FormField, Avatar, Tabs, PageLoader, StatCard, useConfirm, EmptyState, FileUpload } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';
import SendDialog from '../../components/ui/SendDialog';

/* ====================================================================== Employees */
const EMP_FIELDS = (opts) => [
  { name: 'name', label: 'Full name', required: true },
  { name: 'emp_code', label: 'Employee code', hint: 'Auto-generated if empty' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Mobile' },
  { name: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'other'] },
  { name: 'dob', label: 'Date of birth', type: 'date' },
  { name: 'father_name', label: "Father's name" },
  { name: 'emergency_contact', label: 'Emergency contact' },
  { name: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
  { name: 'department_id', label: 'Department', type: 'select', options: opts.departments },
  { name: 'designation_id', label: 'Designation', type: 'select', options: opts.designations },
  { name: 'employment_type', label: 'Employment type', type: 'select', options: ['full_time', 'part_time', 'intern', 'contract'], noEmpty: true },
  { name: 'reporting_to', label: 'Reporting to', type: 'select', options: opts.employees },
  { name: 'joining_date', label: 'Joining date', type: 'date' },
  { name: 'probation_end', label: 'Probation ends', type: 'date' },
  { name: 'salary', label: 'Monthly salary / stipend (₹)', type: 'number' },
  { name: 'status', label: 'Status', type: 'select', options: ['active', 'on_notice', 'resigned', 'terminated'], noEmpty: true },
  { name: 'shift_start', label: 'Shift start', type: 'time' },
  { name: 'shift_end', label: 'Shift end', type: 'time' },
  { name: 'exit_date', label: 'Last working day', type: 'date' },
  { name: 'photo', label: 'Photo', type: 'image', folder: 'avatars', aspect: 'aspect-square' },
  { name: 'bank_name', label: 'Bank name' },
  { name: 'account_no', label: 'Account number' },
  { name: 'ifsc', label: 'IFSC' },
  { name: 'pan', label: 'PAN' },
  { name: 'aadhaar', label: 'Aadhaar' },
];

function useHrOptions() {
  const { data: d } = useFetch('/admin/departments', { all: 1 });
  const { data: g } = useFetch('/admin/designations', { all: 1 });
  const { data: e } = useFetch('/hr/employees', { all: 1, status: 'active' });
  return useMemo(
    () => ({
      departments: (d?.data || []).map((x) => ({ value: x.id, label: x.name })),
      designations: (g?.data || []).map((x) => ({ value: x.id, label: x.department_name ? `${x.name} (${x.department_name})` : x.name })),
      employees: (e?.data || []).map((x) => ({ value: x.id, label: `${x.name} (${x.emp_code})` })),
    }),
    [d, g, e]
  );
}

export function EmployeeModal({ open, onClose, employee, onSaved }) {
  const opts = useHrOptions();
  const [form, setForm] = useState({});
  const [login, setLogin] = useState({ create_login: false, password: '', login_role: 'employee', send_welcome: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (employee) {
      const f = {};
      EMP_FIELDS({}).forEach((fl) => {
        let v = employee[fl.name];
        if (fl.type === 'date' && v) v = String(v).slice(0, 10);
        if (fl.type === 'time' && v) v = String(v).slice(0, 5);
        f[fl.name] = v ?? '';
      });
      setForm(f);
      setLogin({ create_login: false, password: '', login_role: employee.user_role || 'employee', send_welcome: false });
    } else {
      setForm({ employment_type: 'full_time', status: 'active', joining_date: today(), shift_start: '10:00', shift_end: '18:00' });
      setLogin({ create_login: true, password: `Yj@${Math.floor(1000 + Math.random() * 9000)}`, login_role: 'employee', send_welcome: true });
    }
  }, [open, employee]);

  const save = async () => {
    if (!form.name) return toast.error('Name is required');
    if (login.create_login && !form.email) return toast.error('Email is required to create a login');
    setSaving(true);
    try {
      const body = { ...form, ...(login.create_login ? login : {}) };
      const { data } = employee ? await api.put(`/hr/employees/${employee.id}`, body) : await api.post('/hr/employees', body);
      toast.success(employee ? 'Employee updated' : 'Employee added');
      onSaved?.(data);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${employee.name}` : 'Add employee / intern'}
      size="max-w-4xl"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving && <Spinner className="h-4 w-4 text-white" />} Save</button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EMP_FIELDS(opts).map((f) => (
          <FormField key={f.name} field={{ ...f, span: f.span === 2 ? 2 : undefined }} value={form[f.name]} onChange={(k, v) => setForm((s) => ({ ...s, [k]: v }))} />
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/50 p-5">
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={login.create_login} onChange={(e) => setLogin({ ...login, create_login: e.target.checked })} />
          <KeyRound className="h-4 w-4 text-brand-600" />
          {employee?.user_id ? 'Update portal login (reset password)' : 'Create employee portal login'}
        </label>
        {login.create_login && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Password"><input className="input" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></Field>
            <Field label="Portal role">
              <select className="input" value={login.login_role} onChange={(e) => setLogin({ ...login, login_role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="hr">HR Manager</option>
                <option value="accounts">Accounts</option>
              </select>
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={login.send_welcome} onChange={(e) => setLogin({ ...login, send_welcome: e.target.checked })} /> Email login details
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function Employees() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [type, setType] = useState('');
  const { data, loading, reload } = useFetch('/hr/employees', { q, status, employment_type: type });
  const [modal, setModal] = useState(false);
  return (
    <div>
      <PageHeader title="Employees & Interns" subtitle="Manage your team, logins and employee records" icon={UserCog} actions={<button className="btn-primary" onClick={() => setModal(true)}><Plus className="h-4 w-4" /> Add employee</button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput className="lg:w-72" value={q} onChange={setQ} placeholder="Search name, code, phone…" />
        <Tabs tabs={[{ value: 'active', label: 'Active' }, { value: 'on_notice', label: 'On notice' }, { value: 'resigned', label: 'Resigned' }, { value: 'terminated', label: 'Terminated' }, { value: '', label: 'All' }]} value={status} onChange={setStatus} />
        <select className="input lg:w-44" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {['full_time', 'part_time', 'intern', 'contract'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
        </select>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={(r) => navigate(`/admin/employees/${r.id}`)}
        columns={[
          { key: 'name', label: 'Employee', render: (r) => <div className="flex items-center gap-3"><Avatar src={r.photo} name={r.name} /><div><p className="font-medium text-navy-900">{r.name}</p><p className="text-xs text-slate-500">{r.emp_code}</p></div></div> },
          { key: 'designation_name', label: 'Designation', render: (r) => <div><p>{r.designation_name || '—'}</p><p className="text-xs text-slate-500">{r.department_name}</p></div> },
          { key: 'employment_type', label: 'Type', render: (r) => <span className={cn('badge', r.employment_type === 'intern' ? 'bg-accent-500/20 text-accent-600' : 'bg-slate-100 text-slate-600')}>{titleCase(r.employment_type)}</span> },
          { key: 'phone', label: 'Contact', render: (r) => <div className="text-xs"><p>{r.phone}</p><p className="text-slate-500">{r.email}</p></div> },
          { key: 'joining_date', label: 'Joined', render: (r) => fmtDate(r.joining_date) },
          { key: 'user_id', label: 'Login', render: (r) => (r.user_id ? <span className="badge bg-emerald-50 text-emerald-700">{titleCase(r.user_role)}</span> : <span className="text-xs text-slate-400">No login</span>) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        empty={<EmptyState title="No employees found" action={<button className="btn-primary" onClick={() => setModal(true)}><Plus className="h-4 w-4" /> Add employee</button>} />}
      />
      <EmployeeModal open={modal} onClose={() => setModal(false)} onSaved={(e) => { reload(); navigate(`/admin/employees/${e.id}`); }} />
    </div>
  );
}

export function EmployeeView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: e, loading, reload } = useFetch(`/hr/employees/${id}`);
  const [tab, setTab] = useState('overview');
  const [edit, setEdit] = useState(false);
  const [doc, setDoc] = useState(null);
  const month = today().slice(0, 7);
  const { data: att } = useFetch(tab === 'attendance' ? '/hr/attendance/my' : null, { employee_id: id, month }, { skip: tab !== 'attendance' });
  const { data: leaves } = useFetch(tab === 'leaves' ? '/hr/leaves' : null, { employee_id: id }, { skip: tab !== 'leaves' });
  const { data: slips } = useFetch(tab === 'payslips' ? '/hr/payslips' : null, { employee_id: id }, { skip: tab !== 'payslips' });
  if (loading || !e) return <PageLoader />;

  const del = async () => {
    if (!(await confirm({ text: `Delete ${e.name}? Attendance, leaves and payslips of this employee will also be deleted.` }))) return;
    await api.delete(`/hr/employees/${id}`);
    toast.success('Employee deleted');
    navigate('/admin/employees');
  };
  const addDoc = async () => {
    try {
      await api.post('/admin/employee_documents', { ...doc, employee_id: id });
      setDoc(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const delDoc = async (d) => {
    if (!(await confirm({ text: `Delete document "${d.title}"?` }))) return;
    await api.delete(`/admin/employee_documents/${d.id}`);
    reload();
  };

  const info = [
    ['Employee code', e.emp_code], ['Department', e.department_name], ['Designation', e.designation_name], ['Type', titleCase(e.employment_type)],
    ['Joining date', fmtDate(e.joining_date)], ['Probation ends', fmtDate(e.probation_end)], ['Reporting to', e.reporting_name], ['Shift', `${String(e.shift_start || '').slice(0, 5)} – ${String(e.shift_end || '').slice(0, 5)}`],
    ['Salary', money(e.salary, 0)], ['Date of birth', fmtDate(e.dob)], ['Gender', titleCase(e.gender || '')], ["Father's name", e.father_name],
    ['Bank', e.bank_name], ['Account no', e.account_no], ['IFSC', e.ifsc], ['PAN', e.pan], ['Aadhaar', e.aadhaar], ['Emergency contact', e.emergency_contact], ['Address', e.address], ['Portal login', e.login_email || 'Not created'],
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/employees" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Employees</Link>
      <div className="card mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-navy-900 via-brand-700 to-brand-500" />
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-10 flex items-end gap-4">
            <Avatar src={e.photo} name={e.name} size="h-24 w-24" className="border-4 border-white text-2xl shadow-lg" />
            <div className="pb-1">
              <h1 className="text-2xl font-bold">{e.name}</h1>
              <p className="text-sm text-slate-500">{e.designation_name || titleCase(e.employment_type)} · {e.emp_code}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={e.status} className="self-center" />
            {e.phone && <a href={waLink(e.phone)} target="_blank" rel="noreferrer" className="btn-outline btn-sm"><Phone className="h-4 w-4" /> WhatsApp</a>}
            {e.email && <a href={`mailto:${e.email}`} className="btn-outline btn-sm"><Mail className="h-4 w-4" /> Email</a>}
            <Link to={`/admin/letters/new?employee=${e.id}`} className="btn-outline btn-sm"><FileSignature className="h-4 w-4" /> Issue letter</Link>
            <button className="btn-primary btn-sm" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</button>
            <button className="btn-sm btn text-red-600 hover:bg-red-50" onClick={del}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Present (this month)" value={e.attendance_summary?.present || 0} icon={UserCheck} tone="green" />
        <StatCard label="Late" value={e.attendance_summary?.late || 0} icon={Clock} tone="amber" />
        <StatCard label="On leave" value={e.attendance_summary?.on_leave || 0} icon={CalendarOff} tone="violet" />
        <StatCard label="Absent" value={e.attendance_summary?.absent || 0} icon={X} tone="red" />
      </div>
      <Tabs className="mb-6 w-fit" tabs={['overview', 'attendance', 'leaves', 'payslips', 'letters', 'documents']} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2 lg:col-span-2">
            {info.map(([k, v]) => (
              <div key={k} className={k === 'Address' ? 'sm:col-span-2' : ''}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</p>
                <p className="mt-0.5 text-sm font-medium text-navy-900">{v || '—'}</p>
              </div>
            ))}
          </div>
          <div className="card p-6">
            <h3 className="mb-4 font-semibold">Leave balance ({new Date().getFullYear()})</h3>
            <div className="space-y-3">
              {e.leave_balance.map((l) => (
                <div key={l.id}>
                  <div className="flex justify-between text-sm"><span>{l.name}</span><span className="font-semibold">{Number(l.is_paid) ? `${l.remaining} / ${Number(l.days_per_year)}` : `${l.used} taken`}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, (l.used / l.days_per_year) * 100)}%`, background: l.color }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab === 'attendance' && <AttendanceCalendar rows={att?.data} holidays={att?.holidays} month={month} />}
      {tab === 'leaves' && (
        <DataTable rows={leaves?.data} loading={!leaves} columns={[{ key: 'leave_type', label: 'Type' }, { key: 'from', label: 'Dates', render: (r) => `${fmtDate(r.from_date)} – ${fmtDate(r.to_date)}` }, { key: 'days', label: 'Days' }, { key: 'reason', label: 'Reason', render: (r) => <span className="whitespace-normal">{r.reason}</span> }, { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />
      )}
      {tab === 'payslips' && (
        <DataTable rows={slips?.data} loading={!slips} columns={[{ key: 'm', label: 'Month', render: (r) => `${MONTHS[r.month - 1]} ${r.year}` }, { key: 'paid_days', label: 'Paid days' }, { key: 'net_pay', label: 'Net pay', render: (r) => <b>{money(r.net_pay)}</b> }, { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'a', label: '', render: (r) => <button className="btn-ghost btn-sm" onClick={() => openPdf('payslip', r.id)}><Eye className="h-4 w-4" /> View</button> }]} />
      )}
      {tab === 'letters' && (
        <DataTable rows={e.letters} columns={[{ key: 'letter_no', label: 'Ref' }, { key: 'title', label: 'Letter' }, { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) }, { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'a', label: '', render: (r) => <button className="btn-ghost btn-sm" onClick={() => openPdf('letter', r.id)}><Eye className="h-4 w-4" /> View</button> }]} empty={<EmptyState title="No letters issued" action={<Link to={`/admin/letters/new?employee=${e.id}`} className="btn-primary">Issue letter</Link>} />} />
      )}
      {tab === 'documents' && (
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Documents</h3>
            <button className="btn-primary btn-sm" onClick={() => setDoc({ title: '', file: '' })}><Upload className="h-4 w-4" /> Upload</button>
          </div>
          {e.documents.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {e.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <a href={asset(d.file)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline"><FileText className="h-5 w-5" /> {d.title}</a>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:text-red-600" onClick={() => delDoc(d)}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No documents uploaded (Aadhaar, PAN, certificates, resume…).</p>
          )}
        </div>
      )}
      <EmployeeModal open={edit} onClose={() => setEdit(false)} employee={e} onSaved={reload} />
      <Modal open={!!doc} onClose={() => setDoc(null)} title="Upload document" size="max-w-md" footer={<><button className="btn-outline" onClick={() => setDoc(null)}>Cancel</button><button className="btn-primary" disabled={!doc?.title || !doc?.file} onClick={addDoc}>Save</button></>}>
        {doc && (
          <div className="space-y-4">
            <Field label="Document name"><input className="input" value={doc.title} onChange={(ev) => setDoc({ ...doc, title: ev.target.value })} placeholder="Aadhaar card" /></Field>
            <Field label="File"><FileUpload value={doc.file} onChange={(v) => setDoc({ ...doc, file: v })} folder="documents" /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ====================================================================== Attendance calendar (shared) */
const DAY_COLORS = { present: 'bg-emerald-500', late: 'bg-amber-500', half_day: 'bg-orange-400', absent: 'bg-red-500', leave: 'bg-violet-500', wfh: 'bg-sky-500', holiday: 'bg-pink-400' };

export function AttendanceCalendar({ rows = [], holidays = [], month }) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();
  const byDay = {};
  (rows || []).forEach((r) => (byDay[Number(String(r.date).slice(8, 10))] = r));
  const hol = {};
  (holidays || []).forEach((h) => (hol[Number(String(h.date).slice(8, 10))] = h.title));
  return (
    <div className="card p-6">
      <div className="mb-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-slate-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const r = byDay[d];
          const status = r?.status || (hol[d] ? 'holiday' : null);
          const isSun = new Date(y, m - 1, d).getDay() === 0;
          return (
            <div key={d} title={hol[d] || r?.notes || ''} className={cn('min-h-[70px] rounded-xl border p-2 text-left', status ? 'border-transparent bg-slate-50' : isSun ? 'border-dashed border-slate-200 bg-slate-50/50' : 'border-slate-100')}>
              <div className="flex items-center justify-between">
                <span className={cn('text-sm font-semibold', isSun ? 'text-red-400' : 'text-slate-700')}>{d}</span>
                {status && <span className={cn('h-2.5 w-2.5 rounded-full', DAY_COLORS[status])} />}
              </div>
              {status && <p className="mt-1 truncate text-[11px] font-medium text-slate-600">{hol[d] && !r ? hol[d] : titleCase(status)}</p>}
              {r?.check_in && <p className="text-[10px] text-slate-400">{fmtTime(r.check_in)}{r.check_out ? ` – ${fmtTime(r.check_out)}` : ''}</p>}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500">
        {Object.entries(DAY_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', c)} /> {titleCase(k)}</span>)}
      </div>
    </div>
  );
}

/* ====================================================================== Attendance (HR) */
const ATT_STATUSES = ['present', 'late', 'half_day', 'absent', 'leave', 'wfh', 'holiday'];

export function Attendance() {
  const [tab, setTab] = useState('daily');
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Daily register, manual marking and monthly reports" icon={CalendarCheck} />
      <Tabs className="mb-6 w-fit" tabs={[{ value: 'daily', label: 'Daily register' }, { value: 'report', label: 'Monthly report' }]} value={tab} onChange={setTab} />
      {tab === 'daily' ? <DailyRegister /> : <MonthlyReport />}
    </div>
  );
}

function DailyRegister() {
  const [date, setDate] = useState(today());
  const { data, loading, reload } = useFetch('/hr/attendance', { date });
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEdits({});
  }, [date, data]);
  const rows = data?.data || [];
  const val = (r, k) => (edits[r.employee_id]?.[k] !== undefined ? edits[r.employee_id][k] : k === 'check_in' || k === 'check_out' ? (r[k] ? String(r[k]).slice(11, 16) : '') : r[k] || '');
  const set = (r, k, v) => setEdits((e) => ({ ...e, [r.employee_id]: { ...e[r.employee_id], [k]: v } }));
  const markAll = (status) => setEdits(Object.fromEntries(rows.map((r) => [r.employee_id, { ...edits[r.employee_id], status }])));
  const save = async () => {
    const records = Object.entries(edits).map(([employee_id, e]) => {
      const r = rows.find((x) => String(x.employee_id) === String(employee_id));
      return { employee_id, status: e.status ?? r.status ?? 'present', check_in: e.check_in ?? val(r, 'check_in'), check_out: e.check_out ?? val(r, 'check_out'), notes: e.notes ?? r.notes };
    });
    if (!records.length) return toast('No changes to save');
    setSaving(true);
    try {
      await api.post('/hr/attendance/mark', { date, records });
      toast.success('Attendance saved');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const counts = ATT_STATUSES.reduce((a, s) => ({ ...a, [s]: rows.filter((r) => (val(r, 'status') || '') === s).length }), {});
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input type="date" className="input w-44" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          {data?.holiday && <span className="badge bg-pink-50 text-pink-700">Holiday: {data.holiday.title}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={() => markAll('present')}>Mark all present</button>
          {data?.holiday && <button className="btn-outline btn-sm" onClick={() => markAll('holiday')}>Mark all holiday</button>}
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />} Save changes</button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {ATT_STATUSES.map((s) => <span key={s} className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200"><StatusBadge status={s} className="!p-0 !bg-transparent" /> {counts[s]}</span>)}
        <span className="rounded-full bg-white px-3 py-1 text-slate-500 ring-1 ring-slate-200">Not marked {rows.filter((r) => !val(r, 'status')).length}</span>
      </div>
      <DataTable
        loading={loading}
        rows={rows.map((r) => ({ ...r, id: r.employee_id }))}
        columns={[
          { key: 'name', label: 'Employee', render: (r) => <div className="flex items-center gap-3"><Avatar src={r.photo} name={r.name} size="h-8 w-8" /><div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.emp_code} · {r.department_name || '—'}</p></div></div> },
          { key: 'status', label: 'Status', render: (r) => <select className={cn('input !w-36 !py-1.5', !val(r, 'status') && 'text-slate-400')} value={val(r, 'status')} onChange={(e) => set(r, 'status', e.target.value)}><option value="">Not marked</option>{ATT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select> },
          { key: 'check_in', label: 'In', render: (r) => <input type="time" className="input !w-32 !py-1.5" value={val(r, 'check_in')} onChange={(e) => set(r, 'check_in', e.target.value)} /> },
          { key: 'check_out', label: 'Out', render: (r) => <input type="time" className="input !w-32 !py-1.5" value={val(r, 'check_out')} onChange={(e) => set(r, 'check_out', e.target.value)} /> },
          { key: 'work_minutes', label: 'Hours', render: (r) => (r.work_minutes ? minutesToHours(r.work_minutes) : '—') },
          { key: 'notes', label: 'Notes', render: (r) => <input className="input !w-44 !py-1.5" value={val(r, 'notes')} onChange={(e) => set(r, 'notes', e.target.value)} placeholder={r.check_in_location || ''} /> },
        ]}
      />
    </>
  );
}

function MonthlyReport() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data, loading } = useFetch('/hr/attendance/report', { month });
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const hol = new Set((data?.holidays || []).map((h) => h.day));
  const letter = { present: 'P', late: 'L', half_day: 'H', absent: 'A', leave: 'LV', wfh: 'W', holiday: 'HO' };
  const color = { present: 'text-emerald-600', late: 'text-amber-600', half_day: 'text-orange-500', absent: 'text-red-600 font-bold', leave: 'text-violet-600', wfh: 'text-sky-600', holiday: 'text-pink-500' };
  const exportCsv = () => {
    const header = ['Employee', 'Code', ...Array.from({ length: days }, (_, i) => i + 1), 'Present', 'Late', 'Half day', 'Absent', 'Leave', 'WFH', 'Hours'];
    const lines = (data?.data || []).map((e) => [e.name, e.emp_code, ...Array.from({ length: days }, (_, i) => letter[e.days[i + 1]] || ''), e.present, e.late, e.half_day, e.absent, e.leave, e.wfh, (e.minutes / 60).toFixed(1)]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `attendance-${month}.csv`;
    a.click();
  };
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <input type="month" className="input w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn-outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</button>
      </div>
      <div className="card overflow-x-auto thin-scroll">
        {loading ? <div className="p-10"><Spinner className="mx-auto h-6 w-6" /></div> : (
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Employee</th>
                {Array.from({ length: days }).map((_, i) => {
                  const dow = new Date(y, m - 1, i + 1).getDay();
                  return <th key={i} className={cn('px-1.5 py-2 text-center font-semibold', dow === 0 ? 'text-red-400' : hol.has(i + 1) ? 'text-pink-500' : 'text-slate-500')}>{i + 1}</th>;
                })}
                {['P', 'L', 'H', 'A', 'LV', 'Hrs'].map((h) => <th key={h} className="bg-brand-50 px-2 py-2 text-center font-bold text-brand-700">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.data || []).map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-navy-900">{e.name}<span className="ml-1 text-slate-400">{e.emp_code}</span></td>
                  {Array.from({ length: days }).map((_, i) => <td key={i} className={cn('px-1.5 py-2 text-center', color[e.days[i + 1]])}>{letter[e.days[i + 1]] || (new Date(y, m - 1, i + 1).getDay() === 0 ? <span className="text-slate-300">·</span> : '')}</td>)}
                  <td className="bg-brand-50/40 px-2 text-center font-semibold">{e.present}</td>
                  <td className="bg-brand-50/40 px-2 text-center">{e.late}</td>
                  <td className="bg-brand-50/40 px-2 text-center">{e.half_day}</td>
                  <td className="bg-brand-50/40 px-2 text-center text-red-600">{e.absent}</td>
                  <td className="bg-brand-50/40 px-2 text-center">{e.leave}</td>
                  <td className="bg-brand-50/40 px-2 text-center">{(e.minutes / 60).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">P = Present (incl. late & WFH), L = Late, H = Half day, A = Absent, LV = Leave, W = Work from home, HO = Holiday</p>
    </>
  );
}

/* ====================================================================== Leaves (HR) */
export function Leaves() {
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useFetch('/hr/leaves', { status });
  const [act, setAct] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [apply, setApply] = useState(false);
  const decide = async () => {
    try {
      await api.patch(`/hr/leaves/${act.row.id}/status`, { status: act.status, remarks });
      toast.success(`Leave ${act.status}`);
      setAct(null);
      setRemarks('');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div>
      <PageHeader title="Leave Requests" subtitle="Approve or reject leave applications" icon={CalendarOff} actions={<button className="btn-primary" onClick={() => setApply(true)}><Plus className="h-4 w-4" /> Add leave for employee</button>} />
      <Tabs className="mb-4 w-fit" tabs={['pending', 'approved', 'rejected', 'cancelled', ''].map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} value={status} onChange={setStatus} />
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'employee_name', label: 'Employee', render: (r) => <div><p className="font-medium">{r.employee_name}</p><p className="text-xs text-slate-500">{r.emp_code}</p></div> },
          { key: 'leave_type', label: 'Type', render: (r) => <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.leave_type}</span> },
          { key: 'dates', label: 'Dates', render: (r) => <div><p>{fmtDate(r.from_date)} – {fmtDate(r.to_date)}</p><p className="text-xs text-slate-500">{r.days} day(s){Number(r.half_day) ? ' · half day' : ''}</p></div> },
          { key: 'reason', label: 'Reason', render: (r) => <p className="max-w-xs whitespace-normal text-sm">{r.reason}</p> },
          { key: 'created_at', label: 'Applied', render: (r) => fmtDate(r.created_at) },
          { key: 'status', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.approved_by_name && <p className="mt-1 text-[11px] text-slate-400">by {r.approved_by_name}</p>}</div> },
          {
            key: 'a', label: '', render: (r) => r.status === 'pending' || r.status === 'approved' ? (
              <div className="flex justify-end gap-1">
                {r.status === 'pending' && <button className="btn-sm btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => setAct({ row: r, status: 'approved' })}><Check className="h-4 w-4" /> Approve</button>}
                <button className="btn-sm btn bg-red-50 text-red-700 hover:bg-red-100" onClick={() => setAct({ row: r, status: 'rejected' })}><X className="h-4 w-4" /> Reject</button>
              </div>
            ) : null,
          },
        ]}
        empty={<EmptyState title="No leave requests" text="Leave applications from employees will appear here." />}
      />
      <Modal open={!!act} onClose={() => setAct(null)} title={act ? `${titleCase(act.status === 'approved' ? 'approve' : 'reject')} leave – ${act.row.employee_name}` : ''} size="max-w-md" footer={<><button className="btn-outline" onClick={() => setAct(null)}>Cancel</button><button className={act?.status === 'approved' ? 'btn-primary' : 'btn-danger'} onClick={decide}>Confirm</button></>}>
        <Field label="Remarks (sent to employee)"><textarea className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </Modal>
      <ApplyLeaveModal open={apply} onClose={() => setApply(false)} onSaved={reload} forEmployee />
    </div>
  );
}

export function ApplyLeaveModal({ open, onClose, onSaved, forEmployee = false }) {
  const { data: types } = useFetch('/admin/leave_types', { all: 1, status: 'active' });
  const { data: emps } = useFetch(forEmployee ? '/hr/employees' : null, { status: 'active' }, { skip: !forEmployee });
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ from_date: today(), to_date: today(), half_day: false, leave_type_id: '', reason: '', employee_id: '' }); }, [open]);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/hr/leaves', f);
      toast.success(`Leave request submitted (${data.days} day/s)`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Apply for leave" size="max-w-lg" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Submit</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {forEmployee && (
          <Field label="Employee" className="sm:col-span-2">
            <select className="input" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
              <option value="">— Select —</option>
              {emps?.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.emp_code})</option>)}
            </select>
          </Field>
        )}
        <Field label="Leave type" className="sm:col-span-2">
          <select className="input" value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
            <option value="">— Select —</option>
            {types?.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" className="input" value={f.from_date || ''} onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: f.half_day ? e.target.value : f.to_date < e.target.value ? e.target.value : f.to_date })} /></Field>
        <Field label="To"><input type="date" className="input" disabled={f.half_day} value={f.to_date || ''} min={f.from_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={f.half_day} onChange={(e) => setF({ ...f, half_day: e.target.checked, to_date: f.from_date })} /> Half day</label>
        <Field label="Reason" className="sm:col-span-2"><textarea className="input" rows={3} value={f.reason || ''} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ====================================================================== Payroll */
export function Payroll() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { data, loading, reload } = useFetch('/hr/payslips', { month, year });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [send, setSend] = useState(null);
  const confirm = useConfirm();
  const rows = data?.data || [];
  const total = rows.reduce((a, r) => a + Number(r.net_pay), 0);

  const generate = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post('/hr/payslips/generate', { month, year });
      toast.success(r.message);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async () => {
    try {
      await api.put(`/hr/payslips/${edit.id}`, edit);
      setEdit(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const markPaid = async (r) => {
    await api.patch(`/hr/payslips/${r.id}/paid`, {});
    toast.success('Marked as paid');
    reload();
  };
  const del = async (r) => {
    if (!(await confirm({ text: `Delete payslip of ${r.name}?` }))) return;
    await api.delete(`/hr/payslips/${r.id}`);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Auto-calculated from attendance, leaves and holidays"
        icon={Banknote}
        actions={<button className="btn-primary" onClick={generate} disabled={busy}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Banknote className="h-4 w-4" />} Generate payslips</button>}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select className="input w-40" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}</select>
        <select className="input w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}</select>
        <span className="rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700">Net payroll: {money(total)}</span>
      </div>
      <DataTable
        loading={loading}
        rows={rows}
        columns={[
          { key: 'name', label: 'Employee', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.emp_code}</p></div> },
          { key: 'gross', label: 'Gross', render: (r) => money(r.gross, 0) },
          { key: 'days', label: 'Paid / Working', render: (r) => `${Number(r.paid_days)} / ${Number(r.working_days)}` },
          { key: 'lop', label: 'LOP', render: (r) => (Number(r.lop_days) ? <span className="text-red-600">{Number(r.lop_days)}d · {money(r.lop_amount, 0)}</span> : '—') },
          { key: 'adj', label: 'Bonus / Deductions', render: (r) => <span className="text-xs">+{money(r.bonus, 0)} / -{money(r.deductions, 0)}</span> },
          { key: 'net_pay', label: 'Net pay', render: (r) => <b className="text-navy-900">{money(r.net_pay)}</b> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'a', label: '', render: (r) => (
              <div className="flex justify-end gap-1">
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View" onClick={() => openPdf('payslip', r.id)}><Eye className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" title="Send" onClick={() => setSend(r)}><Send className="h-4 w-4" /></button>
                {r.status !== 'paid' && <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Adjust" onClick={() => setEdit({ id: r.id, name: r.name, bonus: r.bonus, deductions: r.deductions, lop_days: r.lop_days, notes: r.notes || '' })}><Pencil className="h-4 w-4" /></button>}
                {r.status !== 'paid' && <button className="btn-sm btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => markPaid(r)}>Paid</button>}
                <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(r)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ),
          },
        ]}
        empty={<EmptyState icon={Banknote} title="No payslips for this month" text="Click “Generate payslips” to calculate salaries for all active employees with a salary set." />}
      />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Adjust payslip – ${edit?.name}`} size="max-w-md" footer={<><button className="btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={saveEdit}>Save</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bonus / Incentive (₹)"><input type="number" className="input" value={edit.bonus} onChange={(e) => setEdit({ ...edit, bonus: e.target.value })} /></Field>
            <Field label="Other deductions (₹)"><input type="number" className="input" value={edit.deductions} onChange={(e) => setEdit({ ...edit, deductions: e.target.value })} /></Field>
            <Field label="LOP days"><input type="number" step="0.5" className="input" value={edit.lop_days} onChange={(e) => setEdit({ ...edit, lop_days: e.target.value })} /></Field>
            <Field label="Note" className="sm:col-span-2"><input className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      {send && <SendDialog open onClose={() => setSend(null)} type="payslip" id={send.id} email={send.email} phone={send.phone} title={`Send payslip – ${send.name}`} />}
    </div>
  );
}

