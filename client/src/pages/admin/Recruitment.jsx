import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  UserPlus, FileSignature, Plus, Eye, Send, Trash2, Star, Mail, Phone, FileText, CalendarClock, BellRing, UserCheck, Wand2, ArrowLeft, LayoutGrid, List, MessageCircle } from 'lucide-react';
import api, { errMsg, openPdf } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { asset, cn, fmtDate, titleCase, today, waLink } from '../../lib/utils';
import { PageHeader, SearchInput, StatusBadge, Spinner, Modal, Field, PageLoader, RichEditor, useConfirm, EmptyState } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';
import SendDialog from '../../components/ui/SendDialog';

const STAGES = ['applied', 'shortlisted', 'interview', 'selected', 'offered', 'hired', 'rejected'];
const STAGE_COLOR = { applied: 'border-t-slate-400', shortlisted: 'border-t-indigo-500', interview: 'border-t-sky-500', selected: 'border-t-violet-500', offered: 'border-t-fuchsia-500', hired: 'border-t-emerald-500', rejected: 'border-t-red-500' };

/* ====================================================================== Applications */
export function Applications() {
  const [params] = useSearchParams();
  const [view, setView] = useState('board');
  const [q, setQ] = useState('');
  const [job, setJob] = useState(params.get('job') || '');
  const { data, loading, reload } = useFetch('/recruitment/applications', { q, job_id: job });
  const { data: jobs } = useFetch('/admin/job_openings', { all: 1 });
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState(false);
  const rows = data?.data || [];

  const move = async (app, stage) => {
    try {
      await api.put(`/recruitment/applications/${app.id}`, { stage });
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle="Track candidates from application to hiring"
        icon={UserPlus}
        actions={
          <>
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button className={cn('rounded-lg p-2', view === 'board' && 'bg-white shadow-sm')} onClick={() => setView('board')}><LayoutGrid className="h-4 w-4" /></button>
              <button className={cn('rounded-lg p-2', view === 'list' && 'bg-white shadow-sm')} onClick={() => setView('list')}><List className="h-4 w-4" /></button>
            </div>
            <button className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add candidate</button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="sm:w-72" value={q} onChange={setQ} />
        <select className="input sm:w-64" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">All positions</option>
          {jobs?.data?.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>
      {loading ? (
        <PageLoader />
      ) : view === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4 thin-scroll">
          {STAGES.map((st) => {
            const list = rows.filter((r) => r.stage === st);
            return (
              <div
                key={st}
                className={cn('w-72 shrink-0 rounded-2xl border-t-4 bg-slate-100/80 p-3', STAGE_COLOR[st])}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('id');
                  const app = rows.find((r) => String(r.id) === id);
                  if (app && app.stage !== st) move(app, st);
                }}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-navy-900">{titleCase(st)}</h3>
                  <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{list.length}</span>
                </div>
                <div className="min-h-[120px] space-y-2.5">
                  {list.map((a) => (
                    <div key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData('id', String(a.id))} onClick={() => setOpen(a.id)} className="cursor-pointer rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/60 transition hover:shadow-md">
                      <p className="font-semibold text-navy-900">{a.name}</p>
                      <p className="text-xs text-brand-700">{a.job_title || 'General application'}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{fmtDate(a.created_at)}</span>
                        {a.rating ? <span className="flex items-center gap-0.5 text-accent-600"><Star className="h-3 w-3 fill-current" />{a.rating}</span> : null}
                      </div>
                      {a.interview_at && st === 'interview' && <p className="mt-2 flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-[11px] text-sky-700"><CalendarClock className="h-3 w-3" />{new Date(a.interview_at.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DataTable
          rows={rows}
          onRowClick={(r) => setOpen(r.id)}
          columns={[
            { key: 'name', label: 'Candidate', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></div> },
            { key: 'job_title', label: 'Position', render: (r) => r.job_title || 'General' },
            { key: 'phone', label: 'Phone' },
            { key: 'qualification', label: 'Qualification' },
            { key: 'experience', label: 'Experience' },
            { key: 'created_at', label: 'Applied', render: (r) => fmtDate(r.created_at) },
            { key: 'stage', label: 'Stage', render: (r) => <StatusBadge status={r.stage} /> },
          ]}
          empty={<EmptyState title="No applications yet" text="Applications submitted on the Careers page appear here." />}
        />
      )}
      {open && <ApplicationModal id={open} onClose={() => setOpen(null)} onChange={reload} />}
      {add && <AddCandidate onClose={() => setAdd(false)} jobs={jobs?.data || []} onSaved={reload} />}
    </div>
  );
}

function AddCandidate({ onClose, jobs, onSaved }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', job_id: '', qualification: '', college: '', experience: '', resume: '' });
  const save = async () => {
    try {
      await api.post('/recruitment/applications', f);
      toast.success('Candidate added');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Modal open onClose={onClose} title="Add candidate" size="max-w-lg" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {[['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['qualification', 'Qualification'], ['college', 'College'], ['experience', 'Experience']].map(([k, l]) => (
          <Field key={k} label={l}><input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
        <Field label="Position" className="sm:col-span-2">
          <select className="input" value={f.job_id} onChange={(e) => setF({ ...f, job_id: e.target.value })}>
            <option value="">General</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function ApplicationModal({ id, onClose, onChange }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: a, reload } = useFetch(`/recruitment/applications/${id}`);
  const [f, setF] = useState(null);
  const [notify, setNotify] = useState(null);
  const [hire, setHire] = useState(null);
  const { data: depts } = useFetch('/admin/departments', { all: 1 });
  const { data: desigs } = useFetch('/admin/designations', { all: 1 });

  useEffect(() => {
    if (a) setF({ stage: a.stage, interview_at: a.interview_at ? a.interview_at.slice(0, 16).replace(' ', 'T') : '', interview_mode: a.interview_mode || '', interview_link: a.interview_link || '', rating: a.rating || '', notes: a.notes || '' });
  }, [a]);
  if (!a || !f) return <Modal open onClose={onClose} title="Loading…"><PageLoader /></Modal>;

  const save = async (extra = {}) => {
    try {
      await api.put(`/recruitment/applications/${id}`, { ...f, interview_at: f.interview_at ? f.interview_at.replace('T', ' ') + ':00' : null, ...extra });
      toast.success('Saved');
      reload();
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const sendNotify = async () => {
    try {
      const { data } = await api.post(`/recruitment/applications/${id}/notify`, notify);
      Object.entries(data.results).forEach(([ch, r]) => (r.ok ? toast.success(`${ch} sent`) : toast.error(`${ch}: ${r.error}`)));
      if (data.results.whatsapp && !data.results.whatsapp.ok && data.results.whatsapp.waLink) window.open(data.results.whatsapp.waLink, '_blank');
      setNotify(null);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const doHire = async () => {
    try {
      const { data } = await api.post(`/recruitment/applications/${id}/hire`, hire);
      toast.success(data.message);
      onChange();
      navigate(`/admin/employees/${data.employee_id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const del = async () => {
    if (!(await confirm({ text: `Delete application of ${a.name}?` }))) return;
    await api.delete(`/recruitment/applications/${id}`);
    onChange();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={a.name} size="max-w-4xl">
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-brand-700">{a.job_title || 'General application'}</p>
            <div className="mt-3 space-y-2 text-sm">
              <a href={`mailto:${a.email}`} className="flex items-center gap-2 hover:text-brand-700"><Mail className="h-4 w-4 text-slate-400" />{a.email}</a>
              {a.phone && <a href={`tel:${a.phone}`} className="flex items-center gap-2 hover:text-brand-700"><Phone className="h-4 w-4 text-slate-400" />{a.phone}</a>}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              {[['City', a.city], ['Qualification', a.qualification], ['College', a.college], ['Experience', a.experience], ['Current CTC', a.current_ctc], ['Expected CTC', a.expected_ctc], ['Notice period', a.notice_period], ['Applied', fmtDate(a.created_at)]]
                .filter((x) => x[1])
                .map(([k, v]) => <div key={k}><dt className="text-slate-400">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>)}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.resume && <a href={asset(a.resume)} target="_blank" rel="noreferrer" className="btn-outline btn-sm"><FileText className="h-4 w-4" /> Resume</a>}
              {a.portfolio_url && <a href={a.portfolio_url} target="_blank" rel="noreferrer" className="btn-outline btn-sm">Portfolio</a>}
              {a.phone && <a href={waLink(a.phone, `Hello ${a.name},`)} target="_blank" rel="noreferrer" className="btn-outline btn-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
            </div>
          </div>
          {a.cover_letter && <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"><p className="label">Cover letter</p>{a.cover_letter}</div>}
          {a.letters?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="label">Letters issued</p>
              {a.letters.map((l) => <button key={l.id} onClick={() => openPdf('letter', l.id)} className="flex w-full items-center justify-between py-1 text-sm text-brand-700 hover:underline"><span>{l.title}</span><span className="text-xs text-slate-400">{fmtDate(l.issue_date)}</span></button>)}
            </div>
          )}
        </div>
        <div className="space-y-4 lg:col-span-3">
          <Field label="Stage">
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button key={s} onClick={() => setF({ ...f, stage: s })} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', f.stage === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{titleCase(s)}</button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Interview date & time"><input type="datetime-local" className="input" value={f.interview_at} onChange={(e) => setF({ ...f, interview_at: e.target.value })} /></Field>
            <Field label="Mode">
              <select className="input" value={f.interview_mode} onChange={(e) => setF({ ...f, interview_mode: e.target.value })}>
                <option value="">—</option><option value="in_person">In person</option><option value="phone">Phone</option><option value="video">Video call</option>
              </select>
            </Field>
            {f.interview_mode === 'video' && <Field label="Meeting link" className="sm:col-span-2"><input className="input" value={f.interview_link} onChange={(e) => setF({ ...f, interview_link: e.target.value })} /></Field>}
            <Field label="Rating">
              <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setF({ ...f, rating: n })}><Star className={cn('h-6 w-6', n <= f.rating ? 'fill-accent-500 text-accent-500' : 'text-slate-300')} /></button>)}</div>
            </Field>
          </div>
          <Field label="Internal notes"><textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button className="btn-primary" onClick={() => save()}>Save</button>
            <button className="btn-outline" onClick={() => setNotify({ channels: ['email'], message: '' })}><BellRing className="h-4 w-4" /> Notify candidate</button>
            <Link to={`/admin/letters/new?application=${a.id}`} className="btn-outline"><FileSignature className="h-4 w-4" /> Offer letter</Link>
            {!a.employee_id ? (
              <button className="btn-accent" onClick={() => setHire({ joining_date: today(), employment_type: a.job_type === 'internship' ? 'intern' : 'full_time', salary: '', department_id: '', designation_id: '' })}><UserCheck className="h-4 w-4" /> Hire</button>
            ) : (
              <Link to={`/admin/employees/${a.employee_id}`} className="btn-outline">View employee</Link>
            )}
            <button className="btn text-red-600 hover:bg-red-50" onClick={del}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <Modal open={!!notify} onClose={() => setNotify(null)} title="Notify candidate" size="max-w-lg" footer={<><button className="btn-outline" onClick={() => setNotify(null)}>Cancel</button><button className="btn-primary" onClick={sendNotify}><Send className="h-4 w-4" /> Send</button></>}>
        {notify && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">A message based on the current stage (<b>{titleCase(a.stage)}</b>) will be sent. Save the stage/interview details first. You can also write a custom message.</p>
            <div className="flex gap-4">
              {['email', 'whatsapp', 'sms'].map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={notify.channels.includes(c)} onChange={(e) => setNotify({ ...notify, channels: e.target.checked ? [...notify.channels, c] : notify.channels.filter((x) => x !== c) })} />{titleCase(c)}</label>
              ))}
            </div>
            <Field label="Custom message (optional)"><textarea className="input" rows={4} value={notify.message} onChange={(e) => setNotify({ ...notify, message: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Modal open={!!hire} onClose={() => setHire(null)} title={`Hire ${a.name}`} size="max-w-lg" footer={<><button className="btn-outline" onClick={() => setHire(null)}>Cancel</button><button className="btn-primary" onClick={doHire}>Create employee</button></>}>
        {hire && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Joining date"><input type="date" className="input" value={hire.joining_date} onChange={(e) => setHire({ ...hire, joining_date: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={hire.employment_type} onChange={(e) => setHire({ ...hire, employment_type: e.target.value })}>{['full_time', 'part_time', 'intern', 'contract'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
            <Field label="Department"><select className="input" value={hire.department_id} onChange={(e) => setHire({ ...hire, department_id: e.target.value })}><option value="">—</option>{depts?.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Designation"><select className="input" value={hire.designation_id} onChange={(e) => setHire({ ...hire, designation_id: e.target.value })}><option value="">—</option>{desigs?.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Monthly salary / stipend (₹)" className="sm:col-span-2"><input type="number" className="input" value={hire.salary} onChange={(e) => setHire({ ...hire, salary: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Modal>
  );
}

/* ====================================================================== Letters */
const LETTER_TYPES = ['internship_offer', 'offer', 'appointment', 'joining', 'experience', 'relieving', 'internship_completion', 'warning', 'custom'];

export function Letters() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const { data, loading, reload } = useFetch('/recruitment/letters', { q, type });
  const [send, setSend] = useState(null);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const del = async (r) => {
    if (!(await confirm({ text: `Delete letter ${r.letter_no}?` }))) return;
    await api.delete(`/recruitment/letters/${r.id}`);
    reload();
  };
  return (
    <div>
      <PageHeader title="HR Letters" subtitle="Internship offers, offer letters, joining, experience & relieving letters on your letterhead" icon={FileSignature} actions={<Link to="/admin/letters/new" className="btn-primary"><Plus className="h-4 w-4" /> Create letter</Link>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="sm:w-72" value={q} onChange={setQ} />
        <select className="input sm:w-56" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {LETTER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
        </select>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={(r) => navigate(`/admin/letters/${r.id}/edit`)}
        columns={[
          { key: 'letter_no', label: 'Ref no', render: (r) => <span className="font-semibold text-brand-700">{r.letter_no}</span> },
          { key: 'title', label: 'Letter', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-slate-500">{titleCase(r.type)}</p></div> },
          { key: 'recipient_name', label: 'Issued to' },
          { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'a', label: '', render: (r) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => openPdf('letter', r.id)}><Eye className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" onClick={() => setSend(r)}><Send className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(r)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ),
          },
        ]}
        empty={<EmptyState icon={FileSignature} title="No letters yet" action={<Link to="/admin/letters/new" className="btn-primary">Create letter</Link>} />}
      />
      {send && <SendDialog open onClose={() => setSend(null)} type="letter" id={send.id} email={send.recipient_email} phone={send.recipient_phone} title={`Send ${send.title}`} onSent={reload} />}
    </div>
  );
}

const KNOWN_KEYS = ['company', 'company_address', 'company_email', 'company_phone', 'company_website', 'signatory', 'signatory_designation', 'issue_date', 'working_hours', 'location', 'name', 'first_name', 'email', 'phone', 'address', 'father_name', 'emp_code', 'designation', 'department', 'reporting_to', 'joining_date', 'start_date', 'last_working_day', 'salary', 'ctc', 'stipend', 'salutation', 'pronoun', 'pronoun_his', 'college', 'qualification'];
const EXTRA_HINTS = { duration: '3 months', acceptance_date: '20 October 2026', probation: '6 months', end_date: '31 December 2026', project: 'website development using React and Node.js', stipend: '5,000 per month' };

export function LetterForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editing = !!id;
  const { data: templates } = useFetch('/admin/letter_templates', { all: 1, status: 'active' });
  const { data: emps } = useFetch('/hr/employees', { all: 1 });
  const { data: apps } = useFetch('/recruitment/applications');
  const [f, setF] = useState({
    template_id: '', type: 'custom', title: '', subject: '', body: '', recipient_name: '', recipient_email: '', recipient_phone: '', recipient_address: '',
    employee_id: params.get('employee') || '', application_id: params.get('application') || '', issue_date: today(), status: 'issued', data: {},
  });
  const [base, setBase] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(id || null);
  const [send, setSend] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get(`/recruitment/letters/${id}`).then(({ data }) => {
      setF({ ...data, issue_date: data.issue_date?.slice(0, 10), subject: data.data?.subject || '', employee_id: data.employee_id || '', application_id: data.application_id || '', template_id: data.template_id || '' });
    });
  }, [id, editing]);

  // fetch placeholder values for selected person
  useEffect(() => {
    if (editing) return;
    api.get('/recruitment/letters/placeholders', { params: { employee_id: f.employee_id || undefined, application_id: f.employee_id ? undefined : f.application_id || undefined } }).then(({ data }) => {
      setBase(data);
      if (data.name) setF((x) => ({ ...x, recipient_name: data.name, recipient_email: data.email || '', recipient_phone: data.phone || '', recipient_address: data.address || '' }));
    });
  }, [f.employee_id, f.application_id, editing]);

  const tpl = templates?.data?.find((t) => String(t.id) === String(f.template_id));
  const extraKeys = useMemo(() => {
    if (!tpl) return [];
    const found = new Set();
    `${tpl.title} ${tpl.subject || ''} ${tpl.body}`.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => found.add(k));
    return [...found].filter((k) => !KNOWN_KEYS.includes(k) || (!base[k] && ['stipend', 'salary', 'ctc', 'designation', 'department', 'joining_date', 'start_date', 'last_working_day', 'reporting_to'].includes(k)));
  }, [tpl, base]);

  const chooseTemplate = (tid) => {
    const t = templates?.data?.find((x) => String(x.id) === String(tid));
    setF((x) => ({ ...x, template_id: tid, type: t?.type || 'custom', title: t?.title || x.title, subject: t?.subject || '', body: '' }));
  };

  const generate = async () => {
    if (!f.template_id) return toast.error('Choose a template first');
    try {
      const { data } = await api.post('/recruitment/letters/render', { template_id: f.template_id, employee_id: f.employee_id || undefined, application_id: f.application_id || undefined, data: { name: f.recipient_name, first_name: f.recipient_name.split(' ')[0], ...f.data } });
      setF((x) => ({ ...x, title: data.title, subject: data.subject, body: data.body }));
      toast.success('Letter generated – review and edit below');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const save = async (andSend = false) => {
    setSaving(true);
    try {
      const body = { ...f, employee_id: f.employee_id || null, application_id: f.application_id || null };
      const { data } = editing ? await api.put(`/recruitment/letters/${id}`, body) : await api.post('/recruitment/letters', body);
      toast.success('Letter saved');
      setSavedId(data.id);
      if (!editing) navigate(`/admin/letters/${data.id}/edit`, { replace: true });
      if (andSend) setSend(true);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/letters" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Letters</Link>
      <PageHeader
        title={editing ? `Edit ${f.title || 'letter'}` : 'Create letter'}
        subtitle={f.letter_no}
        actions={
          <>
            {savedId && <button className="btn-outline" onClick={() => openPdf('letter', savedId)}><Eye className="h-4 w-4" /> Preview PDF</button>}
            <button className="btn-outline" disabled={saving} onClick={() => save(false)}>Save</button>
            <button className="btn-primary" disabled={saving} onClick={() => save(true)}>{saving && <Spinner className="h-4 w-4 text-white" />} Save & send</button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <h3 className="font-semibold">1. Recipient</h3>
            <Field label="Employee / Intern">
              <select className="input" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value, application_id: '' })}>
                <option value="">—</option>
                {emps?.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.emp_code})</option>)}
              </select>
            </Field>
            <Field label="…or candidate">
              <select className="input" value={f.application_id} onChange={(e) => setF({ ...f, application_id: e.target.value, employee_id: '' })}>
                <option value="">—</option>
                {apps?.data?.map((a) => <option key={a.id} value={a.id}>{a.name} – {a.job_title || 'General'}</option>)}
              </select>
            </Field>
            <Field label="Name" required><input className="input" value={f.recipient_name} onChange={(e) => setF({ ...f, recipient_name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={f.recipient_email || ''} onChange={(e) => setF({ ...f, recipient_email: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" value={f.recipient_phone || ''} onChange={(e) => setF({ ...f, recipient_phone: e.target.value })} /></Field>
            <Field label="Address"><textarea className="input" rows={2} value={f.recipient_address || ''} onChange={(e) => setF({ ...f, recipient_address: e.target.value })} /></Field>
          </div>
          <div className="card space-y-4 p-6">
            <h3 className="font-semibold">2. Template & details</h3>
            <Field label="Template">
              <select className="input" value={f.template_id} onChange={(e) => chooseTemplate(e.target.value)}>
                <option value="">— Choose template —</option>
                {templates?.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            {extraKeys.map((k) => (
              <Field key={k} label={titleCase(k)}>
                <input className="input" placeholder={base[k] || EXTRA_HINTS[k] || ''} value={f.data?.[k] ?? ''} onChange={(e) => setF({ ...f, data: { ...f.data, [k]: e.target.value } })} />
              </Field>
            ))}
            <button className="btn-dark w-full" onClick={generate}><Wand2 className="h-4 w-4" /> Generate letter</button>
          </div>
        </div>
        <div className="card space-y-4 p-6 lg:col-span-2">
          <h3 className="font-semibold">3. Review & edit</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Letter heading" className="sm:col-span-2"><input className="input font-semibold" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Issue date"><input type="date" className="input" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></Field>
            <Field label="Subject" className="sm:col-span-2"><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
            <Field label="Status">
              <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {['draft', 'issued', 'sent', 'accepted', 'revoked'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {LETTER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Letter body">
            <RichEditor value={f.body} onChange={(v) => setF((x) => ({ ...x, body: v }))} placeholder="Choose a template and click “Generate letter”, or write your own…" />
          </Field>
          <p className="text-xs text-slate-500">The letter is printed on your company letterhead with reference number, date, recipient block, signature{['offer', 'internship_offer', 'appointment'].includes(f.type) ? ' and candidate acceptance section' : ''}.</p>
        </div>
      </div>
      {savedId && <SendDialog open={send} onClose={() => setSend(false)} type="letter" id={savedId} email={f.recipient_email} phone={f.recipient_phone} title={`Send ${f.title}`} />}
    </div>
  );
}

