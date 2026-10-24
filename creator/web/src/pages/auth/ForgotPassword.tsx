import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { AuthCard } from './shared';

export default function ForgotPassword() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!sent) {
        const r = await api.post<{ devCode?: string }>('/auth/password/forgot', { email });
        setSent(true);
        if (r.devCode) toast.info(`Development code: ${r.devCode}`);
      } else {
        await api.post('/auth/password/reset', { email, code, password });
        toast.success('Password updated. Please sign in.');
        nav('/login');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Reset your password" description={sent ? 'Enter the code we emailed you and a new password.' : 'We will email you a 6-digit code.'} footer={<Link to="/login" className="text-primary hover:underline">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} /></Field>
        {sent && (
          <>
            <Field label="Code"><Input inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="New password" hint="At least 8 characters with a number"><Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{sent ? 'Update password' : 'Send code'}</Button>
      </form>
    </AuthCard>
  );
}
