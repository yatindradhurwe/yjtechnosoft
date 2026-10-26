import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Send, Mail, MailOpen, MailX, LayoutTemplate, MousePointerClick, Plus, Pencil, Trash2, Copy, Play, Pause, RefreshCw, CalendarClock, Eye, Code, Type,
  RotateCcw, Ban, Users, Save, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { cn, num, titleCase } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Tabs, Field, Spinner, PageLoader, Modal, StatusBadge, StatCard, Pagination, SearchInput, Switch, RichEditor, EmptyState, useConfirm } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';

const CATEGORIES = ['marketing', 'newsletter', 'promotion', 'festive', 'follow_up', 'announcement', 'transactional'];
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'closed'];
const PLACEHOLDERS = '{{name}} {{first_name}} {{email}} {{company}} {{company_name}} {{site_name}} {{site_url}} {{our_phone}} {{our_email}} {{year}} {{unsubscribe_url}}';
const fmtDT = (v) => (v ? new Date(String(v).replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/* ====================================================================== shared editor */
/** Live preview of the rendered email (sample recipient), debounced */
function EmailPreview({ subject, preheader, body, format, className }) {
  const [out, setOut] = useState(null);
  const t = useRef();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/marketing/preview', { subject, preheader, body, format });
        setOut(data);
      } catch {
        /* keep last preview */
      }
    }, 500);
    return () => clearTimeout(t.current);
  }, [subject, preheader, body, format]);
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50', className)}>
      <div className="border-b border-slate-200 bg-white px-4 py-2.5 text-sm">
        <p className="truncate"><span className="text-slate-400">Subject: </span><b>{out?.subject || subject || '—'}</b></p>
        {preheader && <p className="truncate text-xs text-slate-500">{preheader}</p>}
      </div>
      {out ? <iframe title="Email preview" srcDoc={out.html} sandbox="" className="h-full min-h-[520px] w-full flex-1 bg-white" /> : <div className="flex flex-1 items-center justify-center p-10"><Spinner /></div>}
      <p className="border-t border-slate-200 bg-white px-4 py-1.5 text-[11px] text-slate-400">Preview uses a sample recipient: Rahul Sharma, Sharma Traders</p>
    </div>
  );
}

function TestSend({ content }) {
  const { user } = useAuth();
  const [to, setTo] = useState(user?.email || '');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/marketing/test', { ...content, to });
      toast.success(data.message);
    } catch (e) {
      toast.error(errMsg(e), { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2 rounded-xl bg-slate-50 p-3">
      <input className="input" placeholder="Send a test to… (up to 5, comma separated)" value={to} onChange={(e) => setTo(e.target.value)} />
      <button type="button" className="btn-outline shrink-0" onClick={send} disabled={busy || !to || !content.subject || !content.body}>
        {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Send test
      </button>
    </div>
  );
}

/** Subject, preheader, format and body with live preview */
function ContentEditor({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const html = value.format === 'html';
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <Field label="Subject line" required hint="Placeholders work here too, e.g. {{first_name}}"><input className="input" value={value.subject || ''} onChange={(e) => set('subject', e.target.value)} /></Field>
        <Field label="Preview text" hint="Shown after the subject in Gmail/Outlook inbox lists"><input className="input" value={value.preheader || ''} onChange={(e) => set('preheader', e.target.value)} /></Field>
        <div className="flex items-center justify-between gap-3">
          <span className="label mb-0">Content</span>
          <Tabs
            tabs={[{ value: 'layout', label: <span className="inline-flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Rich text</span> }, { value: 'html', label: <span className="inline-flex items-center gap-1.5"><Code className="h-3.5 w-3.5" /> HTML</span> }]}
            value={value.format || 'layout'}
            onChange={(f) => set('format', f)}
          />
        </div>
        {html ? (
          <textarea className="input min-h-[420px] font-mono text-xs leading-relaxed" spellCheck={false} value={value.body || ''} onChange={(e) => set('body', e.target.value)} placeholder="<html>…</html>" />
        ) : (
          <RichEditor value={value.body || ''} onChange={(v) => set('body', v)} placeholder="Write your email…" />
        )}
        <p className="text-xs text-slate-400">
          {html ? 'Full HTML email, sent as-is. An unsubscribe link is added automatically if you do not include {{unsubscribe_url}}.' : 'Wrapped in the company email layout (logo header, address footer and unsubscribe link).'}
          <br />Placeholders: {PLACEHOLDERS}
        </p>
      </div>
      <EmailPreview {...value} className="xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)]" />
    </div>
  );
}

/* ====================================================================== templates */
export function EmailTemplates() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('');
  const { data, loading, reload } = useFetch('/admin/email_templates', { limit: 100, category });
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const save = async () => {
    if (!edit.name || !edit.subject || !edit.body) return toast.error('Name, subject and content are required');
    setSaving(true);
    try {
      const body = { name: edit.name, category: edit.category, subject: edit.subject, preheader: edit.preheader, format: edit.format, body: edit.body, status: edit.status };
      if (edit.id) await api.put(`/admin/email_templates/${edit.id}`, body);
      else await api.post('/admin/email_templates', body);
      toast.success('Template saved');
      setEdit(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const del = async (t) => {
    if (!(await confirm({ text: `Delete the template “${t.name}”?` }))) return;
    await api.delete(`/admin/email_templates/${t.id}`);
    reload();
  };
  const useInCampaign = async (t) => {
    try {
      const { data: c } = await api.post('/marketing/campaigns', { name: t.name, subject: t.subject, preheader: t.preheader, format: t.format, body: t.body, template_id: t.id, audience: { sources: [] } });
      navigate(`/admin/campaigns/${c.id}/edit`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const rows = data?.data || [];

  return (
    <div>
      <PageHeader
        title="Email Templates"
        subtitle="Reusable designs for campaigns and one-off emails. Send yourself a test before using one."
        icon={LayoutTemplate}
        actions={<button className="btn-primary" onClick={() => setEdit({ name: '', category: 'marketing', subject: '', preheader: '', format: 'layout', body: '', status: 'active' })}><Plus className="h-4 w-4" /> New template</button>}
      />
      <Tabs className="mb-5 w-fit" tabs={['', ...CATEGORIES].map((c) => ({ value: c, label: c ? titleCase(c) : 'All' }))} value={category} onChange={setCategory} />
      {loading ? <PageLoader /> : !rows.length ? (
        <EmptyState title="No templates" text="Create your first email template." icon={LayoutTemplate} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <div key={t.id} className="card flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug">{t.name}</h3>
                <span className="badge shrink-0 bg-slate-100 text-slate-600">{t.format === 'html' ? 'HTML' : 'Rich text'}</span>
              </div>
              <p className="line-clamp-2 text-sm text-slate-600">{t.subject}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="badge bg-brand-50 text-brand-700">{titleCase(t.category || 'marketing')}</span>
                {t.status !== 'active' && <StatusBadge status={t.status} />}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1 pt-4">
                <button className="btn-primary btn-sm" onClick={() => useInCampaign(t)}><Send className="h-3.5 w-3.5" /> Use in campaign</button>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Preview" onClick={() => setPreview(t)}><Eye className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Duplicate" onClick={() => setEdit({ ...t, id: undefined, name: `${t.name} (copy)` })}><Copy className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-700" title="Edit" onClick={() => setEdit({ ...t })}><Pencil className="h-4 w-4" /></button>
                <button className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => del(t)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name} size="max-w-3xl">
        {preview && (
          <div className="space-y-4">
            <EmailPreview {...preview} className="h-[65vh]" />
            <TestSend content={preview} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit template' : 'New template'}
        size="max-w-7xl"
        footer={<><button className="btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />} Save template</button></>}
      >
        {edit && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Template name" required><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Category"><select className="input" value={edit.category || 'marketing'} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
              <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            </div>
            <ContentEditor value={edit} onChange={setEdit} />
            <TestSend content={edit} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ====================================================================== campaigns list */
function Progress({ stats }) {
  if (!stats?.total) return <span className="text-xs text-slate-400">—</span>;
  const done = stats.sent + stats.failed + stats.skipped;
  return (
    <div className="w-36">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(done / stats.total) * 100}%` }} /></div>
      <p className="mt-1 text-[11px] text-slate-500">{num(stats.sent)} / {num(stats.total)} sent{stats.failed ? ` · ${stats.failed} failed` : ''}</p>
    </div>
  );
}

export function Campaigns() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch('/marketing/campaigns', { status, q });
  const rows = data?.data || [];
  const live = rows.some((r) => ['sending', 'scheduled'].includes(r.status));
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [live, reload]);

  const create = async () => {
    try {
      const { data: c } = await api.post('/marketing/campaigns', { name: 'Untitled campaign', subject: 'Hello {{first_name}}', body: '<p>Hi {{first_name}},</p><p></p><p>Regards,<br>Team {{site_name}}</p>', format: 'layout', audience: { sources: [] } });
      navigate(`/admin/campaigns/${c.id}/edit`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Email Campaigns"
        subtitle="Send bulk emails to clients, leads, subscribers, employees or any list – with scheduling, tracking and unsubscribe handling"
        icon={Send}
        actions={<>
          <Link to="/admin/email-templates" className="btn-outline"><LayoutTemplate className="h-4 w-4" /> Templates</Link>
          <button className="btn-primary" onClick={create}><Plus className="h-4 w-4" /> New campaign</button>
        </>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs className="w-fit" tabs={['', 'draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'].map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} value={status} onChange={setStatus} />
        <SearchInput value={q} onChange={setQ} className="sm:w-64" placeholder="Search campaigns…" />
      </div>
      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={(r) => navigate(r.status === 'draft' ? `/admin/campaigns/${r.id}/edit` : `/admin/campaigns/${r.id}`)}
        empty={<EmptyState title="No campaigns yet" text="Create a campaign, pick a template and an audience, then send or schedule it." icon={Send} />}
        columns={[
          { key: 'name', label: 'Campaign', render: (r) => <div className="max-w-xs"><p className="truncate font-medium">{r.name}</p><p className="truncate text-xs text-slate-500">{r.subject}</p></div> },
          { key: 'status', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.last_error && <p className="mt-1 max-w-[180px] truncate text-[11px] text-red-500" title={r.last_error}>{r.last_error}</p>}</div> },
          { key: 'progress', label: 'Progress', render: (r) => <Progress stats={r.stats} /> },
          { key: 'opened', label: 'Opened', render: (r) => (r.stats?.sent ? pct(r.stats.opened, r.stats.sent) : '—') },
          { key: 'clicked', label: 'Clicked', render: (r) => (r.stats?.sent ? pct(r.stats.clicked, r.stats.sent) : '—') },
          { key: 'when', label: 'Sent / scheduled', render: (r) => <span className="text-sm text-slate-600">{fmtDT(r.completed_at || r.started_at || r.scheduled_at)}</span> },
        ]}
      />
    </div>
  );
}

/* ====================================================================== campaign builder */
function AudiencePicker({ value, onChange }) {
  const { data: sources } = useFetch('/marketing/sources');
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const sel = value.sources || [];
  const toggle = (k) => onChange({ ...value, sources: sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k] });
  const leadStatus = value.lead_status || [];
  useEffect(() => setCheck(null), [value]);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/marketing/audience/preview', { audience: value });
      setCheck(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {(sources || []).map((s) => (
          <label key={s.value} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm transition', sel.includes(s.value) ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300')}>
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={sel.includes(s.value)} onChange={() => toggle(s.value)} />
            {s.label}
          </label>
        ))}
      </div>
      {sel.includes('leads') && (
        <Field label="Only leads with status" hint="Leave all unticked to include every lead">
          <div className="flex flex-wrap gap-3">
            {LEAD_STATUSES.map((s) => (
              <label key={s} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-brand-600" checked={leadStatus.includes(s)} onChange={() => onChange({ ...value, lead_status: leadStatus.includes(s) ? leadStatus.filter((x) => x !== s) : [...leadStatus, s] })} />
                {titleCase(s)}
              </label>
            ))}
          </div>
        </Field>
      )}
      {sel.includes('custom') && (
        <Field label="Email list" hint="One per line: email, or Name <email>, or Name, email. You can paste straight from Excel.">
          <textarea className="input min-h-[140px] font-mono text-xs" value={value.custom || ''} onChange={(e) => onChange({ ...value, custom: e.target.value })} placeholder={'rahul@example.com\nPriya Verma <priya@example.com>\nAman Gupta, aman@example.com'} />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-outline" onClick={run} disabled={busy || !sel.length}>{busy ? <Spinner className="h-4 w-4" /> : <Users className="h-4 w-4" />} Count recipients</button>
        {check && (
          <p className="text-sm">
            <b className="text-brand-700">{num(check.total)}</b> unique recipients
            <span className="text-slate-500"> ({Object.entries(check.by_source).map(([k, v]) => `${titleCase(k)} ${v}`).join(', ')}{check.excluded ? `; ${check.excluded} unsubscribed excluded` : ''})</span>
          </p>
        )}
      </div>
      {check?.sample?.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-xl border border-slate-200 text-xs thin-scroll">
          <table className="w-full"><tbody>
            {check.sample.map((r) => <tr key={r.email} className="border-b border-slate-100 last:border-0"><td className="px-3 py-1.5">{r.name || '—'}</td><td className="px-3 py-1.5 text-slate-600">{r.email}</td><td className="px-3 py-1.5 text-slate-400">{titleCase(r.source)}</td></tr>)}
          </tbody></table>
          {check.total > check.sample.length && <p className="px-3 py-1.5 text-slate-400">…and {num(check.total - check.sample.length)} more</p>}
        </div>
      )}
    </div>
  );
}

export function CampaignForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useFetch(`/marketing/campaigns/${id}`);
  const { data: templates } = useFetch('/admin/email_templates', { limit: 100, status: 'active' });
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  const [launch, setLaunch] = useState(null);
  const confirm = useConfirm();
  useEffect(() => { if (data) setC({ ...data, audience: data.audience || { sources: [] } }); }, [data]);
  if (loading || !c) return <PageLoader />;
  const editable = ['draft', 'paused'].includes(c.status);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));

  const save = async (quiet) => {
    setSaving(true);
    try {
      const { data: saved } = await api.put(`/marketing/campaigns/${id}`, c);
      if (!quiet) toast.success('Campaign saved');
      return saved;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    } finally {
      setSaving(false);
    }
  };
  const applyTemplate = async (tid) => {
    const t = templates?.data?.find((x) => String(x.id) === String(tid));
    if (!t) return;
    if (c.body && c.body.length > 120 && !(await confirm({ title: 'Replace content?', text: `Replace the subject and content with “${t.name}”?`, confirmText: 'Replace', danger: false }))) return;
    setC((x) => ({ ...x, template_id: t.id, subject: t.subject, preheader: t.preheader, format: t.format, body: t.body }));
  };
  const doLaunch = async () => {
    if (!(await save(true))) return;
    try {
      const { data: r } = await api.post(`/marketing/campaigns/${id}/launch`, { scheduled_at: launch.mode === 'later' ? launch.at : null });
      toast.success(r.message);
      navigate(`/admin/campaigns/${id}`);
    } catch (e) {
      toast.error(errMsg(e), { duration: 8000 });
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={c.status === 'draft' ? 'Build campaign' : 'Edit campaign'}
        subtitle={c.status === 'paused' ? 'Paused – changes apply to emails that have not gone out yet. The audience can no longer be changed.' : 'Write the email, choose who gets it, send yourself a test, then send or schedule.'}
        icon={Send}
        actions={<>
          <Link to={c.status === 'draft' ? '/admin/campaigns' : `/admin/campaigns/${id}`} className="btn-outline"><ArrowLeft className="h-4 w-4" /> Back</Link>
          <button className="btn-outline" onClick={() => save()} disabled={saving || !editable}><Save className="h-4 w-4" /> Save {c.status === 'draft' ? 'draft' : ''}</button>
          {c.status === 'draft' && <button className="btn-primary" onClick={() => setLaunch({ mode: 'now', at: '' })}><Send className="h-4 w-4" /> Send / schedule</button>}
        </>}
      />

      <div className="space-y-6">
        <section className="card grid gap-4 p-6 sm:grid-cols-3">
          <Field label="Campaign name" hint="Internal – recipients don't see it" required><input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Start from template">
            <select className="input" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">Choose a template…</option>
              {templates?.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Reply-to email" hint="Optional. Defaults to the setting."><input className="input" value={c.reply_to || ''} onChange={(e) => set('reply_to', e.target.value)} /></Field>
        </section>

        <section className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Mail className="h-5 w-5 text-brand-600" /> Email</h3>
          <ContentEditor value={c} onChange={setC} />
          <div className="mt-4"><TestSend content={c} /></div>
        </section>

        <section className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-brand-600" /> Audience</h3>
          {c.status === 'draft' ? <AudiencePicker value={c.audience} onChange={(a) => set('audience', a)} /> : <p className="text-sm text-slate-500">The recipient list was fixed when the campaign was launched.</p>}
          <p className="mt-4 text-xs text-slate-400">Duplicates, invalid addresses and anyone on the do-not-email list are removed automatically.</p>
        </section>

        <section className="card flex flex-wrap gap-6 p-6">
          <Switch checked={!!Number(c.track_opens)} onChange={(v) => set('track_opens', v ? 1 : 0)} label="Track opens" />
          <Switch checked={!!Number(c.track_clicks)} onChange={(v) => set('track_clicks', v ? 1 : 0)} label="Track link clicks" />
        </section>
      </div>

      <Modal
        open={!!launch}
        onClose={() => setLaunch(null)}
        title="Send campaign"
        size="max-w-md"
        footer={<><button className="btn-outline" onClick={() => setLaunch(null)}>Cancel</button><button className="btn-primary" onClick={doLaunch} disabled={launch?.mode === 'later' && !launch.at}>{launch?.mode === 'later' ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />} {launch?.mode === 'later' ? 'Schedule' : 'Send now'}</button></>}
      >
        {launch && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[['now', 'Send now'], ['later', 'Schedule']].map(([m, l]) => (
                <button key={m} type="button" onClick={() => setLaunch({ ...launch, mode: m })} className={cn('rounded-xl border p-3 text-sm font-medium', launch.mode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200')}>{l}</button>
              ))}
            </div>
            {launch.mode === 'later' && <Field label="Send at"><input type="datetime-local" className="input" value={launch.at} onChange={(e) => setLaunch({ ...launch, at: e.target.value })} /></Field>}
            <p className="text-sm text-slate-500">Emails go out in batches of about {c.rate_per_minute || 20} per minute (Settings › Email). You can pause or cancel at any time.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ====================================================================== campaign report */
export function CampaignView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: c, loading, reload } = useFetch(`/marketing/campaigns/${id}`);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const { data: recips, loading: rLoading, reload: reloadR } = useFetch(`/marketing/campaigns/${id}/recipients`, { status: filter, page, q });
  const [showPreview, setShowPreview] = useState(false);
  const confirm = useConfirm();
  const live = c && ['sending', 'scheduled'].includes(c.status);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { reload(); reloadR(); }, 10000);
    return () => clearInterval(t);
  }, [live, reload, reloadR]);
  if (loading || !c) return <PageLoader />;
  const st = c.stats || { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0, opened: 0, clicked: 0, unsubscribed: 0 };

  const act = async (action, confirmOpts) => {
    if (confirmOpts && !(await confirm(confirmOpts))) return;
    try {
      const { data } = await api.post(`/marketing/campaigns/${id}/${action}`);
      if (action === 'duplicate') return navigate(`/admin/campaigns/${data.id}/edit`);
      if (action === 'unschedule') return navigate(`/admin/campaigns/${id}/edit`);
      toast.success(data.message || 'Done');
      reload();
      reloadR();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const del = async () => {
    if (!(await confirm({ text: 'Delete this campaign and its report?' }))) return;
    try {
      await api.delete(`/marketing/campaigns/${id}`);
      navigate('/admin/campaigns');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={c.status} /> {c.subject}</span>}
        icon={Send}
        actions={<>
          <Link to="/admin/campaigns" className="btn-outline"><ArrowLeft className="h-4 w-4" /></Link>
          <button className="btn-outline" onClick={() => setShowPreview(true)}><Eye className="h-4 w-4" /> Preview</button>
          {['scheduled', 'sending'].includes(c.status) && <button className="btn-outline" onClick={() => act('pause')}><Pause className="h-4 w-4" /> Pause</button>}
          {c.status === 'paused' && <><Link to={`/admin/campaigns/${id}/edit`} className="btn-outline"><Pencil className="h-4 w-4" /> Edit</Link><button className="btn-primary" onClick={() => act('resume')}><Play className="h-4 w-4" /> Resume</button></>}
          {c.status === 'scheduled' && !c.started_at && <button className="btn-outline" onClick={() => act('unschedule', { title: 'Unschedule?', text: 'Move this campaign back to draft? You can edit it and schedule again.', confirmText: 'Unschedule', danger: false })}><RotateCcw className="h-4 w-4" /> Unschedule</button>}
          {st.failed > 0 && ['sent', 'paused', 'sending'].includes(c.status) && <button className="btn-outline" onClick={() => act('retry-failed')}><RefreshCw className="h-4 w-4" /> Retry {st.failed} failed</button>}
          {['scheduled', 'sending', 'paused'].includes(c.status) && <button className="btn-outline text-red-600" onClick={() => act('cancel', { title: 'Cancel campaign?', text: 'Emails that have not gone out yet will not be sent. This cannot be undone.', confirmText: 'Cancel campaign' })}><Ban className="h-4 w-4" /> Cancel</button>}
          <button className="btn-outline" onClick={() => act('duplicate')}><Copy className="h-4 w-4" /> Duplicate</button>
          {['sent', 'cancelled', 'paused', 'draft'].includes(c.status) && <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={del}><Trash2 className="h-4 w-4" /></button>}
        </>}
      />

      {c.last_error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><b>Paused because the mail server returned an error.</b> Check Settings › Email, then resume.<p className="mt-1 font-mono text-xs">{c.last_error}</p></div>
        </div>
      )}
      {c.status === 'scheduled' && <p className="mb-5 rounded-xl bg-sky-50 p-4 text-sm text-sky-800"><CalendarClock className="mr-1.5 inline h-4 w-4" /> Scheduled for <b>{fmtDT(c.scheduled_at)}</b> to {num(st.total)} recipients.</p>}
      {c.status === 'sending' && <p className="mb-5 rounded-xl bg-brand-50 p-4 text-sm text-brand-800"><Spinner className="mr-1.5 inline h-4 w-4" /> Sending about {c.rate_per_minute} emails per minute – {num(st.pending)} remaining. This page refreshes automatically.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Delivered" value={`${num(st.sent)} / ${num(st.total)}`} icon={Send} hint={st.pending ? `${num(st.pending)} waiting` : `Finished ${fmtDT(c.completed_at)}`} />
        <StatCard label="Opened" value={pct(st.opened, st.sent)} icon={MailOpen} tone="green" hint={`${num(st.opened)} people${c.track_opens ? '' : ' · tracking off'}`} />
        <StatCard label="Clicked" value={pct(st.clicked, st.sent)} icon={MousePointerClick} tone="violet" hint={`${num(st.clicked)} people${c.track_clicks ? '' : ' · tracking off'}`} />
        <StatCard label="Failed / unsubscribed" value={`${num(st.failed)} / ${num(st.unsubscribed)}`} icon={MailX} tone={st.failed ? 'red' : 'amber'} hint={st.skipped ? `${num(st.skipped)} skipped` : 'Bounces and opt-outs'} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs className="w-fit" tabs={['', 'pending', 'sent', 'opened', 'clicked', 'failed', 'skipped', 'unsubscribed'].map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} className="sm:w-64" placeholder="Search recipients…" />
      </div>
      <DataTable
        loading={rLoading}
        rows={recips?.data}
        columns={[
          { key: 'email', label: 'Recipient', render: (r) => <div><p className="font-medium">{r.name || '—'}</p><p className="text-xs text-slate-500">{r.email}</p></div> },
          { key: 'source', label: 'From', render: (r) => titleCase(r.source || '') },
          { key: 'status', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.error && <p className="mt-1 max-w-xs truncate text-[11px] text-red-500" title={r.error}>{r.error}</p>}</div> },
          { key: 'sent_at', label: 'Sent', render: (r) => <span className="text-sm">{fmtDT(r.sent_at)}</span> },
          { key: 'engagement', label: 'Engagement', render: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.opened_at && <span className="badge bg-emerald-50 text-emerald-700" title={fmtDT(r.opened_at)}>Opened{r.open_count > 1 ? ` ×${r.open_count}` : ''}</span>}
              {r.clicked_at && <span className="badge bg-violet-50 text-violet-700" title={fmtDT(r.clicked_at)}>Clicked{r.click_count > 1 ? ` ×${r.click_count}` : ''}</span>}
              {r.unsubscribed_at && <span className="badge bg-slate-100 text-slate-500">Unsubscribed</span>}
            </div>
          ) },
        ]}
        footer={<Pagination page={page} total={recips?.total} limit={recips?.limit || 50} onChange={setPage} />}
      />

      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Email preview" size="max-w-3xl">
        {showPreview && <EmailPreview subject={c.subject} preheader={c.preheader} body={c.body} format={c.format} className="h-[70vh]" />}
      </Modal>
    </div>
  );
}

/* ====================================================================== do-not-email list */
export function Unsubscribes() {
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch('/marketing/unsubscribes', { q });
  const [adding, setAdding] = useState(null);
  const confirm = useConfirm();
  const remove = async (r) => {
    if (!(await confirm({ title: 'Resubscribe?', text: `Allow campaign emails to ${r.email} again? Only do this if they asked to be added back.`, confirmText: 'Allow', danger: false }))) return;
    await api.delete(`/marketing/unsubscribes/${encodeURIComponent(r.email)}`);
    reload();
  };
  const add = async () => {
    try {
      const { data: r } = await api.post('/marketing/unsubscribes', { emails: adding });
      toast.success(r.message);
      setAdding(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div>
      <PageHeader
        title="Do-not-email list"
        subtitle="People who unsubscribed (or you blocked). Campaigns always skip these addresses."
        icon={MailX}
        actions={<button className="btn-primary" onClick={() => setAdding('')}><Plus className="h-4 w-4" /> Add addresses</button>}
      />
      <SearchInput value={q} onChange={setQ} className="mb-4 sm:w-72" placeholder="Search email…" />
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'email', label: 'Email' },
          { key: 'campaign_name', label: 'Unsubscribed from', render: (r) => r.campaign_name || <span className="text-slate-400">Added manually</span> },
          { key: 'created_at', label: 'When', render: (r) => fmtDT(r.created_at) },
          { key: 'a', label: '', render: (r) => <div className="text-right"><button className="btn-outline btn-sm" onClick={() => remove(r)}>Remove</button></div> },
        ]}
      />
      <Modal open={adding !== null} onClose={() => setAdding(null)} title="Add to do-not-email list" size="max-w-lg" footer={<><button className="btn-outline" onClick={() => setAdding(null)}>Cancel</button><button className="btn-primary" onClick={add}>Add</button></>}>
        <Field label="Email addresses" hint="Separate with commas, spaces or new lines"><textarea className="input min-h-[140px]" value={adding || ''} onChange={(e) => setAdding(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
