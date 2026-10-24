import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { api, download, errorMessage, setAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/misc';

export default function Account() {
  const { user, reload, logout } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.patch('/auth/me', { name, phone: phone || undefined });
      await reload();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post('/auth/password/change', pw);
      setAccessToken(r.accessToken);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Account" description={user?.email} />
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-3">
            <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Password</CardTitle><CardDescription>Changing your password signs out your other devices.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <Field label="Current password" hint="Leave empty if you have never set one"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters with a number"><Input type="password" autoComplete="new-password" required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Button type="submit">Change password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your data</CardTitle><CardDescription>Download a copy of your personal data, or delete your account.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download('/auth/me/export', 'my-data.json').catch((e) => toast.error(errorMessage(e)))}><Download /> Export my data</Button>
          <ConfirmButton variant="destructive" size="md" title="Delete your account?" description="Your profile is anonymised and you lose access to all purchases. Invoices are kept for legal reasons. This cannot be undone." confirmLabel="Delete my account" onConfirm={async () => { try { await api.del('/auth/me'); await logout(); toast.success('Account deleted'); nav('/'); } catch (e) { toast.error(errorMessage(e)); } }}>
            Delete account
          </ConfirmButton>
        </CardContent>
      </Card>
    </div>
  );
}
