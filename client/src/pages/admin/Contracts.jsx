import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileSignature, Plus, Eye, Trash2, Wand2, ArrowLeft, RefreshCcw, ShieldCheck, Upload, FolderLock, FileText, FileImage, FileSpreadsheet, File, Download, FolderKanban,
  ClipboardList, Receipt, FileCheck2, Calendar, Users, MapPin, UserPlus, X,
} from 'lucide-react';
import api, { errMsg, openPdf } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { asset, cn, fmtDate, money, titleCase, today } from '../../lib/utils';
import { PageHeader, SearchInput, StatusBadge, Spinner, Modal, Field, PageLoader, RichEditor, useConfirm, EmptyState, FileUpload, StatCard, Avatar, Tabs } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';
import ShareMenu from '../../components/ui/ShareMenu';
import ResourcePage from '../../components/admin/ResourcePage';
import { useAuth } from '../../context/AuthContext';

const CONTRACT_TYPES = ['service_agreement', 'website_development', 'software_development', 'amc', 'hosting', 'nda', 'freelancer', 'mou', 'custom'];
const CONTRACT_STATUSES = ['draft', 'sent', 'accepted', 'signed', 'active', 'expired', 'terminated'];
const KNOWN = ['company', 'company_address', 'company_phone', 'company_email', 'company_gstin', 'company_cin', 'signatory', 'signatory_designation', 'jurisdiction', 'agreement_date', 'client_name', 'contact_person', 'client_address', 'client_email', 'client_phone', 'client_gstin', 'project_name', 'project_description', 'start_date', 'end_date', 'contract_value', 'contract_value_words'];
const HINTS = { scope_of_work: 'Design & development of a 10-page responsive website with admin panel', deliverables: 'Website, admin panel, source code, training', payment_terms: '50% advance, 50% on delivery', support_period: '6 months', services: 'Business hosting (10 GB), .in domain, 5 email accounts, SSL', response_time: '4 working hours', purpose: 'evaluating a software development engagement', nda_period: '2 years', timeline: '45 days' };

/* ====================================================================== Contracts list */
export function Contracts() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useFetch('/contracts', { q, status });
  const confirm = useConfirm();
  const rows = data?.data || [];
  const del = async (r) => {
    if (!(await confirm({ text: `Delete agreement ${r.contract_no}?` }))) return;
    await api.delete(`/contracts/${r.id}`);
    reload();
  };
  const activeValue = rows.filter((r) => ['accepted', 'signed', 'active'].includes(r.status)).reduce((a, r) => a + Number(r.contract_value), 0);
  return (
    <div>
      <PageHeader
        title="Contracts & Agreements"
        subtitle="Create agreements from templates, share for online acceptance and keep signed copies"
        icon={FileSignature}
        actions={<><Link to="/admin/contract-templates" className="btn-outline">Templates</Link><Link to="/admin/contracts/new" className="btn-primary"><Plus className="h-4 w-4" /> New agreement</Link></>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total agreements" value={rows.length} icon={FileSignature} />
        <StatCard label="Awaiting acceptance" value={rows.filter((r) => ['draft', 'sent'].includes(r.status)).length} icon={Calendar} tone="amber" />
        <StatCard label="Active / signed" value={rows.filter((r) => ['accepted', 'signed', 'active'].includes(r.status)).length} icon={ShieldCheck} tone="green" hint={money(activeValue, 0)} />
        <StatCard label="Ending in 30 days" value={rows.filter((r) => r.days_left !== null && r.days_left >= 0 && r.days_left <= 30 && r.status !== 'expired').length} icon={RefreshCcw} tone="red" />
      </div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput className="lg:w-72" value={q} onChange={setQ} />
        <Tabs tabs={['', ...CONTRACT_STATUSES].map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} value={status} onChange={setStatus} />
      </div>
      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={(r) => navigate(`/admin/contracts/${r.id}`)}
        columns={[
          { key: 'contract_no', label: 'Agreement', render: (r) => <div><p className="font-semibold text-brand-700">{r.contract_no}</p><p className="text-xs text-slate-500">{r.title}</p></div> },
          { key: 'party_name', label: 'Party', render: (r) => <div><p className="font-medium">{r.party_name}</p>{r.project_name && <p className="text-xs text-slate-500">{r.project_name}</p>}</div> },
          { key: 'period', label: 'Period', render: (r) => (r.start_date ? <div className="text-xs"><p>{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</p>{r.days_left !== null && r.days_left <= 30 && r.days_left >= 0 && <p className="font-semibold text-amber-600">{r.days_left} days left</p>}</div> : '—') },
          { key: 'contract_value', label: 'Value', render: (r) => (Number(r.contract_value) ? money(r.contract_value, 0) : '—') },
          { key: 'status', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.accepted_by && <p className="mt-1 text-[11px] text-emerald-600">by {r.accepted_by}</p>}</div> },
          { key: 'a', label: '', render: (r) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => openPdf('contract', r.id)}><Eye className="h-4 w-4" /></button><ShareMenu type="contract" id={r.id} compact onSent={reload} /><button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(r)}><Trash2 className="h-4 w-4" /></button></div> },
        ]}
        empty={<EmptyState icon={FileSignature} title="No agreements yet" text="Create website, software, AMC, hosting, NDA and other agreements from ready templates." action={<Link to="/admin/contracts/new" className="btn-primary">New agreement</Link>} />}
      />
    </div>
  );
}

/* ====================================================================== Contract form */
export function ContractForm() {
  const { id } = useParams();
  const editing = id && id !== 'new';
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: templates } = useFetch('/admin/contract_templates', { all: 1, status: 'active' });
  const { data: clients } = useFetch('/admin/clients', { all: 1 });
  const { data: projects } = useFetch('/admin/projects', { all: 1 });
  const [f, setF] = useState(null);
  const [base, setBase] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get(`/contracts/${id}`).then(({ data }) => {
      const ds = (k) => (data[k] ? String(data[k]).slice(0, 10) : '');
      setF({ ...data, agreement_date: ds('agreement_date'), start_date: ds('start_date'), end_date: ds('end_date'), client_id: data.client_id || '', project_id: data.project_id || '', template_id: data.template_id || '' });
    });
  useEffect(() => {
    if (editing) load();
    else
      setF({
        template_id: '', type: 'service_agreement', title: '', client_id: params.get('client') || '', project_id: params.get('project') || '', party_name: '', party_representative: '',
        party_address: '', party_email: '', party_phone: '', agreement_date: today(), start_date: today(), end_date: '', contract_value: '', body: '', status: 'draft', signed_file: '', notes: '', data: {},
      });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // prefill party details from client / project
  useEffect(() => {
    if (!f || editing) return;
    api.get('/contracts/placeholders', { params: { client_id: f.client_id || undefined, project_id: f.project_id || undefined } }).then(({ data }) => {
      setBase(data);
      setF((x) => ({
        ...x,
        party_name: data.client_name || x.party_name,
        party_representative: data.contact_person || x.party_representative,
        party_address: data.client_address || x.party_address,
        party_email: data.client_email || x.party_email,
        party_phone: data.client_phone || x.party_phone,
        client_id: x.client_id || (projects?.data?.find((p) => String(p.id) === String(x.project_id))?.client_id ?? x.client_id),
      }));
    });
  }, [f?.client_id, f?.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tpl = templates?.data?.find((t) => String(t.id) === String(f?.template_id));
  const extraKeys = useMemo(() => {
    if (!tpl) return [];
    const found = new Set();
    `${tpl.title} ${tpl.body}`.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => found.add(k));
    return [...found].filter((k) => !KNOWN.includes(k));
  }, [tpl]);

  if (!f) return <PageLoader />;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const projectOpts = (projects?.data || []).filter((p) => !f.client_id || String(p.client_id) === String(f.client_id));

  const chooseTemplate = (tid) => {
    const t = templates?.data?.find((x) => String(x.id) === String(tid));
    setF((x) => ({ ...x, template_id: tid, type: t?.type || x.type, title: t?.title || x.title }));
  };
  const generate = async () => {
    if (!f.template_id) return toast.error('Choose a template first');
    try {
      const { data } = await api.post('/contracts/render', {
        template_id: f.template_id, client_id: f.client_id || undefined, project_id: f.project_id || undefined, party_name: f.party_name,
        contract_value: f.contract_value, start_date: f.start_date, end_date: f.end_date, agreement_date: f.agreement_date, data: f.data,
      });
      setF((x) => ({ ...x, title: data.title, body: data.body }));
      toast.success('Agreement generated – review and edit the text');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, client_id: f.client_id || null, project_id: f.project_id || null, template_id: f.template_id || null, start_date: f.start_date || null, end_date: f.end_date || null };
      const { data } = editing ? await api.put(`/contracts/${id}`, body) : await api.post('/contracts', body);
      toast.success('Agreement saved');
      if (!editing) navigate(`/admin/contracts/${data.id}`, { replace: true });
      else load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const setStatus = async (status) => {
    await api.patch(`/contracts/${id}/status`, { status });
    toast.success('Status updated');
    load();
  };
  const renew = async () => {
    if (!(await confirm({ title: 'Renew agreement?', text: 'A new draft agreement will be created for the next period with the same terms.', confirmText: 'Create renewal', danger: false }))) return;
    const { data } = await api.post(`/contracts/${id}/renew`);
    toast.success(data.message);
    navigate(`/admin/contracts/${data.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/contracts" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Contracts</Link>
      <PageHeader
        title={editing ? f.contract_no : 'New agreement'}
        subtitle={editing ? f.title : 'Pick a client/project and a template – details fill in automatically'}
        actions={
          <>
            {editing && <StatusBadge status={f.status} className="self-center !text-sm" />}
            {editing && <button className="btn-outline" onClick={() => openPdf('contract', id)}><Eye className="h-4 w-4" /> PDF</button>}
            {editing && <ShareMenu type="contract" id={id} onSent={load} />}
            <button className="btn-dark" disabled={saving} onClick={save}>{saving && <Spinner className="h-4 w-4 text-white" />} Save</button>
          </>
        }
      />
      {editing && f.accepted_by && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck className="h-5 w-5" /> Accepted online by <b>{f.accepted_by}</b> on {new Date(String(f.accepted_at).replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} (IP {f.accepted_ip})
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <h3 className="font-semibold">1. Party</h3>
            <Field label="Client">
              <select className="input" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value, project_id: '' })}>
                <option value="">— Other party (manual) —</option>
                {clients?.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Project">
              <select className="input" value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
                <option value="">—</option>
                {projectOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Party name" required><input className="input" value={f.party_name} onChange={(e) => set('party_name', e.target.value)} /></Field>
            <Field label="Represented by"><input className="input" value={f.party_representative || ''} onChange={(e) => set('party_representative', e.target.value)} placeholder="Name & designation" /></Field>
            <Field label="Address"><textarea className="input" rows={2} value={f.party_address || ''} onChange={(e) => set('party_address', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email"><input className="input" value={f.party_email || ''} onChange={(e) => set('party_email', e.target.value)} /></Field>
              <Field label="Phone"><input className="input" value={f.party_phone || ''} onChange={(e) => set('party_phone', e.target.value)} /></Field>
            </div>
          </div>
          <div className="card space-y-4 p-6">
            <h3 className="font-semibold">2. Terms</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Agreement date"><input type="date" className="input" value={f.agreement_date} onChange={(e) => set('agreement_date', e.target.value)} /></Field>
              <Field label="Value (₹)"><input type="number" className="input" value={f.contract_value} onChange={(e) => set('contract_value', e.target.value)} /></Field>
              <Field label="Start date"><input type="date" className="input" value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
              <Field label="End date"><input type="date" className="input" value={f.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
            </div>
            <Field label="Template">
              <select className="input" value={f.template_id} onChange={(e) => chooseTemplate(e.target.value)}>
                <option value="">— Choose template —</option>
                {templates?.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            {extraKeys.map((k) => (
              <Field key={k} label={titleCase(k)}>
                <textarea rows={k === 'scope_of_work' || k === 'services' ? 3 : 1} className="input" placeholder={HINTS[k] || ''} value={f.data?.[k] ?? ''} onChange={(e) => setF({ ...f, data: { ...f.data, [k]: e.target.value } })} />
              </Field>
            ))}
            <button className="btn-dark w-full" onClick={generate}><Wand2 className="h-4 w-4" /> Generate agreement</button>
          </div>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <div className="card space-y-4 p-6">
            <h3 className="font-semibold">3. Agreement text</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Heading" className="sm:col-span-2"><input className="input font-semibold" value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
              <Field label="Type"><select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}>{CONTRACT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
            </div>
            <RichEditor value={f.body} onChange={(v) => setF((x) => ({ ...x, body: v }))} placeholder="Choose a template and click “Generate agreement”, or write the agreement…" />
            <p className="text-xs text-slate-500">Printed on your letterhead with an agreement number, a parties box, both signature blocks, page numbers and the online-acceptance stamp.</p>
          </div>
          {editing && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="card space-y-3 p-6">
                <h3 className="font-semibold">Signed copy</h3>
                <p className="text-xs text-slate-500">Upload the scanned, signed agreement. Status changes to “signed”.</p>
                <FileUpload value={f.signed_file} onChange={(v) => set('signed_file', v)} folder="vault" accept=".pdf,.jpg,.jpeg,.png" />
                <Field label="Internal notes"><textarea className="input" rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
                <button className="btn-primary btn-sm" onClick={save}>Save</button>
              </div>
              <div className="card space-y-2 p-6">
                <h3 className="mb-2 font-semibold">Actions</h3>
                {['sent', 'signed', 'active', 'terminated'].filter((s) => s !== f.status).map((s) => (
                  <button key={s} className="btn-outline w-full" onClick={() => setStatus(s)}>Mark as {s}</button>
                ))}
                <button className="btn-outline w-full" onClick={renew}><RefreshCcw className="h-4 w-4" /> Renew for next period</button>
                <Link to={`/admin/vault?contract=${id}`} className="btn-outline w-full"><FolderLock className="h-4 w-4" /> Related documents ({f.documents?.length || 0})</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ContractTemplates() {
  return (
    <ResourcePage
      resource="contract_templates"
      title="Agreement Templates"
      subtitle="Reusable agreement formats. Placeholders like {{client_name}} {{project_name}} {{contract_value}} {{start_date}} fill automatically; any other {{field}} becomes an input."
      columns={[{ key: 'name', label: 'Template' }, { key: 'type', label: 'Type', render: (r) => titleCase(r.type) }, { key: 'title', label: 'Heading' }, { key: 'status', label: 'Status' }]}
      fields={[
        { name: 'name', label: 'Template name', required: true }, { name: 'type', label: 'Type', type: 'select', options: CONTRACT_TYPES, noEmpty: true },
        { name: 'title', label: 'Agreement heading', required: true, span: 2 },
        { name: 'body', label: 'Agreement text', type: 'rich', span: 2, required: true, hint: 'Auto: {{company}} {{company_address}} {{client_name}} {{client_address}} {{contact_person}} {{project_name}} {{agreement_date}} {{start_date}} {{end_date}} {{contract_value}} {{contract_value_words}} {{jurisdiction}}' },
        { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], noEmpty: true },
      ]}
      defaults={{ type: 'service_agreement', status: 'active' }}
      modalSize="max-w-4xl"
    />
  );
}

/* ====================================================================== Documents vault */
const CATEGORIES = ['contract', 'agreement', 'proposal', 'purchase_order', 'work_order', 'invoice', 'legal', 'certificate', 'kyc', 'policy', 'credentials', 'other'];
const fileIcon = (f = '') => (/\.pdf$/i.test(f) ? FileText : /\.(png|jpe?g|webp|gif)$/i.test(f) ? FileImage : /\.(xlsx?|csv)$/i.test(f) ? FileSpreadsheet : File);

export function Vault() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [project, setProject] = useState(params.get('project') || '');
  const contract = params.get('contract') || '';
  const { data, loading, reload } = useFetch('/admin/vault_documents', { q, category, client_id: client, project_id: project, contract_id: contract, limit: 100 });
  const { data: clients } = useFetch('/admin/clients', { all: 1 });
  const { data: projects } = useFetch('/admin/projects', { all: 1 });
  const [edit, setEdit] = useState(null);
  const confirm = useConfirm();

  const save = async () => {
    if (!edit.title || !edit.file) return toast.error('Title and file are required');
    try {
      const body = { ...edit, client_id: edit.client_id || null, project_id: edit.project_id || null, contract_id: edit.contract_id || null, document_date: edit.document_date || null, expiry_date: edit.expiry_date || null };
      if (edit.id) await api.put(`/admin/vault_documents/${edit.id}`, body);
      else await api.post('/admin/vault_documents', body);
      toast.success('Document saved');
      setEdit(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const del = async (d) => {
    if (!(await confirm({ text: `Delete “${d.title}” from the vault?` }))) return;
    await api.delete(`/admin/vault_documents/${d.id}`);
    reload();
  };
  const rows = data?.data || [];

  return (
    <div>
      <PageHeader
        title="Documents Vault"
        subtitle="Secure storage for agreements, work orders, proposals, KYC, certificates and more – private to staff, shareable by link"
        icon={FolderLock}
        actions={<button className="btn-primary" onClick={() => setEdit({ title: '', category: 'agreement', file: '', file_name: '', client_id: client, project_id: project, contract_id: contract, document_date: today(), expiry_date: '', tags: '', notes: '' })}><Upload className="h-4 w-4" /> Upload document</button>}
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <SearchInput className="lg:w-64" value={q} onChange={setQ} />
        <select className="input lg:w-48" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select>
        <select className="input lg:w-56" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{clients?.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input lg:w-56" value={project} onChange={(e) => setProject(e.target.value)}><option value="">All projects</option>{projects?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      {contract && <p className="mb-4 rounded-xl bg-brand-50 px-4 py-2 text-sm text-brand-800">Showing documents linked to agreement #{contract}. <Link to="/admin/vault" className="font-semibold underline">Show all</Link></p>}
      {loading ? <PageLoader /> : rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => {
            const I = fileIcon(d.file);
            const expiring = d.days_left !== null && d.days_left !== undefined && d.days_left <= 30;
            return (
              <div key={d.id} className="card flex flex-col p-5 transition hover:shadow-soft">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-brand-50 p-3 text-brand-600"><I className="h-6 w-6" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy-900" title={d.title}>{d.title}</p>
                    <p className="text-xs text-slate-500">{titleCase(d.category)} · {fmtDate(d.document_date || d.created_at)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  {d.client_name && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{d.client_name}</span>}
                  {d.project_name && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{d.project_name}</span>}
                  {d.contract_no && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{d.contract_no}</span>}
                  {d.expiry_date && <span className={cn('rounded-full px-2 py-0.5', expiring ? 'bg-red-50 font-semibold text-red-700' : 'bg-emerald-50 text-emerald-700')}>{d.days_left < 0 ? 'Expired' : `Expires ${fmtDate(d.expiry_date)}`}</span>}
                  {d.tags && d.tags.split(',').map((t) => <span key={t} className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-500">#{t.trim()}</span>)}
                </div>
                {d.notes && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{d.notes}</p>}
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-400">by {d.uploaded_by_name || '—'}</span>
                  <div className="flex gap-1">
                    <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View" onClick={() => openPdf('vault', d.id)}><Eye className="h-4 w-4" /></button>
                    <a className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Download" href={asset(d.file)} download><Download className="h-4 w-4" /></a>
                    <ShareMenu type="vault" id={d.id} compact />
                    <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setEdit({ ...d, document_date: d.document_date?.slice(0, 10) || '', expiry_date: d.expiry_date?.slice(0, 10) || '', client_id: d.client_id || '', project_id: d.project_id || '', contract_id: d.contract_id || '' })}><FileCheck2 className="h-4 w-4" /></button>
                    <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => del(d)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card"><EmptyState icon={FolderLock} title="The vault is empty" text="Upload agreements, signed work orders, proposals, certificates, KYC and other important documents." /></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit document' : 'Upload to vault'} size="max-w-2xl" footer={<><button className="btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="File" required className="sm:col-span-2"><FileUpload value={edit.file} onChange={(v) => setEdit((x) => ({ ...x, file: v, file_name: x.file_name || (v ? v.split('/').pop().replace(/^\d+-\d+-/, '') : '') }))} folder="vault" /></Field>
            <Field label="Title" required className="sm:col-span-2"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Signed work order – Court module" /></Field>
            <Field label="Category"><select className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
            <Field label="Client"><select className="input" value={edit.client_id || ''} onChange={(e) => setEdit({ ...edit, client_id: e.target.value })}><option value="">—</option>{clients?.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Project"><select className="input" value={edit.project_id || ''} onChange={(e) => setEdit({ ...edit, project_id: e.target.value })}><option value="">—</option>{projects?.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Agreement ID (optional)"><input className="input" value={edit.contract_id || ''} onChange={(e) => setEdit({ ...edit, contract_id: e.target.value })} /></Field>
            <Field label="Document date"><input type="date" className="input" value={edit.document_date || ''} onChange={(e) => setEdit({ ...edit, document_date: e.target.value })} /></Field>
            <Field label="Expiry / renewal date"><input type="date" className="input" value={edit.expiry_date || ''} onChange={(e) => setEdit({ ...edit, expiry_date: e.target.value })} /></Field>
            <Field label="Tags (comma separated)" className="sm:col-span-2"><input className="input" value={edit.tags || ''} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ====================================================================== Project detail */
const GEO_TONE = { inside: 'bg-emerald-50 text-emerald-700', outside: 'bg-red-50 text-red-700', wfh: 'bg-sky-50 text-sky-700', no_location: 'bg-amber-50 text-amber-700', no_site: 'bg-slate-100 text-slate-600' };

/** Project site location, geofence and today's check-ins at the site */
function ProjectSite({ p }) {
  const hasSite = p.latitude !== null && p.longitude !== null;
  const geofence = hasSite && Number(p.geofence_enabled);
  return (
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Site &amp; geofence</h3>
      {hasSite ? (
        <div className="space-y-1 text-sm">
          {p.site_address && <p>{p.site_address}</p>}
          <p className="text-slate-500">{Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)} · <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">Open map</a></p>
          <p>{geofence ? <span className="badge bg-emerald-50 text-emerald-700">Check-in allowed within {p.geofence_radius} m</span> : <span className="badge bg-slate-100 text-slate-600">Geofence off</span>}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No site location. Edit the project in <Link to="/admin/projects" className="font-semibold text-brand-700">Projects</Link> to add latitude/longitude and turn on the geofence.</p>
      )}
      <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Checked in here today</h4>
      {p.site_attendance.map((a) => (
        <div key={a.employee_id} className="flex items-center justify-between gap-2 py-1 text-sm">
          <span className="truncate">{a.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            {String(a.check_in).slice(11, 16)}{a.check_out ? `–${String(a.check_out).slice(11, 16)}` : ''}
            {a.check_in_geofence && <span className={cn('badge', GEO_TONE[a.check_in_geofence])}>{titleCase(a.check_in_geofence)}</span>}
          </span>
        </div>
      ))}
      {!p.site_attendance.length && <p className="text-sm text-slate-500">Nobody yet.</p>}
    </div>
  );
}

/** Employees assigned to the project – they see it in the mobile app and can check in at its geofence */
function ProjectMembers({ p, onChange }) {
  const { hasRole } = useAuth();
  const canEdit = hasRole('hr');
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [pickIds, setPickIds] = useState([]);
  const [role, setRole] = useState('');
  const { data: emps } = useFetch(adding ? '/hr/employees' : null, { all: 1, status: 'active' }, { skip: !adding });
  const memberIds = new Set(p.members.map((m) => m.employee_id));
  const available = (emps?.data || []).filter((e) => !memberIds.has(e.id));
  const add = async () => {
    try {
      await api.post(`/work/projects/${p.id}/members`, { employee_ids: pickIds, role: role || null });
      toast.success('Members added');
      setAdding(false);
      setPickIds([]);
      setRole('');
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const remove = async (m) => {
    if (!(await confirm({ text: `Remove ${m.name} from this project? They will no longer be able to check in at its site.` }))) return;
    try {
      await api.delete(`/work/projects/${p.id}/members/${m.employee_id}`);
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Members</h3>
        {canEdit && <button className="text-xs font-semibold text-brand-700" onClick={() => setAdding(true)}>+ Add</button>}
      </div>
      {p.members.map((m) => (
        <div key={m.employee_id} className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar src={m.photo} name={m.name} size="h-7 w-7" className="text-[9px]" />
            <div className="min-w-0"><p className="truncate text-sm font-medium">{m.name}</p><p className="truncate text-xs text-slate-500">{m.role || m.designation_name || m.emp_code}</p></div>
          </div>
          {canEdit && <button className="rounded-lg p-1.5 text-slate-400 hover:text-red-600" onClick={() => remove(m)} title="Remove"><X className="h-4 w-4" /></button>}
        </div>
      ))}
      {!p.members.length && <p className="text-sm text-slate-500">No members. Add employees so they can see this project in the mobile app and check in at its site.</p>}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add project members" size="max-w-md" footer={<><button className="btn-outline" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={!pickIds.length} onClick={add}><UserPlus className="h-4 w-4" /> Add {pickIds.length || ''}</button></>}>
        <div className="space-y-4">
          <Field label="Role on this project (optional)"><input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Site engineer, Supervisor…" /></Field>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {available.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <input type="checkbox" checked={pickIds.includes(e.id)} onChange={(ev) => setPickIds((ids) => (ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id)))} />
                <Avatar src={e.photo} name={e.name} size="h-7 w-7" className="text-[9px]" />
                <span className="text-sm">{e.name} <span className="text-xs text-slate-500">{e.emp_code}</span></span>
              </label>
            ))}
            {emps && !available.length && <p className="text-sm text-slate-500">Every active employee is already a member.</p>}
            {!emps && <Spinner />}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function ProjectView() {
  const { id } = useParams();
  const { data: p, loading, reload } = useFetch(`/work/projects/${id}/overview`);
  if (loading || !p) return <PageLoader />;
  const done = p.tasks.filter((t) => t.status === 'done').length;
  const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
  const billed = p.invoices.reduce((a, i) => a + Number(i.total), 0);
  const received = p.invoices.reduce((a, i) => a + Number(i.amount_paid), 0);
  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Projects</Link>
      <div className="card mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-navy-900 to-brand-700 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-accent-400">Project</p>
              <h1 className="mt-1 text-2xl font-bold text-white">{p.name}</h1>
              <p className="mt-1 text-sm text-white/70">{p.client_name || 'Internal'} · {fmtDate(p.start_date)} – {fmtDate(p.deadline)}</p>
            </div>
            <StatusBadge status={p.status} className="!bg-white/15 !text-white" />
          </div>
          <div className="mt-5">
            <div className="flex justify-between text-xs text-white/70"><span>{done}/{p.tasks.length} tasks done</span><span>{pct}%</span></div>
            <div className="mt-1 h-2 rounded-full bg-white/15"><div className="h-2 rounded-full bg-accent-500" style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
        {p.description && <p className="p-6 text-sm text-slate-600">{p.description}</p>}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Budget" value={money(p.budget, 0)} icon={FolderKanban} />
        <StatCard label="Billed" value={money(billed, 0)} icon={Receipt} tone="violet" />
        <StatCard label="Received" value={money(received, 0)} icon={ShieldCheck} tone="green" />
        <StatCard label="Team" value={new Set([...p.team.map((t) => t.id), ...p.members.map((m) => m.employee_id)]).size} icon={Users} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" /> Tasks</h3><Link to={`/admin/tasks?project=${p.id}`} className="text-xs font-semibold text-brand-700">Open board</Link></div>
          <div className="divide-y divide-slate-100">
            {p.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">{t.assignee_name && <Avatar src={t.assignee_photo} name={t.assignee_name} size="h-7 w-7" className="text-[9px]" />}<div className="min-w-0"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-slate-500">{t.assignee_name || 'Unassigned'} · due {fmtDate(t.due_date)}</p></div></div>
                <StatusBadge status={t.status} />
              </div>
            ))}
            {!p.tasks.length && <p className="py-4 text-sm text-slate-500">No tasks yet.</p>}
          </div>
        </div>
        <div className="space-y-6">
          <ProjectSite p={p} />
          <ProjectMembers p={p} onChange={reload} />
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Agreements</h3><Link to={`/admin/contracts/new?project=${p.id}${p.client_id ? `&client=${p.client_id}` : ''}`} className="text-xs font-semibold text-brand-700">+ New</Link></div>
            {p.contracts.map((k) => <Link key={k.id} to={`/admin/contracts/${k.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-brand-700"><span className="truncate">{k.contract_no}</span><StatusBadge status={k.status} /></Link>)}
            {!p.contracts.length && <p className="text-sm text-slate-500">No agreements.</p>}
          </div>
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Documents</h3><Link to={`/admin/vault?project=${p.id}`} className="text-xs font-semibold text-brand-700">Vault</Link></div>
            {p.documents.map((d) => <button key={d.id} onClick={() => openPdf('vault', d.id)} className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:text-brand-700"><FileText className="h-4 w-4 text-slate-400" /><span className="truncate">{d.title}</span></button>)}
            {!p.documents.length && <p className="text-sm text-slate-500">No documents.</p>}
          </div>
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Billing</h3>{p.client_id && <Link to={`/admin/invoices/new?client=${p.client_id}&project=${p.id}`} className="text-xs font-semibold text-brand-700">+ Invoice</Link>}</div>
            {p.quotations.map((q) => <Link key={`q${q.id}`} to={`/admin/quotations/${q.id}`} className="flex justify-between py-1.5 text-sm hover:text-brand-700"><span>{q.quote_no}</span><span>{money(q.total, 0)}</span></Link>)}
            {p.invoices.map((i) => <Link key={i.id} to={`/admin/invoices/${i.id}`} className="flex justify-between py-1.5 text-sm hover:text-brand-700"><span>{i.invoice_no}</span><StatusBadge status={i.status} /></Link>)}
            {!p.invoices.length && !p.quotations.length && <p className="text-sm text-slate-500">No quotations or invoices linked.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
