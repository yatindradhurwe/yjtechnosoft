import { createContext, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useContext, useId, ReactElement } from 'react';
import { cn } from '@/lib/utils';

/** Lets a Field label the control inside it, even when the control is wrapped in other elements */
const FieldCtx = createContext<{ id: string; describedBy?: string; invalid: boolean } | null>(null);

function useFieldProps<T extends { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' }>(p: T): T {
  const f = useContext(FieldCtx);
  if (!f) return p;
  return { ...p, id: p.id ?? f.id, 'aria-describedby': p['aria-describedby'] ?? f.describedBy, 'aria-invalid': p['aria-invalid'] ?? (f.invalid || undefined) };
}

const base = 'flex w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, 'h-10 py-2', className)} {...useFieldProps(p)} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-[90px] py-2 leading-relaxed', className)} {...useFieldProps(p)} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(base, 'h-10 py-2 pr-8', className)} {...useFieldProps(p)} />
));
Select.displayName = 'Select';

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...p} />;
}

/** Label + control + hint/error, wired for accessibility */
export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactElement; className?: string }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <FieldCtx.Provider value={{ id, describedBy, invalid: !!error }}>{children}</FieldCtx.Provider>
      {error ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-input')}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-background shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export function Checkbox({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]" />
      <label htmlFor={id} className="text-sm leading-snug">
        {label}
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </label>
    </div>
  );
}
