import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  platformRole: 'USER' | 'SUPPORT' | 'SUPER_ADMIN';
  emailVerified: boolean;
}

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  status: string;
  roles: string[];
}

interface AuthState {
  user: User | null;
  workspaces: WorkspaceSummary[];
  loading: boolean;
  /** Called after any login/signup response that carries an access token */
  signedIn: (r: { accessToken: string }) => Promise<void>;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const reload = useCallback(async () => {
    try {
      const me = await api.get<{ user: User; workspaces: WorkspaceSummary[] }>('/auth/me');
      setUser(me.user);
      setWorkspaces(me.workspaces);
    } catch {
      setUser(null);
      setWorkspaces([]);
    }
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
    (async () => {
      if (await refreshSession()) await reload();
      setLoading(false);
    })();
  }, [reload]);

  const signedIn = useCallback(
    async (r: { accessToken: string }) => {
      setAccessToken(r.accessToken);
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setWorkspaces([]);
    qc.clear();
  }, [qc]);

  return <Ctx.Provider value={{ user, workspaces, loading, signedIn, reload, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
