import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, Socket } from 'socket.io-client';
import { app, as, createCreator, signup } from './helpers';
import { attachRealtime } from '../src/services/realtime';

const server = http.createServer(app);
attachRealtime(server);
let url = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
const sockets: Socket[] = [];
afterAll(() => {
  sockets.forEach((s) => s.close());
  server.close();
});

function open(token: string) {
  const s = connect(url, { path: '/api/socket.io', auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(s);
  return s;
}

describe('realtime', () => {
  it('rejects unauthenticated sockets', async () => {
    const s = open('garbage');
    const err = await new Promise<Error>((r) => s.on('connect_error', r));
    expect(err.message).toBe('unauthorized');
  });

  it('only joins channel rooms the user can read, and delivers new posts', async () => {
    const { owner, tenant } = await createCreator();
    const c = await as(owner, tenant).post('/api/community-admin').send({ name: 'Paid club', access: 'PAID' });
    const feed = c.body.community.channels.find((x: { type: string }) => x.type === 'FEED').id;
    const outsider = await signup();
    const so = open(outsider.token);
    expect(await new Promise((r) => so.emit('join:channel', feed, r))).toBe(false);
    const sOwner = open(owner.token);
    expect(await new Promise((r) => sOwner.emit('join:channel', feed, r))).toBe(true);
    const got = new Promise((r) => sOwner.on('post:new', r));
    let leaked = false;
    so.on('post:new', () => (leaked = true));
    await as(owner).post(`/api/community/channels/${feed}/posts`).send({ body: 'Live!' }).expect(201);
    expect(await got).toMatchObject({ channelId: feed });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);
  });
});
