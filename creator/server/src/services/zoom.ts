import { getIntegration } from './integrations';

/**
 * Zoom Server-to-Server OAuth app (per workspace). Meetings are only created when
 * the creator has connected Zoom; otherwise workshops use a custom meeting link.
 */
export async function zoomConfigured(tenantId: string) {
  const i = await getIntegration(tenantId, 'ZOOM');
  return !!(i?.enabled && i.config.accountId && i.config.clientId && i.secrets.clientSecret);
}

async function token(tenantId: string) {
  const i = await getIntegration(tenantId, 'ZOOM');
  if (!i?.enabled || !i.config.accountId || !i.config.clientId || !i.secrets.clientSecret) throw new Error('Zoom is not connected');
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(String(i.config.accountId))}`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${i.config.clientId}:${i.secrets.clientSecret}`).toString('base64')}` },
  });
  const json = (await res.json()) as { access_token?: string; reason?: string };
  if (!res.ok || !json.access_token) throw new Error(`Zoom authentication failed: ${json.reason ?? res.status}`);
  return json.access_token;
}

export async function createZoomMeeting(tenantId: string, m: { topic: string; startsAt: Date; durationMin: number; timezone: string }) {
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token(tenantId)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      topic: m.topic.slice(0, 200),
      type: 2,
      start_time: m.startsAt.toISOString(),
      duration: m.durationMin,
      timezone: m.timezone,
      settings: { join_before_host: false, waiting_room: true, auto_recording: 'cloud' },
    }),
  });
  const json = (await res.json()) as { id?: number; join_url?: string; message?: string };
  if (!res.ok || !json.join_url) throw new Error(`Zoom meeting creation failed: ${json.message ?? res.status}`);
  return { meetingId: String(json.id), joinUrl: json.join_url };
}
