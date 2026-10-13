import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Eye, Search, Sparkles, User } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import { Field, Modal, Spinner } from '../../components/ui';
import { cn } from '../../lib/utils';

/** Small A4-shaped drawing of a template in its own colours */
export function TemplateThumb({ t, className }) {
  if (t.type === 'personal') {
    return (
      <div className={cn('relative aspect-[210/297] overflow-hidden rounded-md border border-slate-200 bg-white p-[9%]', className)}>
        <div className="flex gap-[8%]">
          <div className="aspect-[4/5] w-[30%] rounded-sm border-2" style={{ borderColor: t.accent, background: `${t.accent}22` }} />
          <div className="flex-1 space-y-[8%] pt-[4%]">
            <div className="h-[6px] w-full rounded-full" style={{ background: t.primary }} />
            <div className="h-[4px] w-2/3 rounded-full bg-slate-300" />
            <div className="h-[3px] w-1/4 rounded-full" style={{ background: t.accent }} />
          </div>
        </div>
        <div className="mt-[12%] space-y-[5%]">
          {[90, 75, 85, 60].map((w, i) => <div key={i} className="h-[3px] rounded-full bg-slate-200" style={{ width: `${w}%` }} />)}
        </div>
        <div className="mt-[10%] flex flex-wrap gap-[4%]">
          {[1, 2, 3].map((i) => <div key={i} className="h-[6px] w-[26%] rounded-full border" style={{ borderColor: t.primary }} />)}
        </div>
      </div>
    );
  }
  return (
    <div className={cn('relative aspect-[210/297] overflow-hidden rounded-md', className)} style={{ background: `linear-gradient(160deg, ${t.primary}, ${t.primary}dd)` }}>
      <div className="absolute inset-[6%] border" style={{ borderColor: `${t.accent}99` }} />
      <div className="absolute left-[16%] top-[14%] h-[14%] w-[20%] rotate-45 border-2" style={{ borderColor: t.accent }} />
      <div className="absolute left-[14%] right-[14%] top-[44%] space-y-[7%]">
        <div className="h-[7px] w-4/5 rounded-full bg-white/90" />
        <div className="h-[3px] w-1/3 rounded-full" style={{ background: t.accent }} />
        <div className="h-[4px] w-3/5 rounded-full bg-white/50" />
      </div>
      <div className="absolute bottom-[12%] left-[14%] right-[14%] h-px" style={{ background: `${t.accent}99` }} />
    </div>
  );
}

/** Opens a template rendered exactly as the profile will look */
export function TemplatePreview({ template, onClose, onUse }) {
  const [html, setHtml] = useState(null);
  useEffect(() => {
    if (!template) return;
    setHtml(null);
    api.get(`/profiles/templates/${template.id}/preview`, { responseType: 'text' }).then(({ data }) => setHtml(data)).catch((e) => toast.error(errMsg(e)));
  }, [template]);
  return (
    <Modal
      open={!!template}
      onClose={onClose}
      title={template ? `${template.name} · ${template.category}` : ''}
      size="max-w-4xl"
      footer={<><button className="btn-outline" onClick={onClose}>Close</button>{onUse && <button className="btn-primary" onClick={() => onUse(template)}>Use this template</button>}</>}
    >
      <div className="h-[65vh] overflow-hidden rounded-xl bg-slate-200">
        {html === null ? <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6" /></div> : <iframe title="Template preview" srcDoc={html} sandbox="allow-same-origin" className="h-full w-full border-0" />}
      </div>
    </Modal>
  );
}

/**
 * "Create a new profile": choose firm or individual → category → template.
 * ownerId: create directly in that user's account (admin only).
 */
export default function NewProfileModal({ open, onClose, onCreated, ownerId, defaultName = '', askOwnerEmail = false }) {
  const [templates, setTemplates] = useState(null);
  const [type, setType] = useState('company');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ name: defaultName, title: '', owner_email: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setForm({ name: defaultName, title: '', owner_email: '' });
    api.get('/profiles/templates').then(({ data }) => setTemplates(data.data)).catch((e) => toast.error(errMsg(e)));
  }, [open, defaultName]);

  const ofType = useMemo(() => (templates || []).filter((t) => t.type === type), [templates, type]);
  const categories = useMemo(() => [...new Set(ofType.map((t) => t.category))], [ofType]);
  const shown = ofType.filter(
    (t) => (!category || t.category === category) && (!search || `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(search.toLowerCase()))
  );

  const switchType = (v) => {
    setType(v);
    setCategory('');
    setPicked(null);
  };

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/profiles', { template_id: picked.id, ...form, owner_id: ownerId });
      onCreated(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Create a new profile"
        size="max-w-5xl"
        footer={
          picked ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex items-center gap-3 sm:mr-auto">
                <TemplateThumb t={picked} className="w-10" />
                <div className="text-sm"><p className="font-semibold text-navy-900">{picked.name}</p><p className="text-xs text-slate-500">{picked.category}</p></div>
              </div>
              <input className="input sm:w-56" placeholder={type === 'personal' ? 'Person’s full name' : 'Firm / company name'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {askOwnerEmail && <input className="input sm:w-56" type="email" placeholder="Customer email (optional)" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />}
              <button className="btn-primary" disabled={busy} onClick={create}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Sparkles className="h-4 w-4" />} Create profile</button>
            </div>
          ) : (
            <p className="mr-auto text-sm text-slate-500">Choose a template to continue. You can change every section afterwards.</p>
          )
        }
      >
        {!templates ? (
          <div className="py-16 text-center"><Spinner className="mx-auto h-6 w-6" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {[['company', Building2, 'Firm / Business', 'Company, firm, institution, NGO, shop…'], ['personal', User, 'Individual', 'Professional, doctor, advocate, student…']].map(([v, I, label, hint]) => (
                <button key={v} type="button" onClick={() => switchType(v)} className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition', type === v ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300')}>
                  <div className={cn('rounded-lg p-2', type === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}><I className="h-5 w-5" /></div>
                  <div><p className="font-semibold text-navy-900">{label}</p><p className="text-xs text-slate-500">{hint}</p></div>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="lg:w-56 lg:shrink-0">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="input !py-2 pl-9 text-sm" placeholder="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {['', ...categories].map((c) => (
                    <button key={c || 'all'} type="button" onClick={() => setCategory(c)} className={cn('shrink-0 rounded-lg px-3 py-1.5 text-left text-sm', category === c ? 'bg-navy-900 font-medium text-white' : 'text-slate-600 hover:bg-slate-100')}>
                      {c || 'All categories'} <span className="opacity-60">({c ? ofType.filter((t) => t.category === c).length : ofType.length})</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((t) => (
                  <div key={t.id} className={cn('group cursor-pointer rounded-xl border bg-white p-2 transition', picked?.id === t.id ? 'border-brand-500 ring-2 ring-brand-500/25' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm')} onClick={() => setPicked(t)}>
                    <div className="relative">
                      <TemplateThumb t={t} />
                      <button type="button" className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-slate-600 opacity-0 shadow transition group-hover:opacity-100" title="Preview" onClick={(e) => { e.stopPropagation(); setPreview(t); }}>
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-tight text-navy-900">{t.name}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.category}</p>
                    {t.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                  </div>
                ))}
                {!shown.length && <p className="col-span-full py-10 text-center text-sm text-slate-500">No templates match.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <TemplatePreview template={preview} onClose={() => setPreview(null)} onUse={(t) => { setPicked(t); setPreview(null); }} />
    </>
  );
}

/** Small form used by admins: template name, category, type, description */
export function TemplateDetailsFields({ value, onChange, categories = [], allowType = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Template name" required><input className="input" value={value.name || ''} onChange={set('name')} /></Field>
      <Field label="Category" hint="Pick one or type a new category">
        <input className="input" list="tpl-categories" value={value.category || ''} onChange={set('category')} />
        <datalist id="tpl-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      {allowType && (
        <Field label="For">
          <select className="input" value={value.type || 'company'} onChange={set('type')}><option value="company">Firm / business</option><option value="personal">Individual</option></select>
        </Field>
      )}
      <Field label="Order" hint="Lower numbers are shown first"><input className="input" type="number" value={value.sort_order ?? ''} onChange={set('sort_order')} /></Field>
      <Field label="Short description" className="sm:col-span-2"><input className="input" value={value.description || ''} onChange={set('description')} /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!value.is_active} onChange={set('is_active')} /> Show to customers</label>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!value.staff_only} onChange={set('staff_only')} /> Staff only (hidden from customers)</label>
    </div>
  );
}
