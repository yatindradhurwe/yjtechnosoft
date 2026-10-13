import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ICONS from './iconMap';
import { Loader2, X, Upload, FileText, Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, asset, initials, titleCase } from '../../lib/utils';
import { uploadFile, errMsg } from '../../lib/api';

const ReactQuill = lazy(() => import('./QuillEditor'));

/* ------------------------------------------------------------------ Icon by name */
export function Icon({ name, ...props }) {
  const key = String(name || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  const Cmp = ICONS[key] || ICONS.sparkles;
  return <Cmp {...props} />;
}

export const Spinner = ({ className = 'h-5 w-5' }) => <Loader2 className={cn('animate-spin text-brand-600', className)} />;

export const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Spinner className="h-8 w-8" />
  </div>
);

export function EmptyState({ title = 'Nothing here yet', text, action, icon: I = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-600">
        <I className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ src, name, size = 'h-9 w-9', className }) {
  if (src) return <img src={asset(src)} alt={name} className={cn('rounded-full object-cover', size, className)} />;
  return (
    <div className={cn('flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white', size, className)}>
      {initials(name || '?')}
    </div>
  );
}

/* ------------------------------------------------------------------ Badges */
const STATUS_COLORS = {
  active: 'bg-emerald-50 text-emerald-700', open: 'bg-emerald-50 text-emerald-700', paid: 'bg-emerald-50 text-emerald-700',
  approved: 'bg-emerald-50 text-emerald-700', present: 'bg-emerald-50 text-emerald-700', done: 'bg-emerald-50 text-emerald-700',
  accepted: 'bg-emerald-50 text-emerald-700', hired: 'bg-emerald-50 text-emerald-700', published: 'bg-emerald-50 text-emerald-700',
  sent: 'bg-sky-50 text-sky-700', issued: 'bg-sky-50 text-sky-700', converted: 'bg-violet-50 text-violet-700', wfh: 'bg-sky-50 text-sky-700',
  in_progress: 'bg-sky-50 text-sky-700', contacted: 'bg-sky-50 text-sky-700', interview: 'bg-sky-50 text-sky-700', review: 'bg-violet-50 text-violet-700',
  shortlisted: 'bg-indigo-50 text-indigo-700', selected: 'bg-violet-50 text-violet-700', offered: 'bg-violet-50 text-violet-700', qualified: 'bg-indigo-50 text-indigo-700',
  partial: 'bg-amber-50 text-amber-700', pending: 'bg-amber-50 text-amber-700', late: 'bg-amber-50 text-amber-700', half_day: 'bg-orange-50 text-orange-700',
  draft: 'bg-slate-100 text-slate-600', todo: 'bg-slate-100 text-slate-600', new: 'bg-brand-50 text-brand-700', applied: 'bg-slate-100 text-slate-700',
  generated: 'bg-slate-100 text-slate-700', planning: 'bg-slate-100 text-slate-700', submitted: 'bg-sky-50 text-sky-700', reviewed: 'bg-emerald-50 text-emerald-700',
  unpaid: 'bg-orange-50 text-orange-700', overdue: 'bg-red-50 text-red-700', rejected: 'bg-red-50 text-red-700', absent: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500', inactive: 'bg-slate-100 text-slate-500', closed: 'bg-slate-100 text-slate-500', blocked: 'bg-red-50 text-red-700',
  expired: 'bg-red-50 text-red-700', suspended: 'bg-orange-50 text-orange-700', revoked: 'bg-red-50 text-red-700', leave: 'bg-violet-50 text-violet-700',
  holiday: 'bg-pink-50 text-pink-700', resigned: 'bg-slate-100 text-slate-500', terminated: 'bg-red-50 text-red-700', on_notice: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700', high: 'bg-orange-50 text-orange-700', medium: 'bg-sky-50 text-sky-700', low: 'bg-slate-100 text-slate-600',
  on_hold: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', important: 'bg-red-50 text-red-700', normal: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-50 text-red-700', skipped: 'bg-slate-100 text-slate-500', unsubscribed: 'bg-slate-100 text-slate-500',
};

export function StatusBadge({ status, className }) {
  if (!status) return null;
  return <span className={cn('badge', STATUS_COLORS[status] || 'bg-slate-100 text-slate-600', className)}>{titleCase(status)}</span>;
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, children, footer, size = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-navy-950/60 p-3 backdrop-blur-sm sm:p-6">
      <div className="fixed inset-0" onClick={onClose} />
      <div className={cn('relative my-auto w-full rounded-2xl bg-white shadow-2xl', size)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 thin-scroll">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ Confirm (promise based) */
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = (opts = {}) =>
    new Promise((resolve) => setState({ title: 'Are you sure?', text: 'This action cannot be undone.', confirmText: 'Delete', danger: true, ...opts, resolve }));
  const close = (v) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="max-w-md"
        footer={
          <>
            <button className="btn-outline" onClick={() => close(false)}>Cancel</button>
            <button className={state?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{state?.confirmText}</button>
          </>
        }
      >
        <div className="flex gap-4">
          <div className={cn('h-fit rounded-xl p-2.5', state?.danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600')}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-600">{state?.text}</p>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ------------------------------------------------------------------ Layout bits */
export function PageHeader({ title, subtitle, actions, icon: I }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {I && (
          <div className="hidden rounded-xl bg-brand-600/10 p-2.5 text-brand-700 sm:block">
            <I className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: I, tone = 'brand', hint, onClick }) {
  const tones = {
    brand: 'from-brand-500 to-brand-700',
    green: 'from-emerald-500 to-emerald-700',
    amber: 'from-amber-400 to-orange-500',
    red: 'from-rose-500 to-red-600',
    violet: 'from-violet-500 to-indigo-600',
    navy: 'from-navy-700 to-navy-900',
  };
  return (
    <div onClick={onClick} className={cn('card relative overflow-hidden p-5', onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-soft')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-navy-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {I && (
          <div className={cn('rounded-xl bg-gradient-to-br p-2.5 text-white shadow-lg', tones[tone])}>
            <I className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 thin-scroll', className)}>
      {tabs.map((t) => {
        const key = t.value ?? t;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition',
              value === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {t.label ?? titleCase(t)}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 text-xs">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  const [v, setV] = useState(value || '');
  const t = useRef();
  useEffect(() => {
    setV(value || '');
  }, [value]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9"
        value={v}
        placeholder={placeholder}
        onChange={(e) => {
          setV(e.target.value);
          clearTimeout(t.current);
          const val = e.target.value;
          t.current = setTimeout(() => onChange(val), 350);
        }}
      />
    </div>
  );
}

export function Pagination({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <div className="flex gap-1">
        <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Form controls */
export function Field({ label, hint, children, className, required }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3" onClick={() => onChange(!checked)}>
      <span
        className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

export function ImageUpload({ value, onChange, folder = 'website', className, aspect = 'aspect-video' }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadFile(file, folder));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={className}>
      <div
        onClick={() => ref.current?.click()}
        className={cn('group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-brand-400', aspect)}
      >
        {value ? (
          <img src={asset(value)} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 p-4 text-slate-400">
            <Upload className="h-6 w-6" />
            <span className="text-xs">Click to upload</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Spinner />
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-2">
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files[0])} />
        {value && (
          <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => onChange('')}>
            Remove
          </button>
        )}
        <input className="input !py-1 text-xs" placeholder="or paste image URL" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function FileUpload({ value, onChange, folder = 'documents', accept }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadFile(file, folder));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn-outline btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />} Upload
      </button>
      {value && (
        <a href={asset(value)} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs text-brand-700 hover:underline">
          <FileText className="h-4 w-4" /> View file
        </a>
      )}
      {value && (
        <button type="button" className="text-xs text-red-600" onClick={() => onChange('')}>
          Remove
        </button>
      )}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files[0])} />
    </div>
  );
}

export function RichEditor({ value, onChange, placeholder }) {
  return (
    <Suspense fallback={<div className="input h-48" />}>
      <ReactQuill value={value || ''} onChange={onChange} placeholder={placeholder} />
    </Suspense>
  );
}

/**
 * Generic form field renderer used by ResourcePage and others.
 * field: { name, label, type, options, required, placeholder, hint, folder, span }
 */
export function FormField({ field, value, onChange, optionsData = {} }) {
  const { type = 'text', name, label, required, placeholder, hint } = field;
  const set = (v) => onChange(name, v);
  let control;
  switch (type) {
    case 'textarea':
    case 'lines':
      control = (
        <textarea
          className="input min-h-[96px]"
          rows={field.rows || 4}
          value={value ?? ''}
          placeholder={placeholder || (type === 'lines' ? 'One item per line' : '')}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case 'rich':
      control = <RichEditor value={value} onChange={set} placeholder={placeholder} />;
      break;
    case 'image':
      control = <ImageUpload value={value} onChange={set} folder={field.folder} aspect={field.aspect} />;
      break;
    case 'file':
      control = <FileUpload value={value} onChange={set} folder={field.folder} accept={field.accept} />;
      break;
    case 'select': {
      const opts = field.optionsFrom ? optionsData[field.name] || [] : field.options || [];
      control = (
        <select className="input" value={value ?? ''} onChange={(e) => set(e.target.value)}>
          {!field.noEmpty && <option value="">{placeholder || '— Select —'}</option>}
          {opts.map((o) => {
            const v = typeof o === 'object' ? o.value : o;
            const l = typeof o === 'object' ? o.label : titleCase(o);
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
        </select>
      );
      break;
    }
    case 'switch':
      control = <Switch checked={Number(value) === 1 || value === true} onChange={(v) => set(v ? 1 : 0)} label={field.switchLabel} />;
      break;
    case 'color':
      control = (
        <div className="flex gap-2">
          <input type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300" value={value || '#1d6fb8'} onChange={(e) => set(e.target.value)} />
          <input className="input" value={value || ''} onChange={(e) => set(e.target.value)} />
        </div>
      );
      break;
    default:
      control = (
        <input
          type={type}
          className="input"
          value={value ?? ''}
          step={type === 'number' ? field.step || 'any' : undefined}
          placeholder={placeholder}
          onChange={(e) => set(e.target.value)}
        />
      );
  }
  return (
    <Field label={label} hint={hint} required={required} className={field.span === 2 ? 'sm:col-span-2' : ''}>
      {control}
    </Field>
  );
}
