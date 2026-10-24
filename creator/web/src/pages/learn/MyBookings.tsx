import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Video } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView } from '@/components/ui/misc';

export default function MyBookings() {
  const q = useQuery({ queryKey: ['my-bookings'], queryFn: () => api.get('/learn/bookings') });
  const [moving, setMoving] = useState<any>(null);
  const [when, setWhen] = useState('');
  return (
    <>
      <PageHeader title="1:1 sessions" description="Reschedule or cancel up to 24 hours before a session." />
      <QueryView q={q}>
        {(d) =>
          d.bookings.length === 0 ? (
            <EmptyState icon={<Calendar />} title="No sessions booked" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {d.bookings.map((b: any) => {
                const future = new Date(b.startsAt).getTime() - Date.now() > 24 * 3600_000;
                return (
                  <Card key={b.id}>
                    <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{b.offering.title}</CardTitle><p className="text-sm text-muted-foreground">{dateTime(b.startsAt)} · {b.offering.durationMin} min</p></div><StatusBadge status={b.status} /></CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {b.meetingUrl ? <Button asChild><a href={b.meetingUrl} target="_blank" rel="noreferrer"><Video /> Join</a></Button> : b.status === 'CONFIRMED' && <p className="text-sm text-muted-foreground">The host will add the meeting link.</p>}
                      {b.status === 'CONFIRMED' && future && (
                        <>
                          <Button variant="outline" onClick={() => { setMoving(b); setWhen(''); }}>Reschedule</Button>
                          <ConfirmButton title="Cancel this session?" onConfirm={async () => { try { const r = await api.post(`/learn/bookings/${b.id}/cancel`); toast.success(r.note ?? 'Cancelled'); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Cancel</ConfirmButton>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        }
      </QueryView>
      {moving && (
        <Modal open onOpenChange={() => setMoving(null)} title="Reschedule" description="Pick a new start time. It must match the host's availability." footer={<Button disabled={!when} onClick={async () => { try { await api.post(`/learn/bookings/${moving.id}/reschedule`, { startsAt: new Date(when).toISOString() }); toast.success('Rescheduled'); setMoving(null); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Confirm</Button>}>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="New time" />
        </Modal>
      )}
    </>
  );
}
