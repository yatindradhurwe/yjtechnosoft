import { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Search } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './form';

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} aria-label="Loading" />;

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} />;

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back}
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:h-6 [&_svg]:w-6">{icon ?? <Inbox />}</div>
      <h3 className="font-sans text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-6 w-6 text-destructive" />
      <p className="text-sm font-medium">{error instanceof Error ? error.message : 'Could not load this page'}</p>
      {retry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders loading / error states for a query and the content once data is ready */
export function QueryView<T>({ q, children, loading }: { q: UseQueryResult<T>; children: (data: T) => ReactNode; loading?: ReactNode }) {
  if (q.isPending) return <>{loading ?? <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>}</>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <>{children(q.data as T)}</>;
}

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => local !== value && onChange(local), 300);
    return () => clearTimeout(t);
  }, [local, value, onChange]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
      {empty && <div className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</div>}
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;
