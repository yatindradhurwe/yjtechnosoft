import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function money(minor: number | null | undefined, currency = 'INR') {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function date(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', opts).format(new Date(d));
}

export const dateTime = (d: string | Date | null | undefined) => date(d, { dateStyle: 'medium', timeStyle: 'short' });

export function relative(d: string | Date) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return date(d);
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

export function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

/** Convert a rupee/dollar amount typed by a user into minor units */
export const toMinor = (v: string | number) => Math.round(Number(v) * 100);
export const fromMinor = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v / 100));

export function toLocalInput(d: string | Date | null | undefined) {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
