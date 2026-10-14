import { Spinner, EmptyState } from './index';
import { cn } from '../../lib/utils';

/**
 * columns: [{ key, label, render(row), className }]
 */
export default function DataTable({ columns, rows, loading, empty, onRowClick, footer }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto thin-scroll">
        <table className="table-x">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key || c.label} className={c.thClass}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {!loading &&
              rows?.map((r, i) => (
                <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('transition hover:bg-slate-50/80', onRowClick && 'cursor-pointer')}>
                  {columns.map((c) => (
                    <td key={c.key || c.label} className={c.className}>
                      {c.render ? c.render(r) : r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {/* outside the scrolling area so they stay centred on narrow screens */}
      {loading ? (
        <div className="py-12 text-center">
          <Spinner className="mx-auto h-6 w-6" />
        </div>
      ) : !rows?.length ? (
        empty || <EmptyState />
      ) : null}
      {footer}
    </div>
  );
}
