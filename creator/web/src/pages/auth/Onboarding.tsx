import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { AuthCard } from './shared';

export default function Onboarding() {
  const { user, reload } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [color, setColor] = useState('#6d28d9');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (slug.length < 2) return setAvailable(null);
    const t = setTimeout(() => api.get<{ available: boolean }>(`/workspaces/slug-available/${slug}`).then((r) => setAvailable(r.available)).catch(() => setAvailable(null)), 350);
    return () => clearTimeout(t);
  }, [slug]);

  if (user && !user.emailVerified) return <Navigate to="/verify-email" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ workspace: { slug: string } }>('/workspaces', { name, slug, currency, primaryColor: color });
      await reload();
      nav(`/app/${r.workspace.slug}?welcome=1`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create your workspace" description="This is your branded home for courses, community and sales. You can change everything later.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Business or creator name"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha's Yoga Studio" /></Field>
        <Field label="Store address" hint={available === false ? undefined : `Your storefront: /s/${slug || 'your-name'}`} error={available === false ? 'This address is taken or reserved' : undefined}>
          <div className="relative">
            <Input required value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
            {available !== null && <span className="absolute right-3 top-1/2 -translate-y-1/2">{available ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}</span>}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="INR">INR – Indian rupee</option>
              <option value="USD">USD – US dollar</option>
              <option value="EUR">EUR – Euro</option>
              <option value="GBP">GBP – Pound</option>
            </Select>
          </Field>
          <Field label="Brand colour"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" /></Field>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={available === false}>Create workspace</Button>
      </form>
    </AuthCard>
  );
}
