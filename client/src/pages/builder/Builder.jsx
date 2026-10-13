import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, Copy, Download, FileText, Globe, IdCard, LayoutTemplate, LogOut, Palette, Pencil, Plus, Sparkles, Trash2, User } from 'lucide-react';
import api, { API_BASE, errMsg } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Field, Modal, PageLoader, Spinner, useConfirm } from '../../components/ui';
import { Logo, Seo } from '../../components/site/Layout';
import { fmtDate } from '../../lib/utils';

export const publicLink = (slug) => `${window.location.origin}/p/${slug}`;

/** Downloads a profile PDF (server Chromium); falls back to the browser print dialog */
export async function downloadProfilePdf({ id, slug, title, pdfAvailable }) {
  const path = slug ? `/profiles/public/${slug}` : `/profiles/${id}`;
  if (pdfAvailable) {
    try {
      const { data } = await api.get(`${path}/pdf`, { params: { download: 1 }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'profile').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    } catch (e) {
      if (e?.response?.status !== 501) throw e;
    }
  }
  // No PDF engine on the server: open the print-ready page, user picks "Save as PDF"
  const w = window.open('', '_blank');
  const { data } = await api.get(slug ? path : `${path}/html`, { params: { print: 1 }, responseType: 'text' });
  w.document.open();
  w.document.write(data);
  w.document.close();
}

/* ------------------------------------------------------------------ layout */
export function AppLayout() {
  const { user, loading, logout } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  const editor = /^\/app\/profiles\/\d+/.test(pathname);
  return (
    <div className="min-h-screen bg-slate-50">
      {!editor && (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link to="/app" className="flex items-center gap-3">
              <Logo className="h-9" />
              <span className="hidden rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 sm:inline">Profile Builder</span>
            </Link>
            <div className="flex items-center gap-2">
              {user.role !== 'customer' && <Link to="/admin" className="btn-ghost btn-sm">Admin panel</Link>}
              <span className="hidden text-sm text-slate-600 sm:inline">{user.name}</span>
              <button className="btn-outline btn-sm" onClick={logout}><LogOut className="h-4 w-4" /> Logout</button>
            </div>
          </div>
        </header>
      )}
      <Outlet />
    </div>
  );
}

/* ------------------------------------------------------------------ dashboard */
export function Dashboard() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [all, setAll] = useState(false);
  const [create, setCreate] = useState(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = user.role === 'admin';

  const load = () =>
    api.get('/profiles', { params: all ? { all: 1 } : {} }).then(({ data }) => setRows(data.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => {
    api.get('/profiles/meta').then(({ data }) => setMeta(data));
  }, []);
  useEffect(() => {
    load();
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/profiles', create);
      navigate(`/app/profiles/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (p) => {
    if (!(await confirm({ title: 'Delete profile?', text: `“${p.title}” will be permanently deleted.` }))) return;
    await api.delete(`/profiles/${p.id}`);
    toast.success('Profile deleted');
    load();
  };
  const duplicate = async (p) => {
    try {
      await api.post(`/profiles/${p.id}/duplicate`);
      toast.success('Copy created');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const download = async (p) => {
    const t = toast.loading('Preparing PDF…');
    try {
      await downloadProfilePdf({ id: p.id, title: p.title, pdfAvailable: meta?.pdf });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      toast.dismiss(t);
    }
  };

  if (!rows || !meta) return <PageLoader />;
  const mine = rows.filter((r) => r.user_id === user.id).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Seo title="My Profiles" />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">{all ? 'All profiles' : 'My profiles'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create company and personal profiles, edit every section and download a print-ready PDF.
            {meta.limit && ` You have used ${mine} of ${meta.limit}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button className="btn-outline" onClick={() => setAll(!all)}>{all ? 'Show my profiles' : 'Show all customers’ profiles'}</button>
          )}
          <button className="btn-primary" onClick={() => setCreate({ template: 'company', title: '', name: '', owner_email: '' })}>
            <Plus className="h-4 w-4" /> New profile
          </button>
        </div>
      </div>

      {!rows.length ? (
        <div className="card p-10">
          <EmptyState icon={IdCard} title="No profiles yet" text="Start from a company or personal template. You can change everything later." action={<button className="btn-primary" onClick={() => setCreate({ template: 'company', title: '', name: '' })}><Plus className="h-4 w-4" /> Create your first profile</button>} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className="card flex flex-col overflow-hidden">
              <Link to={`/app/profiles/${p.id}`} className="flex h-28 items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 text-white">
                {p.type === 'personal' ? <User className="h-10 w-10 text-accent-400" /> : <Building2 className="h-10 w-10 text-accent-400" />}
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/app/profiles/${p.id}`} className="font-semibold text-navy-900 hover:text-brand-700">{p.title}</Link>
                  {p.is_public && <span className="badge bg-emerald-50 text-emerald-700"><Globe className="h-3 w-3" /> Public</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {p.type === 'personal' ? 'Personal' : 'Company'} · Updated {fmtDate(p.updated_at)} · {p.download_count} downloads
                </p>
                {all && <p className="mt-1 text-xs text-slate-500">Owner: {p.owner_name} ({p.owner_email})</p>}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                  <Link to={`/app/profiles/${p.id}`} className="btn-primary btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
                  <button className="btn-outline btn-sm" onClick={() => download(p)}><Download className="h-3.5 w-3.5" /> PDF</button>
                  <button className="btn-ghost btn-sm" onClick={() => duplicate(p)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(p)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!create}
        onClose={() => setCreate(null)}
        title="Create a new profile"
        size="max-w-lg"
        footer={
          <>
            <button className="btn-outline" onClick={() => setCreate(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Sparkles className="h-4 w-4" />} Create</button>
          </>
        }
      >
        {create && (
          <div className="space-y-4">
            <Field label="Start from">
              <div className="grid gap-2">
                {meta.templates.map((t) => (
                  <label key={t.key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${create.template === t.key ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                    <input type="radio" checked={create.template === t.key} onChange={() => setCreate({ ...create, template: t.key })} />
                    {t.type === 'personal' ? <User className="h-4 w-4 text-slate-500" /> : <Building2 className="h-4 w-4 text-slate-500" />}
                    {t.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={meta.templates.find((t) => t.key === create.template)?.type === 'personal' ? 'Person’s name' : 'Company name'}>
              <input className="input" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} placeholder="Shown on the cover" />
            </Field>
            <Field label="Profile title (for your list)">
              <input className="input" value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value })} placeholder="e.g. Company profile 2026" />
            </Field>
            {isAdmin && (
              <Field label="Create in a customer’s account (optional)" hint="Leave empty to keep it in your own account.">
                <input className="input" type="email" value={create.owner_email || ''} onChange={(e) => setCreate({ ...create, owner_email: e.target.value })} placeholder="customer@email.com" />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ public share page */
export function PublicProfile() {
  const { slug } = useParams();
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/profiles/public/${slug}`, { responseType: 'text' }).then(({ data }) => setHtml(data)).catch((e) => setError(errMsg(e)));
  }, [slug]);
  const download = async () => {
    setBusy(true);
    try {
      await downloadProfilePdf({ slug, title: slug.replace(/-[0-9a-f]{8}$/, ''), pdfAvailable: true });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  if (error) return <div className="flex min-h-screen items-center justify-center p-6"><EmptyState icon={FileText} title="Profile not available" text="The owner may have made it private." /></div>;
  if (html === null) return <PageLoader />;
  return (
    <div className="flex h-screen flex-col bg-slate-200">
      <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-2.5">
        <Link to="/profile-builder" className="text-xs text-slate-500 hover:text-brand-700">Made with Profile Builder</Link>
        <button className="btn-primary btn-sm" disabled={busy} onClick={download}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Download className="h-4 w-4" />} Download PDF</button>
      </div>
      <iframe title="Profile" srcDoc={html} className="w-full flex-1 border-0" sandbox="allow-same-origin allow-modals allow-popups" />
    </div>
  );
}

/* ------------------------------------------------------------------ marketing page */
export function Landing() {
  const { user } = useAuth();
  const start = user ? '/app' : '/signup';
  const features = [
    [Building2, 'Company profiles', 'Cover page, about us, services, projects, methodology and contact, ready for clients and government offices.'],
    [User, 'Personal profiles', 'A professional profile with photo, expertise, experience timeline, education and highlights.'],
    [LayoutTemplate, 'Section by section', 'Add, reorder, hide or remove sections: text, cards, tables, projects, timelines, galleries and more.'],
    [Palette, 'Your brand colours', 'Pick a theme or set your own colours. Upload your logo, photos and project screenshots.'],
    [Download, 'Download as PDF', 'A4, print-ready PDF with cover, page numbers and consistent design. Update and download again any time.'],
    [Globe, 'Share a link', 'Make a profile public and share one link. Visitors can view it and download the PDF.'],
  ];
  return (
    <div>
      <Seo title="Profile Builder – create your company or personal profile" description="Create a professional company profile or personal profile online and download it as a PDF." />
      <section className="bg-navy-900 py-20 text-white">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-400">Profile Builder</span>
          <h1 className="mt-6 font-display text-4xl font-bold leading-tight sm:text-5xl">Create a professional company or personal profile in minutes</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/70">Fill in your details, add your projects and download a premium, print-ready PDF. Built for businesses, professionals and the clients you work for.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={start} className="btn-accent !px-7 !py-3.5 text-base"><Sparkles className="h-5 w-5" /> {user ? 'Open my profiles' : 'Create your profile free'}</Link>
            {!user && <Link to="/login" className="btn !border !border-white/20 !px-7 !py-3.5 text-base text-white hover:bg-white/10">Login</Link>}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([I, t, d]) => (
          <div key={t} className="card p-6">
            <div className="w-fit rounded-xl bg-brand-50 p-2.5 text-brand-700"><I className="h-5 w-5" /></div>
            <h3 className="mt-4 font-semibold text-navy-900">{t}</h3>
            <p className="mt-2 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
      <section className="pb-20 text-center">
        <Link to={start} className="btn-primary !px-7 !py-3.5 text-base"><Sparkles className="h-5 w-5" /> Get started</Link>
      </section>
    </div>
  );
}
