import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useStore } from './StoreApp';

export default function AffiliateJoin() {
  const { store } = useStore();
  const { user, reload } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className="container max-w-lg py-16">
      <Card>
        <CardContent className="space-y-4 pt-8 text-center">
          <Gift className="mx-auto h-10 w-10 text-[var(--brand)]" />
          <h1 className="text-2xl font-bold">Become a {store.name} affiliate</h1>
          <p className="text-muted-foreground">Share your personal link and earn a commission on every sale it brings in within 30 days. Applications are reviewed by {store.name}.</p>
          {user ? (
            <Button variant="brand" size="lg" loading={busy} onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/store/${store.slug}/affiliates/join`);
                await reload();
                toast.success('Application sent! You can track it in your affiliate dashboard.');
                nav('/learn/affiliate');
              } catch (e) {
                if (e instanceof ApiError && e.status === 409) nav('/learn/affiliate');
                else toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}>Apply now</Button>
          ) : (
            <Button asChild variant="brand" size="lg"><Link to={`/signup?next=${encodeURIComponent(location.pathname)}`}>Create an account to apply</Link></Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
