import { DateTime, Interval } from 'luxon';
import type { AvailabilityRule } from '@prisma/client';

export interface Slot {
  startsAt: string;
  endsAt: string;
}

/**
 * Bookable slots for a host between `from` and `to`.
 *  - weekly rules are interpreted in the rule's own timezone (DST-safe via Luxon)
 *  - each slot is `durationMin`; consecutive slots are separated by `bufferMin`
 *  - slots overlapping existing bookings (plus buffer) or starting within
 *    `minNoticeMin` are removed
 */
export function generateSlots(opts: {
  rules: Pick<AvailabilityRule, 'weekday' | 'startMinute' | 'endMinute' | 'timezone'>[];
  busy: { startsAt: Date; endsAt: Date }[];
  from: Date;
  to: Date;
  durationMin: number;
  bufferMin: number;
  minNoticeMin?: number;
  now?: Date;
}): Slot[] {
  const now = DateTime.fromJSDate(opts.now ?? new Date());
  const earliest = now.plus({ minutes: opts.minNoticeMin ?? 60 });
  const busy = opts.busy.map((b) =>
    Interval.fromDateTimes(DateTime.fromJSDate(b.startsAt).minus({ minutes: opts.bufferMin }), DateTime.fromJSDate(b.endsAt).plus({ minutes: opts.bufferMin })),
  );
  const out: Slot[] = [];
  for (const rule of opts.rules) {
    let day = DateTime.fromJSDate(opts.from, { zone: rule.timezone }).startOf('day');
    const last = DateTime.fromJSDate(opts.to, { zone: rule.timezone });
    while (day <= last) {
      // Luxon weekday: 1=Mon..7=Sun; rule.weekday: 0=Sun..6=Sat
      if (day.weekday % 7 === rule.weekday) {
        let start = day.plus({ minutes: rule.startMinute });
        const windowEnd = day.plus({ minutes: rule.endMinute });
        while (start.plus({ minutes: opts.durationMin }) <= windowEnd) {
          const end = start.plus({ minutes: opts.durationMin });
          const iv = Interval.fromDateTimes(start, end);
          if (start >= earliest && start.toJSDate() >= opts.from && end.toJSDate() <= opts.to && !busy.some((b) => b.overlaps(iv))) {
            out.push({ startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()! });
          }
          start = end.plus({ minutes: opts.bufferMin });
        }
      }
      day = day.plus({ days: 1 });
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
