import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, ClipboardList, MessageSquare, Calendar, Trash2, NotebookPen, CheckCircle2, AlertTriangle, Send, Clock } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { cn, fmtDate, titleCase, today } from '../../lib/utils';
import { PageHeader, SearchInput, StatusBadge, Spinner, Modal, Field, Avatar, PageLoader, useConfirm, EmptyState } from '../../components/ui';

const COLUMNS = [
  { key: 'todo', label: 'To do', color: 'bg-slate-400' },
  { key: 'in_progress', label: 'In progress', color: 'bg-sky-500' },
  { key: 'review', label: 'Review', color: 'bg-violet-500' },
  { key: 'blocked', label: 'Blocked', color: 'bg-red-500' },
  { key: 'done', label: 'Done', color: 'bg-emerald-500' },
];
const PRIORITY_DOT = { urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-sky-500', low: 'bg-slate-400' };

export function TaskBoard({ mine = false }) {
  const { user, hasRole } = useAuth();
  const manager = hasRole('hr') && !mine;
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [project, setProject] = useState(params.get('project') || '');
  const { data, loading, reload } = useFetch('/work/tasks', { q, assigned_to: assignee, project_id: project, mine: mine ? 1 : undefined });
  const { data: emps } = useFetch(manager ? '/hr/employees' : null, { status: 'active' }, { skip: !manager });
  const { data: projects } = useFetch('/admin/projects', { all: 1 });
  const [open, setOpen] = useState(null);
  const rows = data?.data || [];

  const move = async (task, status) => {
    try {
      await api.put(`/work/tasks/${task.id}`, { status });
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={mine ? 'My Tasks' : 'Task Board'}
        subtitle={mine ? 'Tasks assigned to you – drag cards to update status' : 'Assign and track work across your team'}
        icon={ClipboardList}
        actions={<button className="btn-primary" onClick={() => setOpen('new')}><Plus className="h-4 w-4" /> New task</button>}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="sm:w-64" value={q} onChange={setQ} />
        {manager && (
          <select className="input sm:w-56" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">All members</option>
            {emps?.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <select className="input sm:w-56" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">All projects</option>
          {projects?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {loading ? (
        <PageLoader />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 thin-scroll">
          {COLUMNS.map((col) => {
            const list = rows.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                className="w-72 shrink-0 rounded-2xl bg-slate-100/80 p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const t = rows.find((x) => String(x.id) === e.dataTransfer.getData('id'));
                  if (t && t.status !== col.key) move(t, col.key);
                }}
              >
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn('h-2.5 w-2.5 rounded-full', col.color)} />
                  <h3 className="text-sm font-semibold text-navy-900">{col.label}</h3>
                  <span className="ml-auto rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{list.length}</span>
                </div>
                <div className="min-h-[160px] space-y-2.5">
                  {list.map((t) => {
                    const overdue = t.due_date && t.status !== 'done' && t.due_date.slice(0, 10) < today();
                    return (
                      <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('id', String(t.id))} onClick={() => setOpen(t.id)} className="cursor-pointer rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/60 transition hover:shadow-md">
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[t.priority])} />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.priority}</span>
                          {t.project_name && <span className="ml-auto truncate rounded bg-brand-50 px-1.5 text-[11px] font-medium text-brand-700">{t.project_name}</span>}
                        </div>
                        <p className="text-sm font-semibold text-navy-900">{t.title}</p>
                        {t.progress > 0 && t.status !== 'done' && (
                          <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${t.progress}%` }} /></div>
                        )}
                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                          <span className={cn('flex items-center gap-1', overdue && 'font-semibold text-red-600')}>
                            {t.due_date && <><Calendar className="h-3 w-3" /> {fmtDate(t.due_date, { day: '2-digit', month: 'short' })}</>}
                          </span>
                          <span className="flex items-center gap-2">
                            {t.comment_count > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{t.comment_count}</span>}
                            {t.assignee_name && <Avatar src={t.assignee_photo} name={t.assignee_name} size="h-6 w-6" className="text-[9px]" />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open && <TaskModal id={open === 'new' ? null : open} onClose={() => setOpen(null)} onChange={reload} manager={manager} employees={emps?.data || []} projects={projects?.data || []} user={user} />}
    </div>
  );
}

function TaskModal({ id, onClose, onChange, manager, employees, projects, user }) {
  const confirm = useConfirm();
  const [t, setT] = useState(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const load = () => api.get(`/work/tasks/${id}`).then(({ data }) => setT({ ...data, due_date: data.due_date?.slice(0, 10) || '', start_date: data.start_date?.slice(0, 10) || '' }));
  useEffect(() => {
    if (id) load();
    else setT({ title: '', description: '', project_id: '', assigned_to: manager ? '' : user.employee_id, priority: 'medium', status: 'todo', start_date: today(), due_date: '', progress: 0, comments: [] });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null;
  const canEditAll = manager || !id || t.assigned_by === user.id;

  const save = async () => {
    setSaving(true);
    try {
      const body = { title: t.title, description: t.description, project_id: t.project_id || null, assigned_to: t.assigned_to || null, priority: t.priority, status: t.status, start_date: t.start_date || null, due_date: t.due_date || null, progress: t.progress };
      if (id) await api.put(`/work/tasks/${id}`, body);
      else await api.post('/work/tasks', body);
      toast.success('Task saved');
      onChange();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    await api.post(`/work/tasks/${id}/comments`, { comment });
    setComment('');
    load();
    onChange();
  };
  const del = async () => {
    if (!(await confirm({ text: 'Delete this task?' }))) return;
    await api.delete(`/work/tasks/${id}`);
    onChange();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={id ? 'Task details' : 'New task'}
      size="max-w-3xl"
      footer={
        <>
          {id && canEditAll && <button className="btn mr-auto text-red-600 hover:bg-red-50" onClick={del}><Trash2 className="h-4 w-4" /> Delete</button>}
          <button className="btn-outline" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving && <Spinner className="h-4 w-4 text-white" />} Save</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><input className="input font-medium" disabled={!canEditAll} value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={3} disabled={!canEditAll} value={t.description || ''} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
        {manager && (
          <Field label="Assign to">
            <select className="input" value={t.assigned_to || ''} onChange={(e) => setT({ ...t, assigned_to: e.target.value })}>
              <option value="">Unassigned</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Project">
          <select className="input" disabled={!canEditAll} value={t.project_id || ''} onChange={(e) => setT({ ...t, project_id: e.target.value })}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" disabled={!canEditAll} value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })}>
            {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })}>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Start date"><input type="date" className="input" disabled={!canEditAll} value={t.start_date} onChange={(e) => setT({ ...t, start_date: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" className="input" disabled={!canEditAll} value={t.due_date} onChange={(e) => setT({ ...t, due_date: e.target.value })} /></Field>
        <Field label={`Progress – ${t.progress}%`} className="sm:col-span-2">
          <input type="range" min="0" max="100" step="5" className="w-full accent-brand-600" value={t.progress} onChange={(e) => setT({ ...t, progress: Number(e.target.value) })} />
        </Field>
      </div>
      {id && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h4 className="mb-3 flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" /> Comments</h4>
          <div className="mb-3 max-h-60 space-y-3 overflow-y-auto thin-scroll">
            {t.comments?.length ? t.comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar name={c.user_name} size="h-8 w-8" />
                <div className="flex-1 rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <p className="text-xs"><b className="text-navy-900">{c.user_name}</b> <span className="text-slate-400">· {new Date(c.created_at.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{c.comment}</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-400">No comments yet.</p>}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="Write an update…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
            <button className="btn-primary" onClick={addComment}><Send className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ====================================================================== Daily reports */
export function DailyReports({ mine = false }) {
  const { user, hasRole } = useAuth();
  const manager = hasRole('hr') && !mine;
  const [date, setDate] = useState(manager ? today() : '');
  const { data, loading, reload } = useFetch('/work/reports', { date: manager ? date : undefined, mine: mine ? 1 : undefined });
  const { data: missing } = useFetch(manager ? '/work/reports-missing' : null, { date }, { skip: !manager });
  const [form, setForm] = useState({ report_date: today(), work_done: '', hours: 8, plan_tomorrow: '', blockers: '' });
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/work/reports', form);
      toast.success('Daily report submitted');
      setForm({ ...form, work_done: '', plan_tomorrow: '', blockers: '' });
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const doReview = async () => {
    await api.patch(`/work/reports/${review.id}/review`, { remarks: review.remarks });
    toast.success('Marked as reviewed');
    setReview(null);
    reload();
  };

  return (
    <div>
      <PageHeader title="Daily Work Reports" subtitle={manager ? 'What your team worked on each day' : 'Submit your end-of-day report'} icon={NotebookPen} />
      <div className="grid gap-6 lg:grid-cols-3">
        {!manager && user.employee_id && (
          <form onSubmit={submit} className="card h-fit space-y-4 p-6">
            <h3 className="font-semibold">Submit report</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className="input" max={today()} value={form.report_date} onChange={(e) => setForm({ ...form, report_date: e.target.value })} /></Field>
              <Field label="Hours worked"><input type="number" step="0.5" className="input" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></Field>
            </div>
            <Field label="Work done today" required><textarea className="input" rows={5} required value={form.work_done} onChange={(e) => setForm({ ...form, work_done: e.target.value })} placeholder="• Completed login page UI&#10;• Fixed invoice bug…" /></Field>
            <Field label="Plan for tomorrow"><textarea className="input" rows={3} value={form.plan_tomorrow} onChange={(e) => setForm({ ...form, plan_tomorrow: e.target.value })} /></Field>
            <Field label="Blockers / help needed"><textarea className="input" rows={2} value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} /></Field>
            <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Submit report</button>
          </form>
        )}
        {manager && (
          <div className="card h-fit p-6">
            <Field label="Date"><input type="date" className="input" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-600"><AlertTriangle className="h-4 w-4" /> Not submitted ({missing?.data?.length || 0})</p>
              <div className="flex flex-wrap gap-1.5">
                {missing?.data?.map((m) => <span key={m.id} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">{m.name}</span>)}
              </div>
            </div>
          </div>
        )}
        <div className="space-y-4 lg:col-span-2">
          {loading ? <PageLoader /> : data?.data?.length ? data.data.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar src={r.photo} name={r.employee_name} />
                  <div>
                    <p className="font-semibold text-navy-900">{r.employee_name}</p>
                    <p className="flex items-center gap-2 text-xs text-slate-500"><Calendar className="h-3 w-3" />{fmtDate(r.report_date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} <Clock className="ml-1 h-3 w-3" />{Number(r.hours)}h</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {manager && r.status !== 'reviewed' && <button className="btn-outline btn-sm" onClick={() => setReview({ id: r.id, remarks: '' })}><CheckCircle2 className="h-4 w-4" /> Review</button>}
                </div>
              </div>
              <p className="whitespace-pre-line text-sm text-slate-700">{r.work_done}</p>
              {(r.plan_tomorrow || r.blockers) && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {r.plan_tomorrow && <div className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900"><b>Tomorrow:</b> <span className="whitespace-pre-line">{r.plan_tomorrow}</span></div>}
                  {r.blockers && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>Blockers:</b> {r.blockers}</div>}
                </div>
              )}
              {r.reviewer_remarks && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><b>Reviewer:</b> {r.reviewer_remarks}</p>}
            </div>
          )) : <div className="card"><EmptyState icon={NotebookPen} title="No reports" text={manager ? 'No reports submitted for this date.' : 'Your submitted reports will appear here.'} /></div>}
        </div>
      </div>
      <Modal open={!!review} onClose={() => setReview(null)} title="Review report" size="max-w-md" footer={<><button className="btn-outline" onClick={() => setReview(null)}>Cancel</button><button className="btn-primary" onClick={doReview}>Mark reviewed</button></>}>
        {review && <Field label="Remarks (optional)"><textarea className="input" rows={3} value={review.remarks} onChange={(e) => setReview({ ...review, remarks: e.target.value })} /></Field>}
      </Modal>
    </div>
  );
}

