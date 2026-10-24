import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date, dateTime, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/dialog';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function CustomerDetail() {
  const { contactId = '' } = useParams();
  const ws = useWs();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['contact', contactId], queryFn: () => ws.get(`/customers/${contactId}`) });
  const [tags, setTags] = useState('');
  const [phone, setPhone] = useState('');
  const [wa, setWa] = useState(false);
  useEffect(() => {
    if (q.data) {
      setTags(q.data.contact.tags.join(', '));
      setPhone(q.data.contact.phone ?? '');
      setWa(q.data.contact.consentWhatsapp);
    }
  }, [q.data]);

  return (
    <QueryView q={q}>
      {(d) => (
        <>
          <PageHeader
            back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Customers</Link>}
            title={d.contact.name ?? d.contact.email}
            description={`${d.contact.email} · source: ${d.contact.source ?? 'unknown'} · added ${date(d.contact.createdAt)}`}
            actions={ws.can('customers.write') && <ConfirmButton title="Delete this contact?" description="Their orders and enrolments stay; only the CRM record is removed." onConfirm={async () => { await ws.del(`/marketing/contacts/${contactId}`); nav('..', { relative: 'path' }); }}>Delete contact</ConfirmButton>}
          />
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Purchases</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {d.orders.length === 0 && <p className="text-muted-foreground">No orders.</p>}
                  {d.orders.map((o: any) => <Link key={o.id} to={`../../orders/${o.id}`} relative="path" className="flex justify-between rounded-md p-2 hover:bg-muted"><span>#{o.number} · {o.items.map((i: any) => i.title).join(', ')}</span><span>{money(o.total, o.currency)} <StatusBadge status={o.status} /></span></Link>)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Courses</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {d.enrollments.length === 0 && <p className="text-muted-foreground">Not enrolled in any course.</p>}
                  {d.enrollments.map((e: any) => <div key={e.id} className="flex justify-between"><span>{e.course.title}</span><span>{e.progressPct}% · <StatusBadge status={e.status} /></span></div>)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {d.messages.length === 0 && <p className="text-muted-foreground">No messages sent.</p>}
                  {d.messages.map((m: any) => <div key={m.id} className="flex justify-between"><span>{m.channel.toLowerCase()} · {m.subject}</span><span className="text-xs text-muted-foreground">{dateTime(m.createdAt)} <StatusBadge status={m.status} /></span></div>)}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">{d.contact.consentEmail ? <Badge variant="success">Email consent</Badge> : <Badge variant="outline">No email consent</Badge>}{d.contact.unsubscribedAt && <Badge variant="destructive">Unsubscribed</Badge>}</div>
                <Field label="Tags" hint="Comma separated. Adding a tag can trigger automations."><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
                <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
                <Checkbox checked={wa} onChange={setWa} label="Agreed to WhatsApp messages" />
                <Button disabled={!ws.can('customers.write')} onClick={async () => { try { await ws.patch(`/marketing/contacts/${contactId}`, { tags: tags.split(',').map((t) => t.trim()).filter(Boolean), phone: phone || null, consentWhatsapp: wa }); toast.success('Saved'); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Save</Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </QueryView>
  );
}
