import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, QueryView } from '@/components/ui/misc';
import { useStore } from './StoreApp';

export default function Communities() {
  const { store, products } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['store-communities', store.slug, user?.id], queryFn: () => api.get(`/community/store/${store.slug}`), enabled: !!user });
  if (!user)
    return (
      <div className="container max-w-lg py-16 text-center">
        <Users className="mx-auto h-10 w-10 text-[var(--brand)]" />
        <h1 className="mt-3 text-2xl font-bold">Join the {store.name} community</h1>
        <p className="mt-2 text-muted-foreground">Sign in to see the community spaces.</p>
        <Button asChild className="mt-6" variant="brand"><Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link></Button>
      </div>
    );
  const memberships = products.filter((p) => p.type === 'MEMBERSHIP');
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="mb-6 text-3xl font-bold">Community</h1>
      <QueryView q={q}>
        {(d) =>
          d.communities.length === 0 ? <EmptyState icon={<Users />} title="No community yet" /> : (
            <div className="space-y-4">
              {d.communities.map((c: any) => (
                <Card key={c.id}>
                  <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{c.name}</CardTitle>{c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}</div><Badge variant={c.access === 'PAID' ? 'warning' : 'success'}>{c.access === 'PAID' ? 'Members' : 'Free'}</Badge></CardHeader>
                  <CardContent>
                    {c.canAccess ? (
                      <Button asChild variant="brand"><Link to={`/community/${c.id}`}>Open</Link></Button>
                    ) : c.access === 'FREE' ? (
                      <Button variant="brand" onClick={async () => { try { await api.post(`/community/${c.id}/join`); nav(`/community/${c.id}`); } catch (e) { toast.error(errorMessage(e)); } }}>Join for free</Button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2"><Lock className="h-4 w-4" />{memberships.map((m) => <Button key={m.id} asChild size="sm" variant="outline"><Link to={`/s/${store.slug}/p/${m.slug}`}>Get {m.title}</Link></Button>)}{memberships.length === 0 && <span className="text-sm text-muted-foreground">Membership required</span>}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
