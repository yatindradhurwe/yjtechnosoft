import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const SiteContext = createContext({ settings: {}, services: [], pages: [], loading: true });

export function SiteProvider({ children }) {
  const [state, setState] = useState({ settings: {}, services: [], pages: [], loading: true });
  const load = () =>
    api
      .get('/public/site')
      .then(({ data }) => setState({ ...data, loading: false }))
      .catch(() => setState((s) => ({ ...s, loading: false })));
  useEffect(() => {
    load();
  }, []);
  return <SiteContext.Provider value={{ ...state, reload: load }}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
