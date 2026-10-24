import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/form';
import { EmptyState, QueryView } from '@/components/ui/misc';
import { useStore } from './StoreApp';

function SlotPicker({ offering }: { offering: any }) {
  const { store } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['slots', offering.id], queryFn: () => api.get(`/store/${store.slug}/consultations/${offering.id}/slots?days=21`) });
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const s of q.data?.slots ?? []) {
      const k = new Date(s.startsAt).toLocaleDateString('en-CA');
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [q.data]);
  const days = [...byDay.keys()];
  const activeDay = day ?? days[0];

  const book = async () => {
    if (!user) return nav(`/signup?next=${encodeURIComponent(location.pathname)}`);
    setBusy(true);
    try {
      await api.post(`/store/${store.slug}/consultations/${offering.id}/book`, { startsAt: slot, notes: notes || undefined });
      toast.success('Booked! Check your email for details.');
      nav('/learn/bookings');
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && offering.productSlug) {
        toast.message('Purchase this session first, then come back to pick a time.');
        nav(`/s/${store.slug}/p/${offering.productSlug}`);
      } else {
        toast.error(errorMessage(e));
        q.refetch();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <QueryView q={q}>
      {() =>
        days.length === 0 ? (
          <EmptyState icon={<Calendar />} title="No times available" description="Please check back later." />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Times shown in your time zone ({tz}).</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => (
                <button key={d} onClick={() => { setDay(d); setSlot(null); }} className={cn('min-w-[84px] rounded-lg border px-3 py-2 text-center text-sm', activeDay === d ? 'border-[var(--brand)] bg-[var(--brand)]/10 font-semibold' : 'hover:bg-muted')}>
                  {new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short' })}<span className="block">{new Date(`${d}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(byDay.get(activeDay!) ?? []).map((s) => (
                <button key={s.startsAt} onClick={() => setSlot(s.startsAt)} className={cn('rounded-md border py-2 text-sm', slot === s.startsAt ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'hover:bg-muted')} aria-pressed={slot === s.startsAt}>
                  {new Date(s.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </button>
              ))}
            </div>
            {slot && (
              <div className="space-y-3">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you'd like to discuss? (optional)" aria-label="Notes" />
                <Button variant="brand" className="w-full" loading={busy} onClick={book}>Confirm {new Date(slot).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Button>
              </div>
            )}
          </div>
        )
      }
    </QueryView>
  );
}

export default function Booking() {
  const { offeringId } = useParams();
  const { store } = useStore();
  const q = useQuery({ queryKey: ['offerings-public', store.slug], queryFn: () => api.get(`/store/${store.slug}/consultations`) });
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="mb-6 text-3xl font-bold">Book a session</h1>
      <QueryView q={q}>
        {(d) => {
          const offering = d.offerings.find((o: any) => o.id === offeringId);
          if (offering)
            return (
              <Card>
                <CardHeader><CardTitle>{offering.title}</CardTitle><p className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> {offering.durationMin} minutes{offering.productSlug && ' · paid session'}</p></CardHeader>
                <CardContent className="space-y-4">
                  {offering.description && <p className="text-sm text-muted-foreground">{offering.description}</p>}
                  <SlotPicker offering={offering} />
                </CardContent>
              </Card>
            );
          return d.offerings.length === 0 ? (
            <EmptyState icon={<Calendar />} title="No sessions available" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {d.offerings.map((o: any) => (
                <Link key={o.id} to={o.id} className="rounded-xl border p-5 hover:bg-muted">
                  <p className="font-semibold">{o.title}</p>
                  <p className="text-sm text-muted-foreground">{o.durationMin} min · {o.productSlug ? 'Paid' : 'Free'}</p>
                </Link>
              ))}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
