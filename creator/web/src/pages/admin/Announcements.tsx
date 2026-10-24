import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader, QueryView } from '@/components/ui/misc';

export default function Announcements() {
  const q = useQuery({ queryKey: ['admin-announcements'], queryFn: () => api.get('/admin/announcements') });
  const [f, setF] = useState({ title: '', body: '', audience: 'creators', endsAt: '' });
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/announcements', { ...f, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined });
      setF({ title: '', body: '', audience: 'creators', endsAt: '' });
      q.refetch();
      toast.success('Announcement published');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <>
      <PageHeader title="System announcements" description="Shown on creator dashboards until they expire." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New announcement</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-3">
              <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
              <Field label="Message"><Textarea required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Audience"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="creators">Creators</option><option value="everyone">Everyone</option></Select></Field>
                <Field label="Ends (optional)"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
              </div>
              <Button type="submit">Publish</Button>
            </form>
          </CardContent>
        </Card>
        <QueryView q={q}>
          {(d) => (
            <div className="space-y-3">
              {d.announcements.map((a: any) => (
                <Card key={a.id}><CardContent className="space-y-1 pt-5 text-sm">
                  <div className="flex justify-between"><p className="font-semibold">{a.title}</p><ConfirmButton title="Delete announcement?" onConfirm={async () => { await api.del(`/admin/announcements/${a.id}`); q.refetch(); }}>Delete</ConfirmButton></div>
                  <p className="text-muted-foreground">{a.body}</p>
                  <p className="text-xs text-muted-foreground">{a.audience} · from {dateTime(a.startsAt)}{a.endsAt && ` to ${dateTime(a.endsAt)}`}</p>
                </CardContent></Card>
              ))}
            </div>
          )}
        </QueryView>
      </div>
    </>
  );
}
