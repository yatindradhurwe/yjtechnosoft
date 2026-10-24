import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { QueryView } from '@/components/ui/misc';
import { useStore } from './StoreApp';

export default function WorkshopPage() {
  const { workshopId = '' } = useParams();
  const { store } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['store-workshop', workshopId, user?.id], queryFn: () => api.get(`/store/${store.slug}/workshops/${workshopId}`) });

  const register = async () => {
    if (!user) return nav(`/signup?next=${encodeURIComponent(location.pathname)}`);
    setBusy(true);
    try {
      const r = await api.post(`/store/${store.slug}/workshops/${workshopId}/register`);
      toast.success(r.registration.status === 'WAITLISTED' ? "It's full – you're on the waitlist" : "You're registered! Check your email.");
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-3xl py-10">
      <QueryView q={q}>
        {(d) => {
          const w = d.workshop;
          const mins = Math.round((new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime()) / 60000);
          return (
            <Card>
              <CardContent className="space-y-5 pt-8">
                <h1 className="text-3xl font-bold">{w.title}</h1>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {dateTime(w.startsAt)}</span>
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {mins} min · {w.timezone}</span>
                  {w.seatsLeft !== null && <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {w.seatsLeft} seats left</span>}
                </div>
                {w.description && <p className="whitespace-pre-wrap text-muted-foreground">{w.description}</p>}
                {d.registration && d.registration.status !== 'CANCELED' ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2">Your status: <StatusBadge status={d.registration.status} /></p>
                    <div className="flex gap-2">
                      <Button asChild><Link to="/learn/workshops">Join details</Link></Button>
                      <Button variant="outline" onClick={async () => { await api.post(`/store/${store.slug}/workshops/${workshopId}/cancel`); toast.success('Registration cancelled'); q.refetch(); }}>Cancel registration</Button>
                    </div>
                  </div>
                ) : w.productId && d.product ? (
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="brand" size="lg"><Link to={`/s/${store.slug}/p/${d.product.slug}`}>Buy a ticket</Link></Button>
                    {user && <Button variant="outline" size="lg" loading={busy} onClick={register}>I have a ticket – register</Button>}
                  </div>
                ) : (
                  <Button variant="brand" size="lg" loading={busy} onClick={register}>{w.seatsLeft === 0 ? 'Join the waitlist' : 'Register for free'}</Button>
                )}
              </CardContent>
            </Card>
          );
        }}
      </QueryView>
    </div>
  );
}
