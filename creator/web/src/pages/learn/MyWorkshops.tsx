import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, PlayCircle, Radio, Video } from 'lucide-react';
import { toast } from 'sonner';
import { api, download, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView } from '@/components/ui/misc';

export default function MyWorkshops() {
  const q = useQuery({ queryKey: ['my-workshops'], queryFn: () => api.get('/learn/workshops') });
  return (
    <>
      <PageHeader title="Workshops" description="Join links appear here for workshops you're registered for." />
      <QueryView q={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={<Radio />} title="No workshops yet" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {d.items.map((r: any) => {
                const live = new Date(r.workshop.startsAt).getTime() - Date.now() < 30 * 60_000 && new Date(r.workshop.endsAt) > new Date();
                return (
                  <Card key={r.workshop.id}>
                    <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{r.workshop.title}</CardTitle><p className="text-sm text-muted-foreground">{r.tenant?.name} · {dateTime(r.workshop.startsAt)}</p></div><StatusBadge status={r.workshop.status === 'CANCELED' ? 'CANCELED' : r.status} /></CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {r.workshop.meetingUrl && new Date(r.workshop.endsAt) > new Date() && <Button asChild variant={live ? 'default' : 'outline'}><a href={r.workshop.meetingUrl} target="_blank" rel="noreferrer"><Video /> {live ? 'Join now' : 'Join link'}</a></Button>}
                      {r.workshop.replayUrl && <Button asChild variant="outline"><a href={r.workshop.replayUrl} target="_blank" rel="noreferrer"><PlayCircle /> Watch replay</a></Button>}
                      {r.status === 'REGISTERED' && new Date(r.workshop.startsAt) > new Date() && <Button variant="ghost" onClick={() => download(`/learn/workshops/${r.workshop.id}/calendar.ics`, 'workshop.ics').catch((e) => toast.error(errorMessage(e)))}><CalendarPlus /> Add to calendar</Button>}
                      {r.status === 'WAITLISTED' && <p className="text-sm text-muted-foreground">You're on the waitlist. We'll email you if a seat opens.</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        }
      </QueryView>
    </>
  );
}
