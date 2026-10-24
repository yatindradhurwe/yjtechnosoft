import { createContext, useContext } from 'react';
import { api } from '@/lib/api';

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  socialImageUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  supportEmail: string | null;
  timezone: string;
  currency: string;
  legalName: string | null;
  address: string | null;
  gstin: string | null;
  gstStateCode: string | null;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  memberFeedPosts: boolean;
  maxVideoMb: number;
  status: string;
}

export interface WorkspaceState {
  workspace: Workspace;
  roles: string[];
  permissions: string[];
  supportSession: boolean;
  plan: { key: string; name: string; limits: Record<string, number | boolean | null>; platformFeeBps: number } | null;
}

interface Ctx extends WorkspaceState {
  slug: string;
  can: (p: string) => boolean;
  get: <T = any>(path: string) => Promise<T>;
  post: <T = any>(path: string, body?: unknown) => Promise<T>;
  put: <T = any>(path: string, body?: unknown) => Promise<T>;
  patch: <T = any>(path: string, body?: unknown) => Promise<T>;
  del: <T = any>(path: string) => Promise<T>;
  upload: <T = any>(path: string, form: FormData) => Promise<T>;
}

export const WsContext = createContext<Ctx | null>(null);

export function makeWsCtx(slug: string, state: WorkspaceState): Ctx {
  const t = state.workspace.id;
  return {
    ...state,
    slug,
    can: (p) => state.permissions.includes(p),
    get: (path) => api.get(path, t),
    post: (path, body) => api.post(path, body, t),
    put: (path, body) => api.put(path, body, t),
    patch: (path, body) => api.patch(path, body, t),
    del: (path) => api.del(path, t),
    upload: (path, form) => api.upload(path, form, t),
  };
}

export function useWs() {
  const v = useContext(WsContext);
  if (!v) throw new Error('useWs outside workspace');
  return v;
}
