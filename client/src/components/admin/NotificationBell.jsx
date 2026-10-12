import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, BellRing, BellOff, CheckCheck, Send } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import { pushStatus, enablePush, disablePush, syncPush } from '../../lib/push';
import { cn } from '../../lib/utils';
import { Spinner } from '../ui';

function timeAgo(v) {
  const d = new Date(String(v).replace(' ', 'T'));
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState('disabled');
  const [busy, setBusy] = useState(false);
  const lastUnread = useRef(null);
  const ref = useRef();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { limit: 20 } });
      setItems(data.data);
      setUnread(data.unread);
      // in-app toast when something new arrives and push is not enabled on this device
      if (lastUnread.current !== null && data.unread > lastUnread.current && data.data[0] && document.visibilityState === 'visible') {
        toast(data.data[0].title, { icon: '🔔' });
      }
      lastUnread.current = data.unread;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    syncPush();
    pushStatus().then(setPush);
    const t = setInterval(load, 45000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) api.patch(`/notifications/${n.id}/read`).then(load);
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await api.post('/notifications/read-all');
    load();
  };
  const togglePush = async () => {
    setBusy(true);
    try {
      if (push === 'enabled') {
        await disablePush();
        toast.success('Push notifications turned off on this device');
      } else {
        await enablePush();
        toast.success('Push notifications enabled on this device');
      }
      setPush(await pushStatus());
    } catch (e) {
      toast.error(errMsg(e));
      setPush(await pushStatus());
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    try {
      const { data } = await api.post('/notifications/push/test');
      toast.success(data.message);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-navy-900">Notifications</p>
            {unread > 0 && <button onClick={readAll} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
          </div>
          <div className="max-h-[380px] overflow-y-auto thin-scroll">
            {items.length ? items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className={cn('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50', !n.is_read && 'bg-brand-50/50')}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-brand-600')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-navy-900">{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-xs text-slate-500">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            )) : <p className="px-4 py-10 text-center text-sm text-slate-500">You’re all caught up 🎉</p>}
          </div>
          <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-3">
            {push === 'unsupported' ? (
              <p className="text-xs text-slate-500">Push not supported in this browser</p>
            ) : push === 'denied' ? (
              <p className="flex items-center gap-1 text-xs text-red-600"><BellOff className="h-3.5 w-3.5" /> Notifications blocked in browser settings</p>
            ) : (
              <button onClick={togglePush} disabled={busy} className={cn('btn-sm btn', push === 'enabled' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'btn-primary')}>
                {busy ? <Spinner className="h-3.5 w-3.5" /> : push === 'enabled' ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                {push === 'enabled' ? 'Push on (this device)' : 'Enable push notifications'}
              </button>
            )}
            <button onClick={test} className="btn-ghost btn-sm" title="Send a test notification"><Send className="h-3.5 w-3.5" /> Test</button>
          </div>
        </div>
      )}
    </div>
  );
}
