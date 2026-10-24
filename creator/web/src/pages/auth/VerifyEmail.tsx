import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthCard } from './shared';

export default function VerifyEmail() {
  const { user, reload } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user?.emailVerified) return <Navigate to="/onboarding" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/verify-email', { code });
      await reload();
      toast.success('Email verified');
      nav('/onboarding');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Verify your email" description={<>We sent a 6-digit code to <strong>{user?.email}</strong>.</>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Code"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>Verify</Button>
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={async () => {
            try {
              const r = await api.post<{ devCode?: string }>('/auth/verify-email/resend');
              toast.success('A new code is on its way');
              if (r.devCode) toast.info(`Development code: ${r.devCode}`);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          Resend code
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => nav('/learn')}>I'm just here to learn – skip</Button>
      </form>
    </AuthCard>
  );
}
