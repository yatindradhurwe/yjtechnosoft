import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthCard, safeNext } from './shared';

export default function Signup() {
  const { signedIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const r = await api.post<{ accessToken: string; devCode?: string }>('/auth/signup', form);
      await signedIn(r);
      if (r.devCode) toast.info(`Development verification code: ${r.devCode}`, { duration: 20000 });
      // Buyers return to where they came from; creators verify and create a workspace
      nav(next ?? '/verify-email', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0]])));
      else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthCard title="Create your account" description="Start free – no card required" footer={<>Already have an account? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-primary hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" error={errors.name}><Input autoComplete="name" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Email" error={errors.email}><Input type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters with a number"><Input type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} /></Field>
        {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
        <p className="text-center text-xs text-muted-foreground">By continuing you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy policy</Link>.</p>
      </form>
    </AuthCard>
  );
}
