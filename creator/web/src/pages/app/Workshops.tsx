import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Radio, Users } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime, toLocalInput } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { MediaPicker } from '@/components/app/MediaPicker';
import { useWs } from './workspace';

const blank = () => {
  const start = new Date(Date.now() + 7 * 86400_000);
  start.setMinutes(0, 0, 0);
  return { id: '', title: '', description: '', startsAt: toLocalInput(start), endsAt: toLocalInput(new Date(start.getTime() + 3600_000)), capacity: '', waitlistEnabled: true, meetingProvider: 'CUSTOM_LINK', meetingUrl: '', productId: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
};

function Registrations({ id, onClose }: { id: string; onClose: () => void }) {
  const ws = useWs();
  const q = useQuery({ queryKey: ['registrations', id], queryFn: () => ws.get(`/workshops/${id}/registrations`) });
  const [picker, setPicker] = useState(false);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Registrations & attendance" wide>
      <QueryView q={q}>
        {(d) => (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => { await ws.post(`/workshops/${id}/attendance`, { userIds: d.registrations.filter((r: any) => r.status === 'REGISTERED').map((r: any) => r.userId), attended: true }); q.refetch(); toast.success('Marked everyone present'); }}>Mark all attended</Button>
              <Button size="sm" variant="outline" onClick={() => setPicker(true)}>Attach recording for replay</Button>
              {d.workshop.recordingAssetId && <span className="text-sm text-muted-foreground">Replay attached ✓</span>}
            </div>
            <Table head={['Attendee', 'Status', 'Attended']} empty={!d.registrations.length}>
              {d.registrations.map((r: any) => (
                <tr key={r.id}>
                  <Td>{r.user?.name}<span className="block text-xs text-muted-foreground">{r.user?.email}</span></Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td>{r.status === 'REGISTERED' && <input type="checkbox" checked={!!r.attendedAt} aria-label="Attended" onChange={async (e) => { await ws.post(`/workshops/${id}/attendance`, { userIds: [r.userId], attended: e.target.checked }); q.refetch(); }} />}</Td>
                </tr>
              ))}
            </Table>
            <MediaPicker open={picker} onOpenChange={setPicker} kind="VIDEO" onPick={async (a) => { try { await ws.post(`/workshops/${id}/recording`, { mediaAssetId: a.id, replayEnabled: true }); toast.success('Recording attached – registered attendees can watch the replay'); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }} />
          </div>
        )}
      </QueryView>
    </Modal>
  );
}

export default function Workshops() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['workshops', ws.slug], queryFn: () => ws.get('/workshops') });
  const products = useQuery({ queryKey: ['products-workshop', ws.slug], queryFn: () => ws.get('/products?pageSize=100&type=WORKSHOP') });
  const [f, setF] = useState<ReturnType<typeof blank> | null>(null);
  const [regs, setRegs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f) return;
    setBusy(true);
    const body = {
      title: f.title,
      description: f.description || null,
      startsAt: new Date(f.startsAt).toISOString(),
      endsAt: new Date(f.endsAt).toISOString(),
      timezone: f.timezone,
      capacity: f.capacity ? Number(f.capacity) : null,
      waitlistEnabled: f.waitlistEnabled,
      meetingProvider: f.meetingProvider,
      meetingUrl: f.meetingUrl || null,
      productId: f.productId || null,
    };
    try {
      if (f.id) await ws.put(`/workshops/${f.id}`, body);
      else await ws.post('/workshops', body);
      toast.success('Workshop saved');
      setF(null);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Live workshops" description="Join links are only shown to registered attendees after sign-in." actions={<Button onClick={() => setF(blank())}><Plus /> New workshop</Button>} />
      <QueryView q={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={<Radio />} title="No workshops yet" description="Host free or paid live sessions with capacity limits, waitlists and reminders." action={<Button onClick={() => setF(blank())}><Plus /> Schedule a workshop</Button>} />
          ) : (
            <Table head={['Workshop', 'When', 'Seats', 'Status', '']}>
              {d.items.map((w: any) => (
                <tr key={w.id}>
                  <Td className="font-medium">{w.title}{w.productId && <span className="block text-xs text-muted-foreground">Paid ticket</span>}</Td>
                  <Td className="whitespace-nowrap">{dateTime(w.startsAt)}</Td>
                  <Td>{w.registered}{w.capacity ? `/${w.capacity}` : ''}{w.waitlisted > 0 && <span className="block text-xs text-muted-foreground">{w.waitlisted} waitlisted</span>}</Td>
                  <Td><StatusBadge status={w.status} /></Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setRegs(w.id)}><Users /> People</Button>
                      {w.status === 'DRAFT' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setF({ ...blank(), ...w, startsAt: toLocalInput(w.startsAt), endsAt: toLocalInput(w.endsAt), capacity: w.capacity ?? '', meetingUrl: w.meetingUrl ?? '', productId: w.productId ?? '', description: w.description ?? '' })}>Edit</Button>
                          <Button size="sm" onClick={async () => { try { await ws.post(`/workshops/${w.id}/publish`); toast.success('Published'); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Publish</Button>
                        </>
                      )}
                      {w.status === 'PUBLISHED' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${location.origin}/s/${ws.slug}/workshops/${w.id}`); toast.success('Registration link copied'); }}>Copy link</Button>
                          <ConfirmButton title="Cancel this workshop?" description="Everyone registered or waitlisted is emailed. Refund paid tickets from Orders." confirmLabel="Cancel workshop" onConfirm={async () => { const r = await ws.post(`/workshops/${w.id}/cancel`, {}); toast.success(`Cancelled · ${r.notified} people notified`); q.refetch(); }}>Cancel</ConfirmButton>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
      </QueryView>
      {f && (
        <Modal open onOpenChange={(v) => !v && setF(null)} title={f.id ? 'Edit workshop' : 'New workshop'} wide>
          <form onSubmit={save} className="space-y-3">
            <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Starts"><Input type="datetime-local" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
              <Field label="Ends"><Input type="datetime-local" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
              <Field label="Capacity" hint="Empty = unlimited"><Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
            </div>
            <Checkbox checked={f.waitlistEnabled} onChange={(v) => setF({ ...f, waitlistEnabled: v })} label="Enable waitlist when full" description="Waitlisted people are moved in automatically when someone cancels." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Meeting provider" hint={!d_zoomConnected(q.data) && f.meetingProvider === 'ZOOM' ? 'Connect Zoom in Settings › Integrations first' : undefined}>
                <Select value={f.meetingProvider} onChange={(e) => setF({ ...f, meetingProvider: e.target.value })}>
                  <option value="CUSTOM_LINK">Meeting link (any platform)</option>
                  <option value="GOOGLE_MEET">Google Meet link</option>
                  <option value="ZOOM">Zoom (create automatically)</option>
                </Select>
              </Field>
              {f.meetingProvider !== 'ZOOM' && <Field label="Meeting link"><Input type="url" value={f.meetingUrl} onChange={(e) => setF({ ...f, meetingUrl: e.target.value })} placeholder="https://meet.google.com/…" /></Field>}
            </div>
            <Field label="Paid ticket" hint="Leave empty for a free workshop. Create a 'Workshop ticket' product to sell seats.">
              <Select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
                <option value="">Free registration</option>
                {products.data?.items.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setF(null)}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
          </form>
        </Modal>
      )}
      {regs && <Registrations id={regs} onClose={() => setRegs(null)} />}
    </>
  );
}

function d_zoomConnected(d: any) {
  return !!d?.zoomConnected;
}
