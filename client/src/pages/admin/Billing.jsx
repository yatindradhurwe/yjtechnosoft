import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, FileDown, Printer, Pencil, ArrowRightLeft, Receipt, FileSpreadsheet, Wallet, IndianRupee, AlertCircle, CheckCircle2, Eye, ArrowLeft, Ban } from 'lucide-react';
import api, { errMsg, openPdf } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { addDays, fmtDate, money, today, titleCase } from '../../lib/utils';
import { PageHeader, SearchInput, Pagination, StatusBadge, Spinner, Modal, Field, StatCard, useConfirm, PageLoader, Tabs } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';
import ShareMenu from '../../components/ui/ShareMenu';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function calc(items, discount) {
  const subtotal = round2(items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0));
  const disc = Math.min(round2(discount), subtotal);
  const ratio = subtotal ? (subtotal - disc) / subtotal : 1;
  const tax = round2(items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.rate) || 0) * ratio * ((Number(i.tax_rate) || 0) / 100), 0));
  return { subtotal, discount: disc, tax, total: round2(subtotal - disc + tax) };
}

/* ====================================================================== Lists */
function BillingList({ kind }) {
  const isInv = kind === 'invoice';
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useFetch(isInv ? '/billing/invoices' : '/billing/quotations', { page, q, status });
  const statuses = isInv ? ['', 'unpaid', 'partial', 'paid', 'overdue', 'draft', 'cancelled'] : ['', 'draft', 'sent', 'accepted', 'rejected', 'converted'];

  return (
    <div>
      <PageHeader
        title={isInv ? 'Invoices' : 'Quotations'}
        subtitle={isInv ? 'Create GST invoices on your letterhead, record payments & share instantly' : 'Prepare professional quotations and convert them to invoices in one click'}
        icon={isInv ? Receipt : FileSpreadsheet}
        actions={
          <Link to={isInv ? '/admin/invoices/new' : '/admin/quotations/new'} className="btn-primary">
            <Plus className="h-4 w-4" /> New {isInv ? 'invoice' : 'quotation'}
          </Link>
        }
      />
      {isInv && data?.summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total billed" value={money(data.summary.amount, 0)} icon={IndianRupee} />
          <StatCard label="Received" value={money(data.summary.paid, 0)} icon={CheckCircle2} tone="green" />
          <StatCard label="Outstanding" value={money(data.summary.amount - data.summary.paid, 0)} icon={AlertCircle} tone="red" />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput className="lg:w-72" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search number, client…" />
        <Tabs tabs={statuses.map((s) => ({ value: s, label: s ? titleCase(s) : 'All' }))} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={(r) => navigate(`/admin/${isInv ? 'invoices' : 'quotations'}/${r.id}`)}
        columns={[
          { key: 'no', label: isInv ? 'Invoice #' : 'Quote #', render: (r) => <span className="font-semibold text-brand-700">{isInv ? r.invoice_no : r.quote_no}</span> },
          { key: 'client_name', label: 'Client', render: (r) => <div><p className="font-medium text-navy-900">{r.client_name}</p>{r.subject && <p className="max-w-[220px] truncate text-xs text-slate-500">{r.subject}</p>}</div> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(isInv ? r.invoice_date : r.quote_date) },
          { key: 'due', label: isInv ? 'Due' : 'Valid till', render: (r) => fmtDate(isInv ? r.due_date : r.valid_until) },
          { key: 'total', label: 'Amount', render: (r) => <b>{money(r.total)}</b> },
          ...(isInv ? [{ key: 'balance', label: 'Balance', render: (r) => <span className={r.total - r.amount_paid > 0 ? 'font-semibold text-red-600' : 'text-emerald-600'}>{money(r.total - r.amount_paid)}</span> }] : []),
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'a',
            label: '',
            className: 'text-right',
            render: (r) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="PDF" onClick={() => openPdf(kind, r.id)}><FileDown className="h-4 w-4" /></button>
                <ShareMenu type={kind} id={r.id} compact onSent={reload} />
              </div>
            ),
          },
        ]}
        footer={<Pagination page={page} total={data?.total} limit={data?.limit || 20} onChange={setPage} />}
      />
    </div>
  );
}

export const Invoices = () => <BillingList kind="invoice" />;
export const Quotations = () => <BillingList kind="quotation" />;

/* ====================================================================== Form */
function DocForm({ kind }) {
  const isInv = kind === 'invoice';
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editing = id && id !== 'new';
  const base = isInv ? '/billing/invoices' : '/billing/quotations';
  const { data: clients } = useFetch('/admin/clients', { all: 1, status: 'active' });
  const { data: catalog } = useFetch('/admin/billing_items', { all: 1, status: 'active' });
  const { data: settings } = useFetch('/settings');
  const { data: projects } = useFetch('/admin/projects', { all: 1 });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newClient, setNewClient] = useState(null);

  useEffect(() => {
    (async () => {
      if (editing) {
        const { data } = await api.get(`${base}/${id}`);
        setForm({
          ...data,
          date: (isInv ? data.invoice_date : data.quote_date)?.slice(0, 10),
          due: (isInv ? data.due_date : data.valid_until)?.slice(0, 10) || '',
          number: isInv ? data.invoice_no : data.quote_no,
          items: data.items.map((i) => ({ ...i })),
        });
      } else {
        const { data } = await api.get(`${base}/next-number`);
        const d = today();
        setForm({
          client_id: params.get('client') || '',
          project_id: params.get('project') || '',
          number: data.number,
          date: d,
          due: addDays(d, isInv ? 15 : 30),
          subject: '',
          discount: 0,
          notes: '',
          terms: null,
          items: [{ description: '', hsn_sac: '', quantity: 1, unit: 'Nos', rate: '', tax_rate: 18 }],
        });
      }
    })().catch((e) => toast.error(errMsg(e)));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (form && form.terms === null && settings) setForm((f) => ({ ...f, terms: settings[isInv ? 'invoice_terms' : 'quotation_terms'] || '' }));
  }, [settings, form, isInv]);

  const totals = useMemo(() => (form ? calc(form.items, form.discount) : null), [form]);
  if (!form) return <PageLoader />;

  const setItem = (idx, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)) }));
  const addItem = (preset) =>
    setForm((f) => ({ ...f, items: [...f.items.filter((i) => i.description || i.rate), preset || { description: '', hsn_sac: '', quantity: 1, unit: 'Nos', rate: '', tax_rate: 18 }] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const save = async (status) => {
    if (!form.client_id) return toast.error('Please select a client');
    setSaving(true);
    try {
      const body = {
        client_id: form.client_id,
        project_id: form.project_id || null,
        subject: form.subject,
        discount: form.discount,
        notes: form.notes,
        terms: form.terms,
        items: form.items,
        ...(isInv
          ? { invoice_no: form.number, invoice_date: form.date, due_date: form.due || null }
          : { quote_no: form.number, quote_date: form.date, valid_until: form.due || null }),
        ...(status ? { status } : {}),
      };
      const { data } = editing ? await api.put(`${base}/${id}`, body) : await api.post(base, body);
      toast.success(`${isInv ? 'Invoice' : 'Quotation'} saved`);
      navigate(`/admin/${isInv ? 'invoices' : 'quotations'}/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const saveClient = async () => {
    try {
      const { data } = await api.post('/admin/clients', { ...newClient, status: 'active' });
      clients.data.push(data);
      setForm((f) => ({ ...f, client_id: data.id }));
      setNewClient(null);
      toast.success('Client added');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const client = clients?.data?.find((c) => String(c.id) === String(form.client_id));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${editing ? 'Edit' : 'New'} ${isInv ? 'Invoice' : 'Quotation'}`}
        actions={
          <>
            <button className="btn-outline" onClick={() => navigate(-1)}>Cancel</button>
            {!editing && isInv && <button className="btn-outline" disabled={saving} onClick={() => save('draft')}>Save as draft</button>}
            <button className="btn-primary" disabled={saving} onClick={() => save(isInv && form.status === 'draft' ? 'unpaid' : undefined)}>
              {saving && <Spinner className="h-4 w-4 text-white" />} Save {isInv ? 'invoice' : 'quotation'}
            </button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" required>
              <div className="flex gap-2">
                <select className="input" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— Select client —</option>
                  {clients?.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="button" className="btn-outline !px-3" title="Add client" onClick={() => setNewClient({ name: '', phone: '', email: '', address: '', gstin: '' })}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="Subject">
              <input className="input" value={form.subject || ''} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Website development" />
            </Field>
            <Field label="Project (optional)">
              <select className="input" value={form.project_id || ''} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">—</option>
                {(projects?.data || []).filter((p) => !form.client_id || String(p.client_id) === String(form.client_id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          {client && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-navy-900">{client.name}</p>
              <p>{[client.address, client.city, client.state].filter(Boolean).join(', ')}</p>
              <p>{[client.phone, client.email, client.gstin && `GSTIN: ${client.gstin}`].filter(Boolean).join(' · ')}</p>
            </div>
          )}
        </div>
        <div className="card grid gap-4 p-6">
          <Field label={isInv ? 'Invoice number' : 'Quotation number'}>
            <input className="input font-semibold" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={isInv ? 'Due date' : 'Valid till'}>
              <input type="date" className="input" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </Field>
          </div>
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h3 className="font-semibold">Items / Services</h3>
          {catalog?.data?.length > 0 && (
            <select
              className="input !w-auto"
              value=""
              onChange={(e) => {
                const it = catalog.data.find((c) => String(c.id) === e.target.value);
                if (it) addItem({ description: it.name, hsn_sac: it.hsn_sac || '', quantity: 1, unit: it.unit, rate: it.rate, tax_rate: Number(it.tax_rate) });
              }}
            >
              <option value="">+ Add from catalogue</option>
              {catalog.data.map((c) => (
                <option key={c.id} value={c.id}>{c.name} – {money(c.rate, 0)}</option>
              ))}
            </select>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-4 py-3 text-left">#</th>
                <th className="px-2 py-3 text-left">Description</th>
                <th className="w-28 px-2 py-3 text-left">HSN/SAC</th>
                <th className="w-20 px-2 py-3 text-left">Qty</th>
                <th className="w-32 px-2 py-3 text-left">Rate (₹)</th>
                <th className="w-24 px-2 py-3 text-left">GST %</th>
                <th className="w-32 px-2 py-3 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {form.items.map((it, idx) => (
                <tr key={idx} className="align-top">
                  <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <textarea rows={1} className="input min-h-[42px] resize-y" value={it.description} onChange={(e) => setItem(idx, 'description', e.target.value)} placeholder="Service / product description" />
                  </td>
                  <td className="px-2 py-2"><input className="input" value={it.hsn_sac || ''} onChange={(e) => setItem(idx, 'hsn_sac', e.target.value)} /></td>
                  <td className="px-2 py-2"><input type="number" step="any" className="input" value={it.quantity} onChange={(e) => setItem(idx, 'quantity', e.target.value)} /></td>
                  <td className="px-2 py-2"><input type="number" step="any" className="input" value={it.rate} onChange={(e) => setItem(idx, 'rate', e.target.value)} /></td>
                  <td className="px-2 py-2">
                    <select className="input" value={Number(it.tax_rate)} onChange={(e) => setItem(idx, 'tax_rate', e.target.value)}>
                      {[0, 5, 12, 18, 28].map((v) => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-3 text-right font-semibold text-navy-900">{money((Number(it.quantity) || 0) * (Number(it.rate) || 0))}</td>
                  <td className="py-2 pr-3">
                    {form.items.length > 1 && (
                      <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3">
          <button className="btn-ghost btn-sm text-brand-700" onClick={() => addItem()}>
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>
        <div className="grid gap-6 border-t border-slate-100 p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Notes (printed)">
              <textarea className="input" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Field label="Terms & conditions">
              <textarea className="input" rows={4} value={form.terms || ''} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
            </Field>
          </div>
          <div className="h-fit space-y-3 rounded-2xl bg-slate-50 p-5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Sub total</span><span className="font-semibold">{money(totals.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Discount (₹)</span>
              <input type="number" className="input !w-32 text-right" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-semibold">{money(totals.tax)}</span></div>
            {totals.tax > 0 && settings?.gst_split !== '0' && (
              <div className="flex justify-between pl-4 text-xs text-slate-400"><span>CGST {money(totals.tax / 2)} + SGST {money(totals.tax / 2)}</span></div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-3 text-lg">
              <span className="font-semibold">Total</span>
              <span className="font-display font-bold text-brand-700">{money(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={!!newClient}
        onClose={() => setNewClient(null)}
        title="Quick add client"
        size="max-w-lg"
        footer={<><button className="btn-outline" onClick={() => setNewClient(null)}>Cancel</button><button className="btn-primary" onClick={saveClient}>Add client</button></>}
      >
        {newClient && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[['name', 'Client / Company name'], ['contact_person', 'Contact person'], ['phone', 'Phone'], ['email', 'Email'], ['gstin', 'GSTIN'], ['city', 'City']].map(([k, l]) => (
              <Field key={k} label={l}><input className="input" value={newClient[k] || ''} onChange={(e) => setNewClient({ ...newClient, [k]: e.target.value })} /></Field>
            ))}
            <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} value={newClient.address || ''} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

export const InvoiceForm = () => <DocForm kind="invoice" />;
export const QuotationForm = () => <DocForm kind="quotation" />;

/* ====================================================================== View */
function DocView({ kind }) {
  const isInv = kind === 'invoice';
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const base = isInv ? '/billing/invoices' : '/billing/quotations';
  const { data: d, loading, reload } = useFetch(`${base}/${id}`);
  const [pay, setPay] = useState(null);
  const [busy, setBusy] = useState(false);
  if (loading || !d) return <PageLoader />;
  const number = isInv ? d.invoice_no : d.quote_no;
  const balance = isInv ? round2(d.total - d.amount_paid) : 0;

  const del = async () => {
    if (!(await confirm({ text: `Delete ${number}? This cannot be undone.` }))) return;
    await api.delete(`${base}/${id}`);
    toast.success('Deleted');
    navigate(`/admin/${isInv ? 'invoices' : 'quotations'}`);
  };
  const convert = async () => {
    try {
      const { data } = await api.post(`/billing/quotations/${id}/convert`);
      toast.success(`Invoice ${data.invoice_no} created`);
      navigate(`/admin/invoices/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const setStatus = async (status) => {
    try {
      await api.patch(`${base}/${id}/status`, { status });
      toast.success('Status updated');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const recordPayment = async () => {
    setBusy(true);
    try {
      await api.post(`/billing/invoices/${id}/payments`, pay);
      toast.success('Payment recorded');
      setPay(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const delPayment = async (p) => {
    if (!(await confirm({ text: `Delete payment of ${money(p.amount)}?` }))) return;
    await api.delete(`/billing/payments/${p.id}`);
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={`/admin/${isInv ? 'invoices' : 'quotations'}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> All {isInv ? 'invoices' : 'quotations'}
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{number}</h1>
            <StatusBadge status={d.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{d.client.name} · {fmtDate(isInv ? d.invoice_date : d.quote_date)}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {d.viewed_at ? <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">👀 Viewed by client {fmtDate(d.viewed_at)}</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">Not opened by client yet</span>}
            {d.accepted_by && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">✅ Accepted online by {d.accepted_by} on {fmtDate(d.accepted_at)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => openPdf(kind, id)}><Eye className="h-4 w-4" /> Preview</button>
          <button className="btn-outline" onClick={() => openPdf(kind, id, true)}><FileDown className="h-4 w-4" /> Download</button>
          <ShareMenu type={kind} id={id} onSent={reload} />
          {isInv && balance > 0 && d.status !== 'cancelled' && (
            <button className="btn-accent" onClick={() => setPay({ amount: balance, payment_date: today(), mode: 'bank_transfer', reference: '', notes: '' })}>
              <Wallet className="h-4 w-4" /> Record payment
            </button>
          )}
          {!isInv && d.status !== 'converted' && <button className="btn-dark" onClick={convert}><ArrowRightLeft className="h-4 w-4" /> Convert to invoice</button>}
          {!isInv && d.invoice_id && <Link className="btn-outline" to={`/admin/invoices/${d.invoice_id}`}>View invoice</Link>}
          <Link to={`/admin/${isInv ? 'invoices' : 'quotations'}/${id}/edit`} className="btn-outline"><Pencil className="h-4 w-4" /> Edit</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="grid gap-6 border-b border-slate-100 p-6 sm:grid-cols-2">
              <div>
                <p className="label">Bill to</p>
                <p className="font-semibold text-navy-900">{d.client.name}</p>
                <p className="text-sm text-slate-500">{[d.client.address, d.client.city, d.client.state].filter(Boolean).join(', ')}</p>
                <p className="text-sm text-slate-500">{[d.client.phone, d.client.email].filter(Boolean).join(' · ')}</p>
                {d.client.gstin && <p className="text-sm text-slate-500">GSTIN: {d.client.gstin}</p>}
              </div>
              <div className="sm:text-right">
                <p className="label">{isInv ? 'Due date' : 'Valid till'}</p>
                <p className="font-semibold">{fmtDate(isInv ? d.due_date : d.valid_until)}</p>
                {d.subject && (<><p className="label mt-3">Subject</p><p className="text-sm">{d.subject}</p></>)}
              </div>
            </div>
            <table className="table-x">
              <thead><tr><th>#</th><th>Description</th><th>Qty</th><th className="text-right">Rate</th><th>GST</th><th className="text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.items.map((it, i) => (
                  <tr key={it.id}>
                    <td>{i + 1}</td>
                    <td className="!whitespace-normal"><p className="font-medium">{it.description}</p>{it.hsn_sac && <p className="text-xs text-slate-400">HSN/SAC {it.hsn_sac}</p>}</td>
                    <td>{Number(it.quantity)}</td>
                    <td className="text-right">{money(it.rate)}</td>
                    <td>{Number(it.tax_rate)}%</td>
                    <td className="text-right font-semibold">{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-slate-100 p-6">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Sub total</span><span>{money(d.subtotal)}</span></div>
                {Number(d.discount) > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>- {money(d.discount)}</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{money(d.tax_total)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><span>Total</span><span className="text-brand-700">{money(d.total)}</span></div>
                {isInv && (
                  <>
                    <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{money(d.amount_paid)}</span></div>
                    <div className="flex justify-between font-semibold text-red-600"><span>Balance</span><span>{money(balance)}</span></div>
                  </>
                )}
              </div>
            </div>
          </div>
          {(d.notes || d.terms) && (
            <div className="card grid gap-6 p-6 sm:grid-cols-2">
              {d.notes && <div><p className="label">Notes</p><p className="whitespace-pre-line text-sm text-slate-600">{d.notes}</p></div>}
              {d.terms && <div><p className="label">Terms</p><p className="whitespace-pre-line text-sm text-slate-600">{d.terms}</p></div>}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {isInv && (
            <div className="card p-6">
              <h3 className="mb-4 font-semibold">Payments</h3>
              {d.payments.length ? (
                <div className="space-y-3">
                  {d.payments.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="font-semibold text-emerald-700">{money(p.amount)}</p>
                        <p className="text-xs text-slate-500">{fmtDate(p.payment_date)} · {titleCase(p.mode)}{p.reference ? ` · ${p.reference}` : ''}</p>
                        <p className="text-xs text-slate-400">{p.receipt_no}</p>
                      </div>
                      <div className="flex gap-1">
                        <button className="rounded-lg p-1.5 text-slate-500 hover:bg-white" title="Receipt PDF" onClick={() => openPdf('receipt', p.id)}><Printer className="h-4 w-4" /></button>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-red-600" onClick={() => delPayment(p)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              )}
            </div>
          )}
          <div className="card space-y-2 p-6">
            <h3 className="mb-2 font-semibold">Actions</h3>
            {isInv ? (
              <>
                {d.status === 'draft' && <button className="btn-outline w-full" onClick={() => setStatus('unpaid')}><CheckCircle2 className="h-4 w-4" /> Mark as final</button>}
                {d.status !== 'cancelled' && <button className="btn-outline w-full" onClick={() => setStatus('cancelled')}><Ban className="h-4 w-4" /> Cancel invoice</button>}
                {d.status === 'cancelled' && <button className="btn-outline w-full" onClick={() => setStatus('unpaid')}>Restore invoice</button>}
              </>
            ) : (
              ['sent', 'accepted', 'rejected'].filter((s) => s !== d.status && d.status !== 'converted').map((s) => (
                <button key={s} className="btn-outline w-full" onClick={() => setStatus(s)}>Mark as {s}</button>
              ))
            )}
            <button className="btn w-full text-red-600 hover:bg-red-50" onClick={del}><Trash2 className="h-4 w-4" /> Delete</button>
          </div>
        </div>
      </div>

      <Modal
        open={!!pay}
        onClose={() => setPay(null)}
        title="Record payment"
        size="max-w-lg"
        footer={<><button className="btn-outline" onClick={() => setPay(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={recordPayment}>{busy && <Spinner className="h-4 w-4 text-white" />} Save payment</button></>}
      >
        {pay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)"><input type="number" className="input" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Date"><input type="date" className="input" value={pay.payment_date} onChange={(e) => setPay({ ...pay, payment_date: e.target.value })} /></Field>
            <Field label="Mode">
              <select className="input" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                {['bank_transfer', 'upi', 'cash', 'cheque', 'card', 'other'].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
              </select>
            </Field>
            <Field label="Reference / UTR"><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><input className="input" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

export const InvoiceView = () => <DocView kind="invoice" />;
export const QuotationView = () => <DocView kind="quotation" />;

/* ====================================================================== Payments */
export function Payments() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, loading } = useFetch('/billing/payments', { page, q, from, to });
  return (
    <div>
      <PageHeader title="Payments" subtitle="All payments received against invoices" icon={Wallet} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput className="sm:w-72" value={q} onChange={(v) => { setQ(v); setPage(1); }} />
        <input type="date" className="input sm:w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input sm:w-44" value={to} onChange={(e) => setTo(e.target.value)} />
        {data?.summary && <span className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">Total: {money(data.summary.amount)}</span>}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'payment_date', label: 'Date', render: (r) => fmtDate(r.payment_date) },
          { key: 'receipt_no', label: 'Receipt #' },
          { key: 'client_name', label: 'Client' },
          { key: 'invoice_no', label: 'Invoice', render: (r) => <Link to={`/admin/invoices/${r.invoice_id}`} className="text-brand-700 hover:underline">{r.invoice_no}</Link> },
          { key: 'mode', label: 'Mode', render: (r) => titleCase(r.mode) },
          { key: 'reference', label: 'Reference' },
          { key: 'amount', label: 'Amount', render: (r) => <b className="text-emerald-700">{money(r.amount)}</b> },
          { key: 'a', label: '', render: (r) => <div className="flex justify-end gap-1"><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => openPdf('receipt', r.id)}><Printer className="h-4 w-4" /></button><ShareMenu type="receipt" id={r.id} compact /></div> },
        ]}
        footer={<Pagination page={page} total={data?.total} limit={data?.limit || 20} onChange={setPage} />}
      />
    </div>
  );
}

