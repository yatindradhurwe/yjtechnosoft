import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Download, Phone, Mail, CheckCircle2, FileText, Printer, ShieldCheck, Calendar, PenLine, AlertTriangle } from 'lucide-react';
import api, { API_BASE, errMsg } from '../../lib/api';
import { asset, cn, fmtDate, money, titleCase, waLink } from '../../lib/utils';
import { PageLoader, Spinner, StatusBadge } from '../../components/ui';
import SocialIcon from '../../components/site/SocialIcons';

function AcceptBox({ d, onAccepted, params }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/public/share/${params.type}/${params.id}/${params.token}/accept`, { name, agree });
      toast.success(data.message);
      onAccepted();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-3xl bg-gradient-to-br from-navy-900 to-brand-700 p-6 text-white shadow-soft">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><PenLine className="h-5 w-5 text-accent-400" /> Accept this {d.label.toLowerCase()}</h3>
      <p className="mt-1 text-sm text-white/70">Type your full name to accept digitally. Your name, date, time and IP address will be recorded.</p>
      <input className="input mt-4 !border-white/20 !bg-white/10 !text-white placeholder-white/50" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required />
      <label className="mt-3 flex items-start gap-2 text-sm text-white/85">
        <input type="checkbox" className="mt-1 accent-accent-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        I have read and agree to the terms of {d.label.toLowerCase()} {d.number}{d.total ? ` for ${money(d.total)}` : ''}.
      </label>
      <button className="btn-accent mt-4 w-full" disabled={busy || !agree || name.trim().length < 3}>
        {busy ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Accept {d.label.toLowerCase()}
      </button>
    </form>
  );
}

export default function SharePage() {
  const params = useParams();
  const [search] = useSearchParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const load = () =>
    api
      .get(`/public/share/${params.type}/${params.id}/${params.token}`, { params: { preview: search.get('preview') || undefined } })
      .then(({ data }) => setD(data))
      .catch((e) => setError(errMsg(e)));
  useEffect(() => {
    load();
  }, [params.type, params.id, params.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-2xl font-bold">Link not available</h1>
          <p className="mt-2 text-slate-500">{error}</p>
        </div>
      </div>
    );
  if (!d) return <PageLoader />;

  const c = d.company || {};
  const pdf = `${API_BASE}${d.pdf_url}`;
  const showPdf = d.type !== 'vault' || d.is_pdf;
  const accepted = d.accepted_by && d.accepted_at;
  const facts = [
    d.party && ['Issued to', d.party],
    d.date && ['Date', fmtDate(d.date)],
    d.due_date && ['Due date', fmtDate(d.due_date)],
    d.valid_until && ['Valid till', fmtDate(d.valid_until)],
    d.start_date && ['Period', `${fmtDate(d.start_date)} – ${fmtDate(d.end_date)}`],
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-100/70">
      <Helmet>
        <title>{`${d.label} ${d.number} | ${c.name || ''}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <header className="bg-navy-900">
        <div className="container-x flex h-20 items-center justify-between gap-4">
          <a href={c.site_url || '/'}><img src={asset(c.logo || '/logo.png')} alt={c.name} className="h-11 rounded-lg bg-white px-2 py-1" /></a>
          <div className="hidden text-right text-xs text-white/70 sm:block">
            <p className="font-semibold text-white">{c.name}</p>
            <p>{c.phone} · {c.email}</p>
          </div>
        </div>
      </header>

      <main className="container-x grid gap-6 py-8 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-100 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{d.label}</p>
                <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{d.number}</h1>
                {d.title && d.title !== d.number && <p className="mt-1 text-slate-500">{d.title}</p>}
              </div>
              {d.status && <StatusBadge status={d.status} className="!text-sm" />}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k}><p className="text-xs text-slate-400">{k}</p><p className="font-semibold text-navy-900">{v}</p></div>
              ))}
            </div>
            {d.total !== undefined && d.total !== null && Number(d.total) > 0 && (
              <div className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-5 sm:grid-cols-3">
                <div><p className="text-xs text-slate-400">{d.type === 'contract' ? 'Contract value' : 'Total'}</p><p className="font-display text-2xl font-bold text-brand-700">{money(d.total)}</p></div>
                {d.type === 'invoice' && (
                  <>
                    <div><p className="text-xs text-slate-400">Paid</p><p className="font-display text-2xl font-bold text-emerald-600">{money(d.paid)}</p></div>
                    <div><p className="text-xs text-slate-400">Balance due</p><p className={cn('font-display text-2xl font-bold', d.balance > 0 ? 'text-red-600' : 'text-emerald-600')}>{money(d.balance)}</p></div>
                  </>
                )}
              </div>
            )}
            {d.items?.length > 0 && (
              <table className="mt-6 w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-2">Description</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Amount</th></tr></thead>
                <tbody>{d.items.map((it, i) => <tr key={i} className="border-b border-slate-100"><td className="py-2.5 pr-3">{it.description}</td><td className="py-2.5 text-center">{Number(it.quantity)}</td><td className="py-2.5 text-right font-medium">{money(it.amount)}</td></tr>)}</tbody>
              </table>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <a href={`${pdf}?download=1`} className="btn-primary"><Download className="h-4 w-4" /> Download {d.type === 'vault' ? 'file' : 'PDF'}</a>
              {showPdf && <a href={pdf} target="_blank" rel="noreferrer" className="btn-outline"><Printer className="h-4 w-4" /> Open / Print</a>}
            </div>
          </div>

          {d.type === 'contract' && d.body && (
            <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-100 sm:p-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><FileText className="h-5 w-5 text-brand-600" /> Agreement terms</h2>
              <div className="rich max-h-[70vh] overflow-y-auto pr-2 thin-scroll" dangerouslySetInnerHTML={{ __html: d.body }} />
            </div>
          )}
          {showPdf && d.type !== 'contract' && (
            <div className="hidden overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-slate-100 md:block">
              <iframe title="document" src={`${pdf}#toolbar=0`} className="h-[85vh] w-full border-0" />
            </div>
          )}
        </section>

        <aside className="space-y-6">
          {accepted && (
            <div className="rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-100">
              <p className="flex items-center gap-2 font-semibold text-emerald-800"><ShieldCheck className="h-5 w-5" /> Accepted</p>
              <p className="mt-1 text-sm text-emerald-700">by <b>{d.accepted_by}</b> on {new Date(String(d.accepted_at).replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
          )}
          {d.can_accept && !accepted && <AcceptBox d={d} params={params} onAccepted={load} />}
          <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-100">
            <h3 className="font-semibold">Questions? Contact us</h3>
            <div className="mt-4 space-y-2">
              {c.whatsapp && (
                <a href={waLink(c.whatsapp, `Hello, regarding ${d.label} ${d.number}`)} target="_blank" rel="noreferrer" className="btn w-full bg-[#25D366] text-white hover:bg-[#1fb457]">
                  <SocialIcon name="whatsapp" className="h-4 w-4" /> Chat on WhatsApp
                </a>
              )}
              {c.phone && <a href={`tel:${c.phone}`} className="btn-outline w-full"><Phone className="h-4 w-4" /> {c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}?subject=${encodeURIComponent(`${d.label} ${d.number}`)}`} className="btn-outline w-full"><Mail className="h-4 w-4" /> {c.email}</a>}
            </div>
            {c.address && <p className="mt-4 text-xs text-slate-500">{c.address}</p>}
          </div>
          <p className="flex items-center justify-center gap-1 text-center text-xs text-slate-400"><Calendar className="h-3.5 w-3.5" /> Secure link shared by {c.name} · {titleCase(d.type)}</p>
        </aside>
      </main>
    </div>
  );
}
