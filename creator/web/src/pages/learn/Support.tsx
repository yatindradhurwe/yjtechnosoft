import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView } from '@/components/ui/misc';
import { useAuth } from '@/lib/auth';

export default function Support() {
  const { workspaces } = useAuth();
  const q = useQuery({ queryKey: ['tickets'], queryFn: () => api.get('/support') });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const ticket = useQuery({ queryKey: ['ticket', view], queryFn: () => api.get(`/support/${view}`), enabled: !!view });
  const [f, setF] = useState({ subject: '', body: '', tenantId: '', priority: 'normal' });
  const [reply, setReply] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/support', { ...f, tenantId: f.tenantId || undefined });
      toast.success('Ticket created – we will reply by email');
      setOpen(false);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Help & support" description="Contact the platform support team." actions={<Button onClick={() => setOpen(true)}><Plus /> New ticket</Button>} />
      <QueryView q={q}>
        {(d) =>
          d.tickets.length === 0 ? (
            <EmptyState icon={<LifeBuoy />} title="No tickets" />
          ) : (
            <div className="space-y-2">
              {d.tickets.map((t: any) => (
                <button key={t.id} onClick={() => setView(t.id)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:bg-muted">
                  <span>{t.subject}<span className="block text-xs text-muted-foreground">Updated {dateTime(t.updatedAt)}</span></span>
                  <StatusBadge status={t.status} />
                </button>
              ))}
            </div>
          )
        }
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="New support ticket">
        <form onSubmit={create} className="space-y-3">
          <Field label="Subject"><Input required minLength={3} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Workspace (optional)"><Select value={f.tenantId} onChange={(e) => setF({ ...f, tenantId: e.target.value })}><option value="">—</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
          <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
          <Field label="How can we help?"><Textarea required minLength={5} rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="submit">Send</Button></div>
        </form>
      </Modal>
      {view && (
        <Modal open onOpenChange={() => setView(null)} title={ticket.data?.ticket.subject ?? 'Ticket'} wide>
          <QueryView q={ticket}>
            {(d) => (
              <div className="space-y-3">
                {d.ticket.messages.map((m: any) => <div key={m.id} className="rounded-md border p-3 text-sm"><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(m.createdAt)}</p></div>)}
                <form onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/support/${view}/messages`, { body: reply }); setReply(''); ticket.refetch(); } catch (err) { toast.error(errorMessage(err)); } }} className="space-y-2">
                  <Textarea required value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" />
                  <Button type="submit" size="sm">Reply</Button>
                </form>
              </div>
            )}
          </QueryView>
        </Modal>
      )}
    </>
  );
}
