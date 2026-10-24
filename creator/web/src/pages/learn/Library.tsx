import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Download, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { date } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView } from '@/components/ui/misc';
import { useAuth } from '@/lib/auth';

export default function Library() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['library'], queryFn: () => api.get('/learn/library') });
  return (
    <>
      <PageHeader title={`Hi ${user?.name?.split(' ')[0] ?? ''} 👋`} description="Everything you have access to, across all creators." />
      <QueryView q={q}>
        {(d) => {
          const ws = (id: string) => d.workspaces.find((w: any) => w.id === id);
          if (!d.courses.length && !d.downloads.length && !d.subscriptions.length)
            return <EmptyState icon={<BookOpen />} title="Nothing here yet" description="Courses, downloads and memberships you buy or join will appear here." />;
          return (
            <div className="space-y-8">
              {d.courses.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">Courses</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {d.courses.map((c: any) => (
                      <Link key={c.id} to={`course/${c.id}${c.lastLessonId ? `/${c.lastLessonId}` : ''}`} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md">
                        <div className="relative aspect-video bg-muted">
                          {c.coverUrl && <img src={c.coverUrl} alt="" className="h-full w-full object-cover" />}
                          <PlayCircle className="absolute inset-0 m-auto h-12 w-12 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                        </div>
                        <div className="space-y-2 p-4">
                          <p className="text-xs text-muted-foreground">{ws(c.tenantId)?.name}</p>
                          <h3 className="font-sans font-semibold">{c.title}</h3>
                          <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${c.progressPct}%` }} /></div>
                          <p className="text-xs text-muted-foreground">{c.progressPct === 100 ? 'Completed 🎉' : c.progressPct ? `${c.progressPct}% · continue` : 'Start learning'}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {d.downloads.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">Downloads</h2>
                  <div className="space-y-2">
                    {d.downloads.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                        <span>{f.filename}<span className="block text-xs text-muted-foreground">{ws(f.tenantId)?.name}</span></span>
                        <Button size="sm" variant="outline" onClick={async () => { try { const r = await api.get(`/media/download/${f.tenantId}/${f.id}`); window.location.href = r.url; } catch (e) { toast.error(errorMessage(e)); } }}><Download /> Download</Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {d.subscriptions.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">Memberships</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {d.subscriptions.map((s: any) => {
                      const t = ws(s.tenantId);
                      return (
                        <Card key={s.id}>
                          <CardHeader className="flex-row items-center justify-between"><CardTitle>{s.product?.title}</CardTitle><StatusBadge status={s.status} /></CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <p className="text-muted-foreground">{s.status === 'GRACE' ? `Access ends ${date(s.graceUntil)} unless renewed` : `Current period ends ${date(s.currentPeriodEnd)}`}</p>
                            {t && s.product && <Button asChild size="sm" variant={['GRACE', 'EXPIRED'].includes(s.status) ? 'default' : 'outline'}><Link to={`/s/${t.slug}/p/${s.product.slug}`}>Renew</Link></Button>}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          );
        }}
      </QueryView>
    </>
  );
}
