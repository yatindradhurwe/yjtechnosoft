import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn, Mail, Lock, ArrowLeft, ShieldCheck, CalendarCheck, Receipt, Users } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';
import { Logo, Seo } from '../../components/site/Layout';

function Shell({ children, title, subtitle }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <Seo title={title} />
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="grid-bg absolute inset-0" />
        <div className="absolute -left-20 top-20 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/"><Logo light className="h-12" /></Link>
          <div>
            <h2 className="text-4xl font-bold leading-tight text-white">One platform to run your <span className="text-gradient">entire business</span></h2>
            <p className="mt-4 max-w-md text-white/70">Website, billing, clients, HR, attendance, payroll and documents – all managed from one secure dashboard.</p>
            <div className="mt-10 grid max-w-md grid-cols-2 gap-4">
              {[[Receipt, 'Invoices & Quotes'], [Users, 'HR & Hiring'], [CalendarCheck, 'Attendance & Leave'], [ShieldCheck, 'Role based access']].map(([I, t]) => (
                <div key={t} className="flex items-center gap-3 rounded-2xl bg-white/5 p-4 text-sm font-medium text-white/85 ring-1 ring-white/10">
                  <I className="h-5 w-5 text-accent-400" /> {t}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} YJTechnosoft Private Limited</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" /> Back to website
          </Link>
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={user.role === 'customer' ? '/app' : '/admin'} replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(f.email, f.password);
      toast.success(`Welcome back, ${u.name.split(' ')[0]}!`);
      navigate(params.get('next') || (u.role === 'customer' ? '/app' : '/admin'));
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Welcome back" subtitle="Login to your admin or employee portal.">
      {params.get('expired') && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Your session expired. Please login again.</div>}
      <form onSubmit={submit} className="space-y-5">
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input className="input !py-3 pl-11" type="email" required placeholder="Email address" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input className="input !py-3 pl-11 pr-11" type={show ? 'text' : 'password'} required placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
        </div>
        <button className="btn-primary w-full !py-3.5 text-base" disabled={busy}>
          {busy ? <Spinner className="h-5 w-5 text-white" /> : <LogIn className="h-5 w-5" />} Login
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New here? <Link to="/signup" className="font-semibold text-brand-700 hover:underline">Create a free account</Link> to build your profile.
      </p>
    </Shell>
  );
}

export function Signup() {
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={user.role === 'customer' ? '/app' : '/admin'} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signup(f);
      toast.success('Account created. Let’s build your first profile!');
      navigate('/app');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Create your account" subtitle="Build a professional company or personal profile and download it as a PDF.">
      <form onSubmit={submit} className="space-y-4">
        <input className="input !py-3" required placeholder="Full name" value={f.name} onChange={set('name')} />
        <input className="input !py-3" type="email" required placeholder="Email address" value={f.email} onChange={set('email')} />
        <input className="input !py-3" placeholder="Phone (optional)" value={f.phone} onChange={set('phone')} />
        <input className="input !py-3" type="password" required minLength={8} placeholder="Password (min 8 characters)" value={f.password} onChange={set('password')} />
        <button className="btn-primary w-full !py-3.5 text-base" disabled={busy}>
          {busy ? <Spinner className="h-5 w-5 text-white" /> : <LogIn className="h-5 w-5" />} Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Login</Link>
      </p>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Forgot password" subtitle="Enter your email and we will send you a reset link.">
      {sent ? (
        <div className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-700">If an account exists for <b>{email}</b>, a password reset link has been sent. Please check your inbox.</div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <input className="input !py-3" type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary w-full !py-3.5" disabled={busy}>{busy && <Spinner className="h-5 w-5 text-white" />} Send reset link</button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">Back to login</Link>
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [f, setF] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) return toast.error('Passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token: params.get('token'), password: f.password });
      toast.success(data.message);
      navigate('/login');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Set a new password">
      <form onSubmit={submit} className="space-y-5">
        <input className="input !py-3" type="password" required minLength={6} placeholder="New password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <input className="input !py-3" type="password" required placeholder="Confirm password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        <button className="btn-primary w-full !py-3.5" disabled={busy}>{busy && <Spinner className="h-5 w-5 text-white" />} Reset password</button>
      </form>
    </Shell>
  );
}
