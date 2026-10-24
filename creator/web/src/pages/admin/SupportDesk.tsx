import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { cn, dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Select, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';

export default function SupportDesk() {
  const [status, setStatus] = useState('OPEN');
  const [active, setActive] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['admin-tickets', status], queryFn: () => api.get(`/admin/support${status ? `?status=${status}` : ''}`) });
  const t = useQuery({ queryKey: ['admin-ticket', active], queryFn: () => api.get(`/admin/support/${active}`), enabled: !!active });
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [next, setNext] = useState('');
  return (
    <>
      <PageHeader title="Support desk" description="Replies are emailed to the customer; internal notes are not." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option>{['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</Select>
          <QueryView q={list}>
            {(d) => (
              <div className="space-y-1">
                {d.tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets.</p>}
                {d.tickets.map((x: any) => (
                  <button key={x.id} onClick={() => setActive(x.id)} className={cn('w-full rounded-md border p-3 text-left text-sm', active === x.id ? 'border-primary bg-accent' : 'hover:bg-muted')}>
                    <span className="flex justify-between gap-2"><span className="truncate font-medium">{x.subject}</span><StatusBadge status={x.status} /></span>
                    <span className="block text-xs text-muted-foreground">{x.user?.email} · {dateTime(x.updatedAt)}{x.priority === 'high' && ' · high priority'}</span>
                  </button>
                ))}
              </div>
            )}
          </QueryView>
        </div>
        {active ? (
          <QueryView q={t}>
            {(d) => (
              <Card>
                <CardHeader><CardTitle>{d.ticket.subject}</CardTitle><p className="text-sm text-muted-foreground">{d.user?.name} · {d.user?.email}</p></CardHeader>
                <CardContent className="space-y-3">
                  {d.ticket.messages.map((m: any) => (
                    <div key={m.id} className={cn('rounded-md border p-3 text-sm', m.internal && 'border-warning/40 bg-warning/5', m.authorId !== d.ticket.userId && !m.internal && 'bg-muted')}>
                      {m.internal && <Badge variant="warning" className="mb-1">internal note</Badge>}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{dateTime(m.createdAt)}</p>
                    </div>
                  ))}
                  <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" aria-label="Reply" />
                  <div className="flex flex-wrap items-center gap-3">
                    <Checkbox checked={internal} onChange={setInternal} label="Internal note" />
                    <Select value={next} onChange={(e) => setNext(e.target.value)} className="w-44" aria-label="Set status"><option value="">Keep status</option>{['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</Select>
                    <Button disabled={!body} onClick={async () => { try { await api.post(`/admin/support/${active}/reply`, { body, internal, status: next || undefined }); setBody(''); t.refetch(); list.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Send</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </QueryView>
        ) : <p className="text-sm text-muted-foreground">Select a ticket.</p>}
      </div>
    </>
  );
}
