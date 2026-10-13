import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Download, Eye, EyeOff, Globe, ImagePlus, Loader2, Plus, Trash2, X,
} from 'lucide-react';
import api, { API_BASE, errMsg } from '../../lib/api';
import { PageLoader, Spinner, Switch } from '../../components/ui';
import { Seo } from '../../components/site/Layout';
import { downloadProfilePdf, publicLink } from './Builder';

/* ------------------------------------------------------------------ section catalogue */
const KINDS = {
  text: { label: 'Text', hint: 'Paragraphs with an optional highlighted note' },
  facts: { label: 'Key facts', hint: 'Label / value table, e.g. company at a glance' },
  cards: { label: 'Cards', hint: 'Boxes such as services, mission & vision' },
  list: { label: 'Bullet list', hint: 'Highlights, approach, achievements' },
  table: { label: 'Table', hint: 'Rows and columns, e.g. methodology' },
  projects: { label: 'Projects', hint: 'Portfolio / case studies with screenshots' },
  timeline: { label: 'Timeline', hint: 'Experience, milestones, history' },
  chips: { label: 'Tags', hint: 'Skills, technologies, sectors' },
  gallery: { label: 'Image gallery', hint: 'Screenshots or photos with captions' },
  contact: { label: 'Contact page', hint: 'Closing page using your contact details' },
};

const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blankSection = (kind) => {
  const base = { id: uid(), kind, kicker: '', title: KINDS[kind].label, intro: '', newPage: false, hidden: false };
  switch (kind) {
    case 'text': return { ...base, body: '', callout: '' };
    case 'table': return { ...base, columns: ['Column 1', 'Column 2'], rows: [['', '']] };
    case 'cards': return { ...base, columns: 3, style: 'plain', items: [{ title: '', text: '' }] };
    case 'contact': return { ...base, title: 'Contact us', body: '', newPage: true };
    default: return { ...base, items: [] };
  }
};

const ITEM_FIELDS = {
  facts: [{ k: 'label', ph: 'Label' }, { k: 'value', ph: 'Value' }],
  cards: [{ k: 'title', ph: 'Title' }, { k: 'text', ph: 'Text', area: true }, { k: 'points', ph: 'Bullet points (one per line, optional)', area: true }],
  list: [{ k: 'text', ph: 'Point', area: true }],
  projects: [
    { k: 'name', ph: 'Project name' }, { k: 'category', ph: 'Category / sector' }, { k: 'summary', ph: 'Short description', area: true },
    { k: 'features', ph: 'Features (one per line)', area: true }, { k: 'client', ph: 'Client' }, { k: 'year', ph: 'Year' }, { k: 'image', image: true },
  ],
  timeline: [{ k: 'when', ph: 'When, e.g. 2021 — Present' }, { k: 'title', ph: 'Role · Organization' }, { k: 'text', ph: 'Description', area: true }],
  chips: [{ k: 'text', ph: 'Tag' }],
  gallery: [{ k: 'image', image: true }, { k: 'caption', ph: 'Caption' }],
};

const imgSrc = (url) => (url ? `${API_BASE}/api${url}` : '');
const move = (list, i, d) => {
  const out = [...list];
  const j = i + d;
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

/* ------------------------------------------------------------------ small controls */
function Input({ label, value, onChange, area, placeholder, rows = 3 }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      {area ? (
        <textarea className="input !py-2 text-sm" rows={rows} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input !py-2 text-sm" value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function ImagePick({ label, value, onChange }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/profiles/upload', fd);
      onChange(data.url);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      ref.current.value = '';
    }
  };
  return (
    <div>
      {label && <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <div className="flex items-center gap-3">
        {value ? (
          <img src={imgSrc(value)} alt="" className="h-14 w-20 rounded-lg border object-contain bg-slate-50" />
        ) : (
          <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-dashed text-slate-400"><ImagePlus className="h-5 w-5" /></div>
        )}
        <button type="button" className="btn-outline btn-sm" onClick={() => ref.current.click()} disabled={busy}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />} {value ? 'Change' : 'Upload'}
        </button>
        {value && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => onChange('')}><X className="h-3.5 w-3.5" /></button>}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files[0])} />
      </div>
    </div>
  );
}

function RowTools({ onUp, onDown, onRemove }) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onUp} title="Move up"><ChevronUp className="h-4 w-4" /></button>
      <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onDown} title="Move down"><ChevronDown className="h-4 w-4" /></button>
      <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={onRemove} title="Remove"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

/** Repeating items (cards, projects, timeline...) */
function ItemList({ kind, items = [], onChange }) {
  const fields = ITEM_FIELDS[kind];
  const set = (i, k, v) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const blank = Object.fromEntries(fields.map((f) => [f.k, '']));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">#{i + 1}</span>
            <RowTools onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
          <div className="space-y-1.5">
            {fields.map((f) =>
              f.image ? (
                <ImagePick key={f.k} value={it[f.k]} onChange={(v) => set(i, f.k, v)} />
              ) : (
                <Input key={f.k} area={f.area} rows={2} placeholder={f.ph} value={it[f.k]} onChange={(v) => set(i, f.k, v)} />
              )
            )}
          </div>
        </div>
      ))}
      <button type="button" className="btn-outline btn-sm w-full" onClick={() => onChange([...items, blank])}><Plus className="h-3.5 w-3.5" /> Add item</button>
    </div>
  );
}

function TableEditor({ s, set }) {
  const cols = s.columns || [];
  const rows = s.rows || [];
  const setCols = (c) => set({ columns: c, rows: rows.map((r) => c.map((_, i) => r[i] || '')) });
  return (
    <div className="space-y-2">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Columns</span>
      <div className="flex flex-wrap gap-1.5">
        {cols.map((c, i) => (
          <div key={i} className="flex items-center gap-1">
            <input className="input !w-32 !py-1.5 text-sm" value={c} onChange={(e) => setCols(cols.map((x, j) => (j === i ? e.target.value : x)))} />
            {cols.length > 1 && <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => set({ columns: cols.filter((_, j) => j !== i), rows: rows.map((r) => r.filter((_, j) => j !== i)) })}><X className="h-4 w-4" /></button>}
          </div>
        ))}
        {cols.length < 5 && <button type="button" className="btn-ghost btn-sm" onClick={() => setCols([...cols, `Column ${cols.length + 1}`])}><Plus className="h-3.5 w-3.5" /></button>}
      </div>
      <span className="block pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rows</span>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
            {cols.map((_, j) => (
              <input key={j} className="input !px-2 !py-1.5 text-sm" placeholder={cols[j]} value={r[j] || ''} onChange={(e) => set({ rows: rows.map((x, k) => (k === i ? cols.map((__, m) => (m === j ? e.target.value : x[m] || '')) : x)) })} />
            ))}
          </div>
          <RowTools onUp={() => set({ rows: move(rows, i, -1) })} onDown={() => set({ rows: move(rows, i, 1) })} onRemove={() => set({ rows: rows.filter((_, k) => k !== i) })} />
        </div>
      ))}
      <button type="button" className="btn-outline btn-sm w-full" onClick={() => set({ rows: [...rows, cols.map(() => '')] })}><Plus className="h-3.5 w-3.5" /> Add row</button>
    </div>
  );
}

function SectionEditor({ s, onChange }) {
  const set = (patch) => onChange({ ...s, ...patch });
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Input label="Small heading" placeholder="e.g. 01 · About" value={s.kicker} onChange={(v) => set({ kicker: v })} />
        <Input label="Title" value={s.title} onChange={(v) => set({ title: v })} />
      </div>
      {s.kind !== 'contact' && <Input label="Intro line" area rows={2} value={s.intro} onChange={(v) => set({ intro: v })} />}
      {s.kind === 'text' && (
        <>
          <Input label="Text" area rows={6} placeholder="Leave an empty line between paragraphs" value={s.body} onChange={(v) => set({ body: v })} />
          <Input label="Highlighted note (optional)" area rows={2} value={s.callout} onChange={(v) => set({ callout: v })} />
        </>
      )}
      {s.kind === 'contact' && (
        <>
          <Input label="Closing text" area rows={3} value={s.body} onChange={(v) => set({ body: v })} />
          <p className="text-xs text-slate-500">Address, phone, email and website come from the <b>Details</b> tab.</p>
        </>
      )}
      {s.kind === 'cards' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Columns</span>
            <select className="input !py-2 text-sm" value={s.columns || 3} onChange={(e) => set({ columns: Number(e.target.value) })}><option value={2}>2</option><option value={3}>3</option></select>
          </label>
          <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Style</span>
            <select className="input !py-2 text-sm" value={s.style || 'plain'} onChange={(e) => set({ style: e.target.value })}><option value="plain">Light</option><option value="dark">Dark (theme colour)</option></select>
          </label>
        </div>
      )}
      {s.kind === 'list' && (
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Layout</span>
          <select className="input !py-2 text-sm" value={s.columns || 1} onChange={(e) => set({ columns: Number(e.target.value) })}><option value={1}>One column</option><option value={2}>Two columns</option></select>
        </label>
      )}
      {s.kind === 'table' && <TableEditor s={s} set={set} />}
      {ITEM_FIELDS[s.kind] && <ItemList kind={s.kind} items={s.items} onChange={(items) => set({ items })} />}
      <label className="flex items-center gap-2 pt-1 text-sm text-slate-600">
        <input type="checkbox" checked={!!s.newPage} onChange={(e) => set({ newPage: e.target.checked })} /> Start on a new page
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ details tab */
function DetailsTab({ profile, data, setData, setTitle, meta, isTemplate }) {
  const b = data.basics || {};
  const set = (k) => (v) => setData({ ...data, basics: { ...b, [k]: v } });
  const personal = profile.type === 'personal';
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <Input label={isTemplate ? 'Template name' : 'Profile title (your list only)'} value={profile.title} onChange={setTitle} />
        {isTemplate && <p className="text-xs text-slate-500">Use [Company Name] or [Your Full Name] anywhere: it is replaced by the name the customer enters.</p>}
      </div>
      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-navy-900">{personal ? 'Person' : 'Cover page'}</h3>
        <Input label={personal ? 'Full name' : 'Company name'} value={b.name} onChange={set('name')} />
        <Input label={personal ? 'Designation' : 'Line under the name'} placeholder={personal ? 'Director, Company' : 'Private Limited'} value={b.subtitle} onChange={set('subtitle')} />
        {!personal && (
          <>
            <Input label="Headline" area rows={2} value={b.headline} onChange={set('headline')} />
            <Input label="Tagline" value={b.tagline} onChange={set('tagline')} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Monogram" placeholder="e.g. YJ" value={b.monogram} onChange={set('monogram')} />
              <Input label="Edition" value={b.edition} onChange={set('edition')} />
            </div>
          </>
        )}
        <Input label="Document label" placeholder={personal ? 'Professional Profile' : 'Company Profile'} value={b.docLabel} onChange={set('docLabel')} />
        {personal ? <ImagePick label="Photo" value={b.photo} onChange={set('photo')} /> : <ImagePick label="Logo" value={b.logo} onChange={set('logo')} />}
      </div>
      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-navy-900">Contact details</h3>
        <Input label={personal ? 'Location' : 'Address'} area rows={2} value={b.address} onChange={set('address')} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Phone" value={b.phone} onChange={set('phone')} />
          {personal ? <Input label="LinkedIn" value={b.linkedin} onChange={set('linkedin')} /> : <Input label="Phone 2" value={b.phone2} onChange={set('phone2')} />}
        </div>
        <Input label="Email" value={b.email} onChange={set('email')} />
        <Input label="Website" value={b.website} onChange={set('website')} />
        {!personal && (
          <>
            <Input label="Working hours" value={b.hours} onChange={set('hours')} />
            <Input label="Registration line" placeholder="CIN / GSTIN / Reg. no." value={b.idLine} onChange={set('idLine')} />
          </>
        )}
      </div>
      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-navy-900">Design</h3>
        <div className="grid grid-cols-3 gap-2">
          {meta.themes.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setData({ ...data, theme: t.key, colors: {} })}
              className={`rounded-xl border p-2 text-left text-xs ${data.theme === t.key && !data.colors?.primary ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200'}`}
            >
              <div className="mb-1.5 flex h-6 overflow-hidden rounded-md"><span className="flex-[3]" style={{ background: t.primary }} /><span className="flex-1" style={{ background: t.accent }} /></div>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-2">Main colour <input type="color" value={data.colors?.primary || meta.themes.find((t) => t.key === data.theme)?.primary || '#0b1f3a'} onChange={(e) => setData({ ...data, colors: { ...data.colors, primary: e.target.value } })} /></label>
          <label className="flex items-center gap-2">Accent <input type="color" value={data.colors?.accent || meta.themes.find((t) => t.key === data.theme)?.accent || '#c9a961'} onChange={(e) => setData({ ...data, colors: { ...data.colors, accent: e.target.value } })} /></label>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections tab */
function SectionsTab({ data, setData }) {
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const sections = data.sections || [];
  const setSections = (list) => setData({ ...data, sections: list });
  const update = (i, s) => setSections(sections.map((x, j) => (j === i ? s : x)));
  const add = (kind) => {
    const s = blankSection(kind);
    setSections([...sections, s]);
    setOpen(s.id);
    setAdding(false);
  };
  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <div key={s.id} className={`rounded-xl border bg-white ${s.hidden ? 'border-dashed opacity-60' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
              {open === s.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy-900">{s.title || KINDS[s.kind]?.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{KINDS[s.kind]?.label}{s.newPage ? ' · new page' : ''}</span>
              </span>
            </button>
            <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" title={s.hidden ? 'Show' : 'Hide'} onClick={() => update(i, { ...s, hidden: !s.hidden })}>
              {s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Duplicate" onClick={() => setSections([...sections.slice(0, i + 1), { ...JSON.parse(JSON.stringify(s)), id: uid() }, ...sections.slice(i + 1)])}>
              <Copy className="h-4 w-4" />
            </button>
            <RowTools onUp={() => setSections(move(sections, i, -1))} onDown={() => setSections(move(sections, i, 1))} onRemove={() => window.confirm(`Remove “${s.title || KINDS[s.kind]?.label}”?`) && setSections(sections.filter((_, j) => j !== i))} />
          </div>
          {open === s.id && <div className="border-t border-slate-100 p-3"><SectionEditor s={s} onChange={(v) => update(i, v)} /></div>}
        </div>
      ))}
      {adding ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} type="button" className="rounded-lg bg-white p-2.5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-brand-400" onClick={() => add(k)}>
                <span className="block text-sm font-medium text-navy-900">{v.label}</span>
                <span className="block text-[11px] leading-snug text-slate-500">{v.hint}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost btn-sm mt-2 w-full" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn-primary w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add section</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ preview */
function Preview({ profile, data }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const box = useRef();
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api
        .post('/profiles/preview', { type: profile.type, title: profile.title, data, base: API_BASE || window.location.origin }, { responseType: 'text' })
        .then(({ data: h }) => setHtml(h))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [profile.type, profile.title, data]);
  useEffect(() => {
    const fit = () => box.current && setScale(Math.min(1, (box.current.clientWidth - 32) / 860));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div ref={box} className="relative h-full overflow-hidden bg-slate-200">
      {loading && <Loader2 className="absolute right-4 top-4 z-10 h-5 w-5 animate-spin text-slate-500" />}
      <iframe
        title="Preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{ width: 860, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left', marginLeft: 16 }}
        className="border-0"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ editor */
/** mode="template": an admin editing a template from the template library */
export default function Editor({ mode = 'profile' }) {
  const { id } = useParams();
  const isTemplate = mode === 'template';
  const endpoint = isTemplate ? `/profiles/admin/templates/${id}` : `/profiles/${id}`;
  const [profile, setProfile] = useState(null);
  const [data, setDataState] = useState(null);
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('sections');
  const [status, setStatus] = useState('saved'); // saved | dirty | saving | error
  const [mobilePreview, setMobilePreview] = useState(false);
  const pending = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    Promise.all([api.get(endpoint), api.get('/profiles/meta')])
      .then(([p, m]) => {
        setProfile(isTemplate ? { ...p.data, title: p.data.name } : p.data);
        setDataState(p.data.data);
        setMeta(m.data);
      })
      .catch((e) => toast.error(errMsg(e)));
  }, [endpoint, isTemplate]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setStatus('saving');
    try {
      const { title, ...rest } = patch;
      await api.put(endpoint, isTemplate ? { ...rest, ...(title !== undefined && { name: title }) } : patch);
      setStatus(pending.current ? 'dirty' : 'saved');
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      setStatus('error');
      toast.error(errMsg(e));
    }
  }, [endpoint, isTemplate]);

  const queue = (patch) => {
    pending.current = { ...pending.current, ...patch };
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };

  // save before leaving the page
  useEffect(() => {
    const warn = (e) => {
      if (pending.current) {
        flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      flush();
    };
  }, [flush]);

  const setData = (d) => {
    setDataState(d);
    queue({ data: d });
  };
  const setTitle = (title) => {
    setProfile((p) => ({ ...p, title }));
    queue({ title });
  };
  const setPublic = async (on) => {
    setProfile((p) => ({ ...p, is_public: on }));
    queue({ is_public: on });
    await flush();
    if (on) toast.success('Public link is on');
  };
  const download = async () => {
    const t = toast.loading('Preparing PDF…');
    try {
      await flush();
      await downloadProfilePdf({ id, title: profile.title, pdfAvailable: meta.pdf });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      toast.dismiss(t);
    }
  };
  const copyLink = () => {
    navigator.clipboard?.writeText(publicLink(profile.slug));
    toast.success('Link copied');
  };

  if (!profile || !data || !meta) return <PageLoader />;
  return (
    <div className="flex h-screen flex-col">
      <Seo title={`Edit · ${profile.title}`} />
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Link to={isTemplate ? '/admin/profile-builder/templates' : '/app'} className="btn-ghost btn-sm" onClick={flush}><ArrowLeft className="h-4 w-4" /> {isTemplate ? 'Templates' : 'Profiles'}</Link>
        {isTemplate && <span className="badge bg-accent-500/20 text-navy-900">Editing template</span>}
        <span className="min-w-0 flex-1 truncate font-semibold text-navy-900">{profile.title}</span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          {status === 'saving' && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>}
          {status === 'dirty' && 'Unsaved changes'}
          {status === 'saved' && <><Check className="h-3.5 w-3.5 text-emerald-600" /> Saved</>}
          {status === 'error' && <button className="text-red-600 underline" onClick={flush}>Save failed, retry</button>}
        </span>
        {!isTemplate && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1">
            <Switch checked={profile.is_public} onChange={setPublic} label={<span className="flex items-center gap-1 text-xs"><Globe className="h-3.5 w-3.5" /> Public link</span>} />
            {profile.is_public && <button className="btn-ghost btn-sm !px-2" onClick={copyLink} title={publicLink(profile.slug)}><Copy className="h-3.5 w-3.5" /></button>}
          </div>
        )}
        <button className="btn-outline btn-sm lg:hidden" onClick={() => setMobilePreview(!mobilePreview)}>{mobilePreview ? 'Edit' : 'Preview'}</button>
        {!isTemplate && <button className="btn-primary btn-sm" onClick={download}><Download className="h-4 w-4" /> Download PDF</button>}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={`${mobilePreview ? 'hidden' : 'flex'} w-full flex-col border-r border-slate-200 bg-slate-50 lg:flex lg:w-[440px]`}>
          <div className="flex gap-1 border-b border-slate-200 bg-white p-2">
            {[['sections', 'Sections'], ['details', 'Details & design']].map(([k, l]) => (
              <button key={k} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === k ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto p-3">
            {tab === 'sections' ? <SectionsTab data={data} setData={setData} /> : <DetailsTab profile={profile} data={data} setData={setData} setTitle={setTitle} meta={meta} isTemplate={isTemplate} />}
          </div>
        </aside>
        <main className={`${mobilePreview ? 'block' : 'hidden'} min-w-0 flex-1 lg:block`}>
          <Preview profile={profile} data={data} />
        </main>
      </div>
    </div>
  );
}
