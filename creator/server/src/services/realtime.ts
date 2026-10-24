import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { canAccessCommunity } from '../modules/community/access';

let io: Server | null = null;

/**
 * Socket.IO for live community feeds and direct messages. Every room join is
 * authorised with the same checks as the REST API; clients cannot subscribe to
 * channels or conversations they could not read over HTTP.
 */
export function attachRealtime(server: HttpServer) {
  io = new Server(server, { path: '/api/socket.io', cors: { origin: env.CORS_ORIGINS.split(','), credentials: true } });
  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as { sub: string; typ: string };
      if (claims.typ !== 'access') throw new Error('bad token');
      const user = await prisma.user.findFirst({ where: { id: claims.sub, status: 'ACTIVE', deletedAt: null } });
      if (!user) throw new Error('no user');
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.on('join:channel', async (channelId: string, ack?: (ok: boolean) => void) => {
      const ch = await prisma.channel.findUnique({ where: { id: String(channelId) }, include: { community: true } }).catch(() => null);
      const ok = !!ch && (await canAccessCommunity(userId, ch.community));
      if (ok) socket.join(`channel:${ch!.id}`);
      ack?.(ok);
    });
    socket.on('join:conversation', async (conversationId: string, ack?: (ok: boolean) => void) => {
      const p = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: String(conversationId), userId } } }).catch(() => null);
      if (p) socket.join(`conversation:${conversationId}`);
      ack?.(!!p);
    });
    socket.on('leave', (room: string) => socket.leave(String(room)));
  });
  logger.info('realtime attached');
  return io;
}

export function emitTo(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}
