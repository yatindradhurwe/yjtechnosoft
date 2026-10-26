import { API_BASE, getToken } from './api';

export const cn = (...a) => a.filter(Boolean).join(' ');

const LEGACY = { '/assets/logo.png': '/logo.png', '/assets/logo-icon.png': '/favicon.png' };

export const asset = (p) => {
  if (!p) return '';
  if (LEGACY[p]) return LEGACY[p];
  // serve uploads through /api so they work wherever the API is reachable
  if (p.startsWith('/uploads/')) p = `/api${p}`;
  if (/^(https?:)?\/\//.test(p) || p.startsWith('data:')) return p;
  // private uploads need the staff token
  if (/^\/api\/uploads\/(resumes|documents|receipts|vault|attendance)\//.test(p)) return `${API_BASE}${p}?token=${getToken() || ''}`;
  return `${API_BASE}${p}`;
};

export const money = (n, decimals = 2) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const num = (n) => (Number(n) || 0).toLocaleString('en-IN');

export function fmtDate(v, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!v) return '—';
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-IN', opts);
}

export function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? v : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const minutesToHours = (m) => {
  const mm = Number(m) || 0;
  return `${Math.floor(mm / 60)}h ${String(mm % 60).padStart(2, '0')}m`;
};

export const titleCase = (s = '') => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const lines = (s = '') => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

export const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const waLink = (phone, text = '') => {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.length === 10) p = `91${p}`;
  return `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
