import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState, QueryView } from '@/components/ui/misc';
import { useStore } from './StoreApp';

export default function Workshops() {
  const { store } = useStore();
  const q = useQuery({ queryKey: ['store-workshops', store.slug], queryFn: () => api.get(`/store/${store.slug}/workshops`) });
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="mb-6 text-3xl font-bold">Live workshops</h1>
      <QueryView q={q}>
        {(d) =>
          d.items.length === 0 ? <EmptyState icon={<Calendar />} title="No upcoming workshops" /> : (
            <div className="space-y-3">
              {d.items.map((w: any) => (
                <Link key={w.id} to={w.id} className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted">
                  <div><p className="font-semibold">{w.title}</p><p className="text-sm text-muted-foreground">{dateTime(w.startsAt)} ({w.timezone})</p></div>
                  <div className="text-right">{w.productId ? <Badge variant="warning">Paid</Badge> : <Badge variant="success">Free</Badge>}{w.seatsLeft !== null && <p className="mt-1 text-xs text-muted-foreground">{w.seatsLeft > 0 ? `${w.seatsLeft} seats left` : w.waitlistEnabled ? 'Waitlist open' : 'Sold out'}</p>}</div>
                </Link>
              ))}
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
