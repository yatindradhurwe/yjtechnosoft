import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Building2, Copy, Download, ExternalLink, Eye, FileText, Globe, IdCard, LayoutTemplate, Lock, Pencil, Plus, Repeat, RotateCcw, Trash2, User, UserPlus, Users,
} from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { fmtDate } from '../../lib/utils';
import { Field, Modal, PageHeader, PageLoader, SearchInput, StatCard, StatusBadge, Switch, useConfirm } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';
import { downloadProfilePdf, publicLink } from '../builder/Builder';
import NewProfileModal, { TemplateDetailsFields, TemplatePreview, TemplateThumb } from '../builder/TemplatePicker';

const BLANK = { name: '', email: '', phone: '', company_name: '', password: '', profile_limit: '', notes: '', status: 'active' };

function usePdfAvailable() {
  const [pdf, setPdf] = useState(true);
  useEffect(() => {
    api.get('/profiles/meta').then(({ data }) => setPdf(data.pdf)).catch(() => {});
  }, []);
  return pdf;
}

/* ------------------------------------------------------------------ add / edit customer */
function CustomerModal({ value, onClose, onSaved, defaultLimit }) {
  const [f, setF] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(value), [value]);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      if (f.id) await api.put(`/profiles/admin/customers/${f.id}`, f);
      else await api.post('/profiles/admin/customers', f);
      toast.success(f.id ? 'Customer updated' : 'Customer added');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? 'Edit customer' : 'Add customer / firm'}
      size="max-w-xl"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>Save</button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person" required><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Firm / company"><input className="input" value={f.company_name || ''} onChange={set('company_name')} placeholder="Leave empty for individuals" /></Field>
        <Field label="Email (login)" required><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label={f.id ? 'New password (optional)' : 'Password'} required={!f.id} hint="At least 8 characters. Share it with the customer.">
          <input className="input" type="text" autoComplete="new-password" value={f.password || ''} onChange={set('password')} />
        </Field>
        <Field label="Profiles allowed" hint={`Empty = site default (${defaultLimit})`}>
          <input className="input" type="number" min="0" value={f.profile_limit ?? ''} onChange={set('profile_limit')} />
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive (cannot login)</option></select>
        </Field>
        <Field label="Internal notes" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes || ''} onChange={set('notes')} placeholder="Plan, payment, requirements… (not visible to the customer)" /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ profile table (shared) */
function ProfilesTable({ rows, loading, reload, showOwner, pdfAvailable }) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [moving, setMoving] = useState(null);
  const togglePublic = async (p) => {
    try {
      await api.put(`/profiles/${p.id}`, { is_public: !p.is_public });
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const remove = async (p) => {
    if (!(await confirm({ title: 'Delete profile?', text: `“${p.title}” will be permanently deleted for its owner too.` }))) return;
    await api.delete(`/profiles/${p.id}`);
    toast.success('Profile deleted');
    reload();
  };
  const download = async (p) => {
    const t = toast.loading('Preparing PDF…');
    try {
      await downloadProfilePdf({ id: p.id, title: p.title, pdfAvailable });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      toast.dismiss(t);
    }
  };
  const saveAsTemplate = async (p) => {
    try {
      const { data } = await api.post('/profiles/admin/templates', { from_profile_id: p.id, name: p.title, is_active: false });
      toast.success('Saved as a hidden template. Review it, then switch it on.');
      navigate(`/app/templates/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const move = async () => {
    try {
      const { data } = await api.put(`/profiles/admin/profiles/${moving.id}/owner`, { email: moving.email });
      toast.success(data.message);
      setMoving(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <>
      <DataTable
        loading={loading}
        rows={rows}
        columns={[
          {
            key: 'title',
            label: 'Profile',
            render: (p) => (
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-navy-900 p-2 text-accent-400">{p.type === 'personal' ? <User className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}</div>
                <div><p className="font-medium">{p.title}</p><p className="text-xs capitalize text-slate-500">{p.type}</p></div>
              </div>
            ),
          },
          ...(showOwner
            ? [{
                key: 'owner',
                label: 'Owner',
                render: (p) => (
                  <div>
                    {p.owner_role === 'customer' ? <Link to={`/admin/profile-builder/customers/${p.user_id}`} className="font-medium text-brand-700 hover:underline">{p.owner_company || p.owner_name}</Link> : <span className="font-medium">{p.owner_name} <span className="badge bg-slate-100 text-slate-500">staff</span></span>}
                    <p className="text-xs text-slate-500">{p.owner_email}</p>
                  </div>
                ),
              }]
            : []),
          { key: 'is_public', label: 'Public link', render: (p) => (
            <div className="flex items-center gap-2">
              <Switch checked={p.is_public} onChange={() => togglePublic(p)} />
              {p.is_public && <a href={publicLink(p.slug)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-700" title="Open public page"><ExternalLink className="h-4 w-4" /></a>}
            </div>
          ) },
          { key: 'download_count', label: 'Downloads' },
          { key: 'updated_at', label: 'Updated', render: (p) => fmtDate(p.updated_at) },
          {
            key: 'a',
            label: '',
            render: (p) => (
              <div className="flex justify-end gap-1">
                <Link to={`/app/profiles/${p.id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Open in editor"><Pencil className="h-4 w-4" /></Link>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Download PDF" onClick={() => download(p)}><Download className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Move to another account" onClick={() => setMoving({ ...p, email: '' })}><Repeat className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Save as template" onClick={() => saveAsTemplate(p)}><LayoutTemplate className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title="Move profile to another account"
        size="max-w-md"
        footer={<><button className="btn-outline" onClick={() => setMoving(null)}>Cancel</button><button className="btn-primary" onClick={move}>Move</button></>}
      >
        {moving && (
          <Field label="Email of the new owner" hint={`“${moving.title}” will appear in that account’s profile list. Use this to hand over a profile you built for a client.`}>
            <input className="input" type="email" value={moving.email} onChange={(e) => setMoving({ ...moving, email: e.target.value })} />
          </Field>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ overview */
export function ProfileOverview() {
  const { data } = useFetch('/profiles/admin/stats');
  const navigate = useNavigate();
  if (!data) return <PageLoader />;
  return (
    <div>
      <PageHeader title="Profile Builder" subtitle="Customers and firms who create company or personal profiles" icon={IdCard} actions={<Link to="/app" className="btn-primary"><Plus className="h-4 w-4" /> Open builder</Link>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customers" value={data.customers.total} icon={Users} hint={`${data.customers.active} active · ${data.customers.this_month} new this month`} onClick={() => navigate('/admin/profile-builder/customers')} />
        <StatCard label="Profiles" value={data.profiles.total} icon={FileText} tone="violet" hint={`${data.profiles.company} company · ${data.profiles.personal} personal`} onClick={() => navigate('/admin/profile-builder/profiles')} />
        <StatCard label="Public links" value={data.profiles.public} icon={Globe} tone="green" />
        <StatCard label="PDF downloads" value={data.profiles.downloads} icon={Download} tone="amber" hint={`Default limit ${data.default_limit} profiles per customer`} />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-navy-900">Newest customers</h3>
          <Link to="/admin/profile-builder/customers" className="text-sm font-medium text-brand-700 hover:underline">All customers</Link>
        </div>
        {!data.recent.length ? (
          <p className="text-sm text-slate-500">No customers yet. Share <b>{window.location.origin}/signup</b> or add one from <i>Customers</i>.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <Link to={`/admin/profile-builder/customers/${c.id}`} className="font-medium text-navy-900 hover:text-brand-700">{c.company_name || c.name}</Link>
                <span className="text-slate-500">{c.email} · {fmtDate(c.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ customers list */
export function ProfileCustomers() {
  const [filters, setFilters] = useState({ search: '', status: '' });
  const { data, loading, reload } = useFetch('/profiles/admin/customers', filters);
  const [edit, setEdit] = useState(null);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const remove = async (c) => {
    if (!(await confirm({ title: 'Delete customer?', text: `${c.name} (${c.email}) and all ${c.profile_count} of their profiles will be permanently deleted.` }))) return;
    try {
      await api.delete(`/profiles/admin/customers/${c.id}`);
      toast.success('Customer deleted');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const toggle = async (c) => {
    await api.put(`/profiles/admin/customers/${c.id}`, { status: c.status === 'active' ? 'inactive' : 'active' });
    reload();
  };
  const limit = data?.default_limit ?? 10;
  return (
    <div>
      <PageHeader title="Customers & Firms" subtitle="People and firms using the Profile Builder" icon={Users} actions={<button className="btn-primary" onClick={() => setEdit({ ...BLANK })}><UserPlus className="h-4 w-4" /> Add customer</button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" placeholder="Search name, firm, email or phone…" value={filters.search} onChange={(search) => setFilters({ ...filters, search })} />
        <select className="input sm:w-44" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={(c) => navigate(`/admin/profile-builder/customers/${c.id}`)}
        columns={[
          { key: 'name', label: 'Customer / firm', render: (c) => <div><p className="font-medium">{c.company_name || c.name}</p><p className="text-xs text-slate-500">{c.company_name ? `${c.name} · ` : ''}{c.email}{c.phone ? ` · ${c.phone}` : ''}</p></div> },
          { key: 'profile_count', label: 'Profiles', render: (c) => <span>{c.profile_count} <span className="text-slate-400">/ {c.profile_limit ?? limit}</span></span> },
          { key: 'downloads', label: 'Downloads' },
          { key: 'last_login', label: 'Last login', render: (c) => (c.last_login ? fmtDate(c.last_login) : 'Never') },
          { key: 'created_at', label: 'Joined', render: (c) => fmtDate(c.created_at) },
          { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          {
            key: 'a',
            label: '',
            render: (c) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit" onClick={() => setEdit({ ...c, password: '', profile_limit: c.profile_limit ?? '' })}><Pencil className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={c.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => toggle(c)}><Lock className="h-4 w-4" /></button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ),
          },
        ]}
      />
      <CustomerModal value={edit} defaultLimit={limit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ one customer */
export function ProfileCustomerView() {
  const { id } = useParams();
  const { data: c, loading, reload } = useFetch(`/profiles/admin/customers/${id}`);
  const { data: meta } = useFetch('/profiles/meta');
  const [edit, setEdit] = useState(null);
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  if (loading && !c) return <PageLoader />;
  if (!c) return <p className="text-slate-500">Customer not found.</p>;
  return (
    <div>
      <Link to="/admin/profile-builder/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      <PageHeader
        title={c.company_name || c.name}
        subtitle={`${c.company_name ? `${c.name} · ` : ''}${c.email}${c.phone ? ` · ${c.phone}` : ''}`}
        icon={c.company_name ? Building2 : User}
        actions={
          <>
            <button className="btn-outline" onClick={() => setEdit({ ...c, password: '', profile_limit: c.profile_limit ?? '' })}><Pencil className="h-4 w-4" /> Edit</button>
            <button className="btn-primary" onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> Create profile for them</button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Status" value={<StatusBadge status={c.status} />} icon={Lock} tone="navy" hint={`Joined ${fmtDate(c.created_at)}`} />
        <StatCard label="Profiles" value={`${c.profiles.length} / ${c.effective_limit}`} icon={FileText} tone="violet" hint={c.profile_limit == null ? 'Site default limit' : 'Custom limit'} />
        <StatCard label="PDF downloads" value={c.profiles.reduce((s, p) => s + p.download_count, 0)} icon={Download} tone="amber" />
        <StatCard label="Last login" value={c.last_login ? fmtDate(c.last_login) : 'Never'} icon={User} tone="green" />
      </div>
      {c.notes && <div className="card mb-6 border-l-4 border-l-accent-500 p-4 text-sm text-slate-600"><b className="text-navy-900">Notes: </b>{c.notes}</div>}
      <h3 className="mb-3 font-semibold text-navy-900">Profiles</h3>
      <ProfilesTable rows={c.profiles} loading={loading} reload={reload} pdfAvailable={meta?.pdf ?? true} />
      <CustomerModal value={edit} defaultLimit={c.effective_limit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      <NewProfileModal
        open={create}
        ownerId={c.id}
        defaultName={c.company_name || c.name}
        onClose={() => setCreate(false)}
        onCreated={(p) => {
          toast.success('Profile created in the customer’s account');
          navigate(`/app/profiles/${p.id}`);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ all profiles */
export function AllProfiles() {
  const [filters, setFilters] = useState({ search: '', type: '', visibility: '', owner: '' });
  const { data, loading, reload } = useFetch('/profiles/admin/profiles', filters);
  const pdfAvailable = usePdfAvailable();
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  return (
    <div>
      <PageHeader title="All Profiles" subtitle="Every profile created in the Profile Builder" icon={FileText} actions={<Link to="/app" className="btn-primary"><Plus className="h-4 w-4" /> New profile</Link>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput className="lg:col-span-2" placeholder="Search title, owner, firm or email…" value={filters.search} onChange={(search) => setFilters({ ...filters, search })} />
        <select className="input" value={filters.type} onChange={set('type')}><option value="">All types</option><option value="company">Company</option><option value="personal">Personal</option></select>
        <select className="input" value={filters.visibility} onChange={set('visibility')}><option value="">Public & private</option><option value="public">Public link on</option><option value="private">Private</option></select>
        <select className="input" value={filters.owner} onChange={set('owner')}><option value="">All owners</option><option value="customers">Customers</option><option value="staff">Staff</option></select>
      </div>
      <ProfilesTable rows={data?.data} loading={loading} reload={reload} showOwner pdfAvailable={pdfAvailable} />
    </div>
  );
}

/* ------------------------------------------------------------------ template library */
export function ProfileTemplates() {
  const [filters, setFilters] = useState({ type: '', search: '', status: '' });
  const { data, loading, reload } = useFetch('/profiles/admin/templates');
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const all = data?.data || [];
  const categories = [...new Set(all.map((t) => t.category))].sort();
  const rows = all.filter(
    (t) =>
      (!filters.type || t.type === filters.type) &&
      (!filters.status || (filters.status === 'active' ? t.is_active : !t.is_active)) &&
      (!filters.search || `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(filters.search.toLowerCase()))
  );
  const groups = rows.reduce((g, t) => ((g[t.category] = g[t.category] || []).push(t), g), {});

  const save = async () => {
    try {
      if (edit.id) await api.put(`/profiles/admin/templates/${edit.id}`, edit);
      else {
        const { data: r } = await api.post('/profiles/admin/templates', edit);
        toast.success('Template created. Now add its content.');
        navigate(`/app/templates/${r.id}`);
        return;
      }
      toast.success('Template saved');
      setEdit(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const toggle = async (t) => {
    await api.put(`/profiles/admin/templates/${t.id}`, { is_active: !t.is_active });
    reload();
  };
  const duplicate = async (t) => {
    const { data: r } = await api.post('/profiles/admin/templates', { from_template_id: t.id, name: `${t.name} (copy)` });
    toast.success('Copy created');
    navigate(`/app/templates/${r.id}`);
  };
  const remove = async (t) => {
    if (!(await confirm({ title: 'Delete template?', text: `“${t.name}” will be removed from the template list. Profiles already made from it are not affected.` }))) return;
    await api.delete(`/profiles/admin/templates/${t.id}`);
    toast.success('Template deleted');
    reload();
  };
  const restore = async () => {
    const { data: r } = await api.post('/profiles/admin/templates/restore');
    toast.success(r.message);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Templates customers choose from when they create a profile, grouped by category"
        icon={LayoutTemplate}
        actions={
          <>
            <button className="btn-outline" onClick={restore} title="Add back built-in templates that were deleted"><RotateCcw className="h-4 w-4" /> Restore built-ins</button>
            <button className="btn-primary" onClick={() => setEdit({ name: '', category: '', type: 'company', description: '', is_active: true, staff_only: false, sort_order: 100 })}><Plus className="h-4 w-4" /> New template</button>
          </>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" placeholder="Search templates or categories…" value={filters.search} onChange={(search) => setFilters({ ...filters, search })} />
        <select className="input sm:w-48" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">Firms & individuals</option><option value="company">Firm / business</option><option value="personal">Individual</option></select>
        <select className="input sm:w-40" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All</option><option value="active">Visible</option><option value="hidden">Hidden</option></select>
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([cat, list]) => (
            <div key={cat}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{cat} <span className="text-slate-400">({list.length})</span></h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => (
                  <div key={t.id} className={`card flex gap-3 p-3 ${t.is_active ? '' : 'opacity-60'}`}>
                    <button type="button" className="w-16 shrink-0" onClick={() => setPreview(t)} title="Preview"><TemplateThumb t={t} /></button>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-tight text-navy-900">{t.name}</p>
                        <Switch checked={t.is_active} onChange={() => toggle(t)} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t.type === 'personal' ? 'Individual' : 'Firm / business'} · used {t.used}×{t.staff_only ? ' · staff only' : ''}{t.code ? ' · built-in' : ''}
                      </p>
                      {t.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                      <div className="mt-auto flex flex-wrap gap-1 pt-2">
                        <Link to={`/app/templates/${t.id}`} className="btn-primary btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit content</Link>
                        <button className="btn-outline btn-sm" onClick={() => setEdit({ ...t })}>Details</button>
                        <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Preview" onClick={() => setPreview(t)}><Eye className="h-4 w-4" /></button>
                        <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Duplicate" onClick={() => duplicate(t)}><Copy className="h-4 w-4" /></button>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!rows.length && <p className="py-10 text-center text-sm text-slate-500">No templates match.</p>}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Template details' : 'New template'}
        size="max-w-xl"
        footer={<><button className="btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>{edit?.id ? 'Save' : 'Create & edit content'}</button></>}
      >
        {edit && (
          <div className="space-y-4">
            <TemplateDetailsFields value={edit} onChange={setEdit} categories={categories} allowType={!edit.id} />
            {!edit.id && (
              <Field label="Start from" hint="Copy an existing template, or start from the general layout for firms / individuals.">
                <select className="input" value={edit.from_template_id || ''} onChange={(e) => setEdit({ ...edit, from_template_id: e.target.value || undefined })}>
                  <option value="">General {edit.type === 'personal' ? 'individual' : 'firm'} layout</option>
                  {all.filter((t) => t.type === edit.type).map((t) => <option key={t.id} value={t.id}>{t.category} – {t.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
      </Modal>
      <TemplatePreview template={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
