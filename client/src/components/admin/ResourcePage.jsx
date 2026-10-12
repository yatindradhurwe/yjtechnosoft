import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { Modal, PageHeader, SearchInput, Pagination, FormField, StatusBadge, Spinner, useConfirm, EmptyState } from '../ui';
import DataTable from '../ui/DataTable';

/**
 * Generic list + create/edit/delete screen backed by /api/admin/:resource
 *
 * props:
 *  resource, title, subtitle, icon
 *  columns  [{ key, label, render }]
 *  fields   [{ name, label, type, options, optionsFrom: { url, label, value }, required, span }]
 *  defaults {}
 *  filters  [{ name, label, options }]
 *  rowActions(row, reload) -> ReactNode
 *  headerActions(reload) -> ReactNode
 *  canCreate / canEdit / canDelete
 *  endpoint (override, default /admin/:resource)
 *  modalSize
 *  onSaved(row)
 */
export default function ResourcePage({
  resource,
  endpoint,
  title,
  subtitle,
  icon,
  columns,
  fields,
  defaults = {},
  filters = [],
  rowActions,
  headerActions,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  modalSize = 'max-w-3xl',
  limit = 20,
  createLabel = 'Add new',
  transformOut,
  onSaved,
  extraParams = {},
}) {
  const url = endpoint || `/admin/${resource}`;
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filterVals, setFilterVals] = useState({});
  const params = { page, limit, q, ...filterVals, ...extraParams };
  const { data, loading, reload } = useFetch(url, params);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState({});
  const confirm = useConfirm();

  const optionSources = useMemo(() => fields.filter((f) => f.optionsFrom), [fields]);
  useEffect(() => {
    optionSources.forEach(async (f) => {
      try {
        const res = await api.get(f.optionsFrom.url, { params: { all: 1, ...(f.optionsFrom.params || {}) } });
        const list = res.data.data || res.data;
        setOptions((o) => ({
          ...o,
          [f.name]: list.map((r) => ({
            value: r[f.optionsFrom.value || 'id'],
            label: typeof f.optionsFrom.label === 'function' ? f.optionsFrom.label(r) : r[f.optionsFrom.label || 'name'],
          })),
        }));
      } catch {
        /* ignore */
      }
    });
  }, [optionSources]);

  const openNew = () => {
    setForm({ ...defaults });
    setEditing('new');
  };
  const openEdit = (row) => {
    const f = {};
    fields.forEach((fl) => {
      let v = row[fl.name];
      if (fl.type === 'date' && v) v = String(v).slice(0, 10);
      if (fl.type === 'datetime-local' && v) v = String(v).slice(0, 16).replace(' ', 'T');
      f[fl.name] = v ?? '';
    });
    setForm(f);
    setEditing(row);
  };

  const save = async (e) => {
    e?.preventDefault();
    const missing = fields.find((f) => f.required && (form[f.name] === '' || form[f.name] === undefined || form[f.name] === null));
    if (missing) return toast.error(`${missing.label} is required`);
    setSaving(true);
    try {
      const body = transformOut ? transformOut(form) : form;
      const res = editing === 'new' ? await api.post(url, body) : await api.put(`${url}/${editing.id}`, body);
      toast.success(editing === 'new' ? 'Created successfully' : 'Saved successfully');
      setEditing(null);
      reload();
      onSaved?.(res.data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!(await confirm({ text: 'This record will be permanently deleted.' }))) return;
    try {
      await api.delete(`${url}/${row.id}`);
      toast.success('Deleted');
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const cols = [
    ...columns.map((c) => (c.key === 'status' && !c.render ? { ...c, render: (r) => <StatusBadge status={r.status} /> } : c)),
    {
      key: '_actions',
      label: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {rowActions?.(r, reload)}
          {canEdit && (
            <button className="rounded-lg p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-700" title="Edit" onClick={() => openEdit(r)}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => remove(r)}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={
          <>
            {headerActions?.(reload)}
            {canCreate && (
              <button className="btn-primary" onClick={openNew}>
                <Plus className="h-4 w-4" /> {createLabel}
              </button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput
          className="sm:w-72"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        {filters.map((f) => (
          <select
            key={f.name}
            className="input sm:w-48"
            value={filterVals[f.name] || ''}
            onChange={(e) => {
              setFilterVals({ ...filterVals, [f.name]: e.target.value });
              setPage(1);
            }}
          >
            <option value="">{f.label}: All</option>
            {(f.options || options[f.name] || []).map((o) => {
              const v = typeof o === 'object' ? o.value : o;
              return (
                <option key={v} value={v}>
                  {typeof o === 'object' ? o.label : String(o).replace(/_/g, ' ')}
                </option>
              );
            })}
          </select>
        ))}
      </div>
      <DataTable
        columns={cols}
        rows={data?.data}
        loading={loading}
        onRowClick={canEdit ? openEdit : undefined}
        empty={<EmptyState title={`No ${title.toLowerCase()} yet`} text="Records you add will appear here." action={canCreate && <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> {createLabel}</button>} />}
        footer={<Pagination page={page} total={data?.total} limit={limit} onChange={setPage} />}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `Add ${title.replace(/s$/, '')}` : `Edit ${title.replace(/s$/, '')}`}
        size={modalSize}
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving && <Spinner className="h-4 w-4 text-white" />} Save
            </button>
          </>
        }
      >
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <FormField key={f.name} field={f} value={form[f.name]} optionsData={options} onChange={(k, v) => setForm((s) => ({ ...s, [k]: v }))} />
          ))}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </div>
  );
}
