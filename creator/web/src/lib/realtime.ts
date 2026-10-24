import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;

/** One shared Socket.IO connection, authenticated with the current access token */
export function getSocket() {
  if (!socket) {
    socket = io({ path: '/api/socket.io', auth: (cb) => cb({ token: getAccessToken() }), transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

/** Join a room (server checks access) and run `onEvent` for matching events */
export function useRoom(kind: 'channel' | 'conversation', id: string | undefined, events: string[], onEvent: () => void) {
  useEffect(() => {
    if (!id) return;
    const s = getSocket();
    const join = () => s.emit(`join:${kind}`, id);
    join();
    s.on('connect', join);
    events.forEach((e) => s.on(e, onEvent));
    return () => {
      s.emit('leave', `${kind}:${id}`);
      s.off('connect', join);
      events.forEach((e) => s.off(e, onEvent));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);
}
