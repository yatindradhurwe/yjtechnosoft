/**
 * Check-in / check-out with optional geofencing. Shared by the web panel
 * (/api/hr/attendance/*) and the mobile app (/api/mobile/v1/attendance/*) so
 * both follow the same rules.
 *
 * Geofences an employee can check in at:
 *   - the office (Settings › HR & Attendance › office latitude/longitude/radius)
 *   - every project they are a member of that has a site location and geofence enabled
 *
 * settings.geofence_mode:
 *   off     – location is recorded, never checked
 *   flag    – check-in is allowed anywhere, but marked "outside" when not inside a geofence
 *   enforce – check-in is refused outside every geofence (check-out is only flagged)
 */
const { query, one } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { getSettings } = require('../utils/settings');
const { toDateStr, toDateTimeStr } = require('../utils/helpers');
const { notifyRoles } = require('./push');

/** Distance in metres between two lat/lng points (haversine) */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Accepts { latitude, longitude } or the web's "lat,lng" location string */
function parseCoords(body = {}) {
  let lat = body.latitude ?? body.lat;
  let lng = body.longitude ?? body.lng;
  if ((lat === undefined || lat === null || lat === '') && typeof body.location === 'string' && body.location.includes(',')) {
    [lat, lng] = body.location.split(',');
  }
  lat = Number(lat);
  lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const accuracy = Number(body.accuracy);
  return { lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null };
}

const isTrue = (v) => v === true || v === 1 || v === '1' || v === 'true';

/** Office + assigned project geofences for an employee */
async function employeeGeofences(empId, s = null) {
  s = s || (await getSettings());
  const sites = [];
  const olat = Number(s.office_latitude);
  const olng = Number(s.office_longitude);
  if (s.office_latitude && s.office_longitude && Number.isFinite(olat) && Number.isFinite(olng)) {
    sites.push({ type: 'office', id: null, name: s.company_name ? `${s.company_name} office` : 'Office', address: s.address || null, latitude: olat, longitude: olng, radius: Number(s.office_geofence_radius) || 200 });
  }
  const projects = await query(
    `SELECT p.id, p.name, p.site_address, p.latitude, p.longitude, p.geofence_radius
     FROM project_members m JOIN projects p ON p.id = m.project_id
     WHERE m.employee_id = ? AND p.geofence_enabled = 1 AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
       AND p.status IN ('planning','in_progress','on_hold')
     ORDER BY p.name`,
    [empId]
  );
  projects.forEach((p) => sites.push({ type: 'project', id: p.id, name: p.name, address: p.site_address, latitude: Number(p.latitude), longitude: Number(p.longitude), radius: Number(p.geofence_radius) || 200 }));
  return sites;
}

/** Nearest site plus whether the point is inside it. Prefers a site the point is inside. */
function evaluate(coords, sites) {
  if (!coords || !sites.length) return null;
  const scored = sites.map((site) => ({ ...site, distance: distanceMeters(coords.lat, coords.lng, site.latitude, site.longitude) }));
  scored.forEach((x) => (x.inside = x.distance <= x.radius));
  const inside = scored.filter((x) => x.inside).sort((a, b) => a.distance - b.distance);
  return inside[0] || scored.sort((a, b) => a.distance - b.distance)[0];
}

const siteSummary = (site) => site && { type: site.type, id: site.id, name: site.name, distance: site.distance, radius: site.radius, inside: site.inside };

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

async function todayStatus(empId) {
  const row = await one('SELECT a.*, p.name AS project_name FROM attendance a LEFT JOIN projects p ON p.id = a.project_id WHERE a.employee_id = ? AND a.date = ?', [empId, toDateStr()]);
  const shift = await one('SELECT shift_start, shift_end FROM employees WHERE id = ?', [empId]);
  return { attendance: row, shift };
}

/**
 * opts: { source: 'web'|'mobile', ip, wfh, notes, project_id, latitude, longitude, accuracy, location,
 *         is_mocked, photo, device_info }
 * Returns { message, attendance, geofence }
 */
async function checkIn(empId, opts = {}) {
  const s = await getSettings();
  const source = opts.source || 'web';
  const wfh = isTrue(opts.wfh);
  const mode = ['flag', 'enforce'].includes(s.geofence_mode) ? s.geofence_mode : 'off';
  const coords = parseCoords(opts);

  // office network restriction (web only – a phone on mobile data has no office IP)
  const whitelist = (s.office_ip_whitelist || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (source === 'web' && whitelist.length && !whitelist.includes(opts.ip) && !wfh) {
    throw new HttpError(403, `Check-in is allowed only from the office network (your IP: ${opts.ip}). Choose "Work from home" if applicable.`, 'OFFICE_NETWORK_REQUIRED');
  }
  if (wfh && mode !== 'off' && s.geofence_allow_wfh === '0') throw new HttpError(403, 'Work from home check-in is not allowed. Please check in at your office or project site.', 'WFH_NOT_ALLOWED');
  if (source === 'mobile' && s.attendance_selfie_required === '1' && !opts.photo) throw new HttpError(400, 'A selfie is required to check in', 'SELFIE_REQUIRED');

  const today = toDateStr();
  const existing = await one('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [empId, today]);
  if (existing && existing.check_in) throw new HttpError(409, 'You have already checked in today', 'ALREADY_CHECKED_IN');

  // which project the employee is working on today
  let projectId = opts.project_id ? Number(opts.project_id) : null;
  let sites = await employeeGeofences(empId, s);
  if (projectId) {
    const member = await one('SELECT id FROM project_members WHERE project_id = ? AND employee_id = ?', [projectId, empId]);
    if (!member) throw new HttpError(403, 'You are not assigned to this project', 'NOT_PROJECT_MEMBER');
    const projectSite = sites.find((x) => x.type === 'project' && x.id === projectId);
    if (projectSite) sites = [projectSite]; // must be at that project's site
  }

  const site = evaluate(coords, sites);
  let geofence = null;
  if (wfh) geofence = 'wfh';
  else if (!sites.length) geofence = 'no_site';
  else if (!coords) geofence = 'no_location';
  else geofence = site.inside ? 'inside' : 'outside';

  if (mode === 'enforce' && !wfh && sites.length) {
    if (!coords) throw new HttpError(400, 'Your location is required to check in. Turn on location (GPS) and try again.', 'LOCATION_REQUIRED');
    if (isTrue(opts.is_mocked)) throw new HttpError(403, 'Mock / fake location detected. Turn off any location-spoofing app and try again.', 'MOCK_LOCATION');
    const maxAcc = Number(s.geofence_max_accuracy) || 0;
    if (maxAcc && coords.accuracy !== null && coords.accuracy > maxAcc) {
      throw new HttpError(400, `GPS accuracy is too low (±${coords.accuracy} m). Move to an open area and try again.`, 'LOW_GPS_ACCURACY', { accuracy: coords.accuracy, required: maxAcc });
    }
    if (!site.inside) {
      throw new HttpError(403, `You are ${site.distance} m from ${site.name}. Check-in is allowed within ${site.radius} m.`, 'OUTSIDE_GEOFENCE', { nearest: siteSummary(site) });
    }
  }
  if (!projectId && site && site.inside && site.type === 'project') projectId = site.id;

  const emp = await one('SELECT shift_start FROM employees WHERE id = ?', [empId]);
  const now = new Date();
  const [h, m] = String(emp.shift_start || s.office_start_time || '10:00').split(':').map(Number);
  const grace = Number(s.attendance_grace_minutes || 15);
  const late = now.getHours() * 60 + now.getMinutes() > h * 60 + m + grace;
  const data = {
    employee_id: empId,
    date: today,
    check_in: toDateTimeStr(now),
    status: wfh ? 'wfh' : late ? 'late' : 'present',
    check_in_ip: opts.ip || null,
    check_in_location: coords ? `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}` : (opts.location || null),
    check_in_lat: coords ? coords.lat : null,
    check_in_lng: coords ? coords.lng : null,
    check_in_accuracy: coords ? coords.accuracy : null,
    check_in_distance: site ? site.distance : null,
    check_in_geofence: geofence,
    check_in_photo: opts.photo || null,
    project_id: projectId,
    source,
    device_info: opts.device_info ? String(opts.device_info).slice(0, 255) : null,
    notes: opts.notes || null,
  };
  if (existing) await query('UPDATE attendance SET ? WHERE id = ? AND check_in IS NULL', [data, existing.id]);
  else {
    try {
      await query('INSERT INTO attendance SET ?', [data]);
    } catch (e) {
      // two taps at the same moment: the second insert hits the unique (employee, date) key
      if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'You have already checked in today', 'ALREADY_CHECKED_IN');
      throw e;
    }
  }
  let message = late ? 'Checked in (late)' : 'Checked in successfully';
  if (geofence === 'outside') message += ` – you are outside ${site.name} (${site.distance} m away)`;
  // allowed but suspicious (flag mode): let HR know right away
  const mocked = isTrue(opts.is_mocked);
  if ((geofence === 'outside' || mocked) && s.notify_attendance_flags !== '0') {
    const who = await one('SELECT name FROM employees WHERE id = ?', [empId]);
    notifyRoles(['hr'], {
      title: `📍 ${who.name} checked in ${mocked ? 'with a mock location' : 'outside the geofence'}`,
      body: geofence === 'outside' ? `${site.distance} m from ${site.name} · ${source}` : `Location spoofing app detected · ${source}`,
      link: '/admin/attendance',
      type: 'attendance',
    }).catch(() => {});
  }
  return { message, attendance: (await todayStatus(empId)).attendance, geofence: { status: geofence, mode, site: siteSummary(site) } };
}

/** Check-out is never blocked by the geofence – it is recorded and flagged */
async function checkOut(empId, opts = {}) {
  const s = await getSettings();
  const today = toDateStr();
  const row = await one('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [empId, today]);
  if (!row || !row.check_in) throw new HttpError(400, 'You have not checked in today', 'NOT_CHECKED_IN');
  if (row.check_out) throw new HttpError(409, 'You have already checked out today', 'ALREADY_CHECKED_OUT');
  const coords = parseCoords(opts);
  let sites = await employeeGeofences(empId, s);
  if (row.project_id && sites.some((x) => x.type === 'project' && x.id === row.project_id)) sites = sites.filter((x) => x.type === 'project' && x.id === row.project_id);
  const site = evaluate(coords, sites);
  let geofence = null;
  if (row.status === 'wfh') geofence = 'wfh';
  else if (!sites.length) geofence = 'no_site';
  else if (!coords) geofence = 'no_location';
  else geofence = site.inside ? 'inside' : 'outside';

  const now = new Date();
  const minutes = Math.max(0, Math.round((now - new Date(row.check_in.replace(' ', 'T'))) / 60000));
  let status = row.status;
  if (minutes < Number(s.half_day_hours || 4) * 60 && status !== 'wfh') status = 'half_day';
  await query('UPDATE attendance SET ? WHERE id = ?', [{
    check_out: toDateTimeStr(now),
    work_minutes: minutes,
    status,
    check_out_location: coords ? `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}` : (opts.location || null),
    check_out_lat: coords ? coords.lat : null,
    check_out_lng: coords ? coords.lng : null,
    check_out_accuracy: coords ? coords.accuracy : null,
    check_out_distance: site ? site.distance : null,
    check_out_geofence: geofence,
  }, row.id]);
  return { message: 'Checked out. Have a great evening!', attendance: (await todayStatus(empId)).attendance, geofence: { status: geofence, site: siteSummary(site) } };
}

module.exports = { distanceMeters, parseCoords, employeeGeofences, evaluate, checkIn, checkOut, todayStatus, clientIp };
