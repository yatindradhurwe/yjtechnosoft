import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/misc';

/** Landing page after Google sign-in: the refresh cookie is set, exchange it for an access token */
export default function AuthCallback() {
  const nav = useNavigate();
  const { reload } = useAuth();
  useEffect(() => {
    (async () => {
      if (await refreshSession()) {
        await reload();
        nav('/app', { replace: true });
      } else nav('/login', { replace: true });
    })();
  }, [nav, reload]);
  return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
}
