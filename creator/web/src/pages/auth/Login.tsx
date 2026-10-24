import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Tabs, TabPanel } from '@/components/ui/menu';
import { AuthCard, safeNext } from './shared';

export default function Login() {
  const { signedIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const google = useQuery({ queryKey: ['google'], queryFn: () => api.get<{ enabled: boolean }>('/auth/google/status') });

  const finish = async (r: { accessToken: string; user: { platformRole: string } }) => {
    await signedIn(r);
    nav(next ?? (r.user.platformRole === 'SUPER_ADMIN' ? '/admin' : '/app'), { replace: true });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onPassword = (e: FormEvent) => {
    e.preventDefault();
    run(async () => finish(await api.post('/auth/login', { email, password })));
  };

  const onOtp = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!codeSent) {
        const r = await api.post<{ devCode?: string }>('/auth/otp/request', { email });
        setCodeSent(true);
        toast.success('If an account exists, we have emailed a 6-digit code.');
        if (r.devCode) toast.info(`Development code: ${r.devCode}`);
      } else {
        await finish(await api.post('/auth/otp/verify', { email, code }));
      }
    });
  };

  return (
    <AuthCard title="Welcome back" description="Sign in to your account" footer={<>New here? <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>}>
      {google.data?.enabled && (
        <>
          <Button asChild variant="outline" className="w-full">
            <a href="/api/auth/google/start">Continue with Google</a>
          </Button>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
        </>
      )}
      <Tabs value={mode} onValueChange={(v) => { setMode(v); setError(''); }} tabs={[{ value: 'password', label: 'Password' }, { value: 'otp', label: 'Email code' }]}>
        <TabPanel value="password">
          <form onSubmit={onPassword} className="space-y-4">
            <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
            <Link to="/forgot-password" className="block text-center text-sm text-muted-foreground hover:text-foreground">Forgot password?</Link>
          </form>
        </TabPanel>
        <TabPanel value="otp">
          <form onSubmit={onOtp} className="space-y-4">
            <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={codeSent} /></Field>
            {codeSent && (
              <Field label="6-digit code" hint="Check your inbox. The code expires in 10 minutes.">
                <Input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>{codeSent ? 'Sign in' : 'Email me a code'}</Button>
            {codeSent && <Button type="button" variant="link" className="w-full" onClick={() => { setCodeSent(false); setCode(''); }}>Use a different email</Button>}
          </form>
        </TabPanel>
      </Tabs>
    </AuthCard>
  );
}
