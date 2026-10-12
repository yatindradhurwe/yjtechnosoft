import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errMsg } from './api';

/** Tiny data hook: const { data, loading, error, reload } = useFetch('/url', params) */
export default function useFetch(url, params, { skip = false } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (skip || !url) return;
    setLoading(true);
    try {
      const res = await api.get(url, { params: JSON.parse(key) });
      if (alive.current) {
        setData(res.data);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(errMsg(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url, key, skip]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
