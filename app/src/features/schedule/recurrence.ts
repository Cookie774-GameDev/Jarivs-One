/**
 * Recurrence helpers for the V2 Schedule feature.
 *
 * We encode recurrence as a tiny string code (`daily`, `weekdays`, `weekly`,
 * `biweekly`, `monthly`) stored in the existing `recurrence_rule` column on
 * `EventRow`. The column was originally meant to carry RFC5545 RRULE text;
 * V2 overloads it with these short codes. `parseRecurrence` is tolerant of
 * a few RRULE shapes so existing rows (if any) round-trip into a sensible
 * kind.
 *
 * `expandRecurrence` materialises a single event into its visible instances
 * for a `[fromMs, toMs)` window. It always anchors arithmetic at the
 * original `start_at` so monthly events with day-of-month 31 don't drift
 * forward (Jan 31 → Feb 28 → Mar 31, not Mar 28).
 */
import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns';
import type { EventRow } from '@/types/event';

export type RecurrenceKind = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';

export type CustomRecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CustomRecurrenceRule {
  frequency: CustomRecurrenceFrequency;
  interval: number;
  /** ISO weekdays: Monday=1 through Sunday=7. */
  weekdays?: number[];
  monthDay?: number;
  month?: number;
  /** Local calendar date, YYYY-MM-DD, inclusive. */
  until?: string;
}

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const CUSTOM_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function boundedInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value) || min));
}

function validLocalDate(value?: string): value is string {
  if (!value || !CUSTOM_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year!, month! - 1, day!);
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month! - 1 && parsed.getDate() === day
  );
}

export function serializeCustomRecurrence(input: CustomRecurrenceRule): string {
  const frequency = input.frequency.toUpperCase();
  const interval = boundedInteger(input.interval, 1, 999);
  const parts = [`FREQ=${frequency}`, `INTERVAL=${interval}`];
  if (input.frequency === 'weekly') {
    const weekdays = [...new Set(input.weekdays ?? [])]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      .sort((left, right) => left - right);
    if (weekdays.length > 0) {
      parts.push(`BYDAY=${weekdays.map((day) => WEEKDAY_CODES[day - 1]).join(',')}`);
    }
  }
  if (input.frequency === 'monthly' || input.frequency === 'yearly') {
    parts.push(`BYMONTHDAY=${boundedInteger(input.monthDay ?? 1, 1, 31)}`);
  }
  if (input.frequency === 'yearly') {
    parts.push(`BYMONTH=${boundedInteger(input.month ?? 1, 1, 12)}`);
  }
  if (validLocalDate(input.until)) parts.push(`UNTIL=${input.until.replaceAll('-', '')}T235959`);
  return `RRULE:${parts.join(';')}`;
}

export function parseCustomRecurrence(value?: string): CustomRecurrenceRule | null {
  if (!value || !value.trim().toUpperCase().startsWith('RRULE:')) return null;
  const fields = new Map(
    value
      .trim()
      .slice(6)
      .split(';')
      .map((part) => {
        const separator = part.indexOf('=');
        return separator > 0
          ? [part.slice(0, separator).toUpperCase(), part.slice(separator + 1).toUpperCase()]
          : ['', ''];
      }),
  );
  const rawFrequency = fields.get('FREQ')?.toLowerCase();
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(rawFrequency ?? '')) return null;
  const frequency = rawFrequency as CustomRecurrenceFrequency;
  const rawInterval = Number(fields.get('INTERVAL') ?? 1);
  if (!Number.isSafeInteger(rawInterval) || rawInterval < 1 || rawInterval > 999) return null;
  const result: CustomRecurrenceRule = { frequency, interval: rawInterval };
  if (frequency === 'weekly') {
    const weekdays = (fields.get('BYDAY') ?? '')
      .split(',')
      .map((code) => WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]) + 1)
      .filter((day) => day >= 1 && day <= 7);
    if (weekdays.length > 0) result.weekdays = [...new Set(weekdays)];
  }
  if (frequency === 'monthly' || frequency === 'yearly') {
    const monthDay = Number(fields.get('BYMONTHDAY'));
    if (Number.isSafeInteger(monthDay) && monthDay >= 1 && monthDay <= 31) {
      result.monthDay = monthDay;
    }
  }
  if (frequency === 'yearly') {
    const month = Number(fields.get('BYMONTH'));
    if (Number.isSafeInteger(month) && month >= 1 && month <= 12) result.month = month;
  }
  const rawUntil = fields.get('UNTIL');
  if (rawUntil && /^\d{8}/.test(rawUntil)) {
    const until = `${rawUntil.slice(0, 4)}-${rawUntil.slice(4, 6)}-${rawUntil.slice(6, 8)}`;
    if (validLocalDate(until)) result.until = until;
  }
  return result;
}

export function recurrencePreview(rule: CustomRecurrenceRule, startAt: number): string {
  const interval = boundedInteger(rule.interval, 1, 999);
  const unit =
    rule.frequency === 'daily'
      ? 'day'
      : rule.frequency === 'weekly'
        ? 'week'
        : rule.frequency === 'monthly'
          ? 'month'
          : 'year';
  let text = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  if (rule.frequency === 'weekly') {
    const startDay = new Date(startAt).getDay() || 7;
    const weekdays = rule.weekdays?.length ? rule.weekdays : [startDay];
    const names = weekdays
      .filter((day) => day >= 1 && day <= 7)
      .sort((left, right) => left - right)
      .map((day) => WEEKDAY_NAMES[day - 1]);
    if (names.length > 0) {
      text += ` on ${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names)}`;
    }
  } else if (rule.frequency === 'monthly') {
    text += ` on day ${boundedInteger(rule.monthDay ?? new Date(startAt).getDate(), 1, 31)}`;
  } else if (rule.frequency === 'yearly') {
    const month = boundedInteger(rule.month ?? new Date(startAt).getMonth() + 1, 1, 12);
    const day = boundedInteger(rule.monthDay ?? new Date(startAt).getDate(), 1, 31);
    text += ` on ${new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(new Date(2024, month - 1, day))}`;
  }
  if (validLocalDate(rule.until)) {
    const [year, month, day] = rule.until.split('-').map(Number);
    text += ` until ${new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(year!, month! - 1, day!))}`;
  }
  return text;
}

/** Stable list used to render the chip row. Keep in display order. */
export const RECURRENCE_KINDS: RecurrenceKind[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
];

/**
 * One materialised occurrence of an event. The `event` reference is shared
 * across all instances of the same row (so React keys should combine it
 * with `instanceStartMs`). `isRecurrence` is true for every occurrence
 * other than the original anchor.
 */
export interface RecurrenceInstance {
  event: EventRow;
  /** Unix ms for this occurrence's start. */
  instanceStartMs: number;
  /** Unix ms for this occurrence's end. */
  instanceEndMs: number;
  /** True if this is a generated repeat, not the original anchor row. */
  isRecurrence: boolean;
}

/**
 * Coerce the stored recurrence string into a known kind. Empty / undefined
 * / unrecognised strings collapse to `'none'`.
 */
export function parseRecurrence(s?: string): RecurrenceKind {
  if (!s) return 'none';
  const v = s.trim().toLowerCase();
  switch (v) {
    case '':
    case 'none':
      return 'none';
    case 'daily':
      return 'daily';
    case 'weekdays':
      return 'weekdays';
    case 'weekly':
      return 'weekly';
    case 'biweekly':
    case 'fortnightly':
      return 'biweekly';
    case 'monthly':
      return 'monthly';
    default:
      // Tolerate simple RRULE-shaped strings in case existing rows used them.
      if (v.includes('byday=mo,tu,we,th,fr')) return 'weekdays';
      if (v.includes('freq=daily')) return 'daily';
      if (v.includes('freq=weekly') && v.includes('interval=2')) return 'biweekly';
      if (v.includes('freq=weekly')) return 'weekly';
      if (v.includes('freq=monthly')) return 'monthly';
      return 'none';
  }
}

/** Inverse of parseRecurrence — returns the value to persist (or undefined for 'none'). */
export function serializeRecurrence(k: RecurrenceKind): string | undefined {
  return k === 'none' ? undefined : k;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Hard cap to keep expansion bounded for misbehaving inputs (~1 year of daily). */
const MAX_INSTANCES = 366;

/**
 * Expand `event` into its instances inside `[fromMs, toMs)`. Non-recurring
 * events return at most one (themselves) when their window overlaps;
 * recurring events emit one per occurrence. The returned array is *not*
 * sorted across multiple events — callers that mix series should sort by
 * `instanceStartMs` afterwards.
 */
export function expandRecurrence(
  event: EventRow,
  fromMs: number,
  toMs: number,
): RecurrenceInstance[] {
  if (toMs <= fromMs) return [];

  const kind = parseRecurrence(event.recurrence_rule);
  const customRule = parseCustomRecurrence(event.recurrence_rule);
  const duration = Math.max(0, event.end_at - event.start_at);

  if (customRule) {
    return expandCustomRecurrence(event, customRule, fromMs, toMs, duration);
  }

  if (kind === 'none') {
    if (event.start_at < toMs && event.end_at > fromMs) {
      return [
        {
          event,
          instanceStartMs: event.start_at,
          instanceEndMs: event.end_at,
          isRecurrence: false,
        },
      ];
    }
    return [];
  }

  const out: RecurrenceInstance[] = [];
  const anchor = new Date(event.start_at);

  // Monthly walks index-by-index off the anchor so day-of-month is
  // preserved (Jan 31 → Mar 31 instead of Jan 31 → Feb 28 → Mar 28).
  if (kind === 'monthly') {
    let i = 0;
    if (anchor.getTime() < fromMs) {
      const months = differenceInCalendarMonths(new Date(fromMs), anchor);
      i = Math.max(0, months - 1);
    }
    let count = 0;
    while (count < MAX_INSTANCES) {
      const occur = addMonths(anchor, i);
      const startMs = occur.getTime();
      if (startMs >= toMs) break;
      const endMs = startMs + duration;
      if (endMs > fromMs) {
        out.push({
          event,
          instanceStartMs: startMs,
          instanceEndMs: endMs,
          isRecurrence: startMs !== event.start_at,
        });
      }
      i++;
      count++;
    }
    return out;
  }

  // Daily / weekdays / weekly / biweekly: walk a cursor in calendar units.
  let cursor = new Date(anchor);
  if (cursor.getTime() < fromMs) {
    const daysDiff = differenceInCalendarDays(new Date(fromMs), cursor);
    if (kind === 'daily' || kind === 'weekdays') {
      if (daysDiff > 0) cursor = addDays(cursor, daysDiff);
    } else if (kind === 'weekly') {
      const weeks = Math.floor(daysDiff / 7);
      if (weeks > 0) cursor = addDays(cursor, weeks * 7);
    } else if (kind === 'biweekly') {
      const periods = Math.floor(daysDiff / 14);
      if (periods > 0) cursor = addDays(cursor, periods * 14);
    }
  }

  let count = 0;
  while (cursor.getTime() < toMs && count < MAX_INSTANCES) {
    const startMs = cursor.getTime();
    const endMs = startMs + duration;
    let include = endMs > fromMs;
    if (kind === 'weekdays') {
      const dow = cursor.getDay();
      if (dow === 0 || dow === 6) include = false;
    }
    if (include) {
      out.push({
        event,
        instanceStartMs: startMs,
        instanceEndMs: endMs,
        isRecurrence: startMs !== event.start_at,
      });
    }
    switch (kind) {
      case 'daily':
      case 'weekdays':
        cursor = addDays(cursor, 1);
        break;
      case 'weekly':
        cursor = addDays(cursor, 7);
        break;
      case 'biweekly':
        cursor = addDays(cursor, 14);
        break;
    }
    count++;
  }

  return out;
}

function expandCustomRecurrence(
  event: EventRow,
  rule: CustomRecurrenceRule,
  fromMs: number,
  toMs: number,
  duration: number,
): RecurrenceInstance[] {
  const anchor = new Date(event.start_at);
  const anchorDay = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const scanStartDate = new Date(Math.max(event.start_at, fromMs - duration));
  let cursor = new Date(
    scanStartDate.getFullYear(),
    scanStartDate.getMonth(),
    scanStartDate.getDate(),
    anchor.getHours(),
    anchor.getMinutes(),
    anchor.getSeconds(),
    anchor.getMilliseconds(),
  );
  if (cursor.getTime() < event.start_at) cursor = new Date(event.start_at);
  let untilMs = Number.POSITIVE_INFINITY;
  if (validLocalDate(rule.until)) {
    const [year, month, day] = rule.until.split('-').map(Number);
    untilMs = new Date(year!, month! - 1, day!, 23, 59, 59, 999).getTime();
  }
  const weekdays = rule.weekdays?.length
    ? rule.weekdays
    : [anchor.getDay() === 0 ? 7 : anchor.getDay()];
  const out: RecurrenceInstance[] = [];
  let scanned = 0;
  while (cursor.getTime() < toMs && cursor.getTime() <= untilMs && scanned < MAX_INSTANCES) {
    const candidateDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const dayDifference = differenceInCalendarDays(candidateDay, anchorDay);
    const monthDifference = differenceInCalendarMonths(candidateDay, anchorDay);
    const yearDifference = cursor.getFullYear() - anchor.getFullYear();
    const isoWeekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    const matches =
      cursor.getTime() >= event.start_at &&
      (rule.frequency === 'daily'
        ? dayDifference >= 0 && dayDifference % rule.interval === 0
        : rule.frequency === 'weekly'
          ? dayDifference >= 0 &&
            Math.floor(dayDifference / 7) % rule.interval === 0 &&
            weekdays.includes(isoWeekday)
          : rule.frequency === 'monthly'
            ? monthDifference >= 0 &&
              monthDifference % rule.interval === 0 &&
              cursor.getDate() === (rule.monthDay ?? anchor.getDate())
            : yearDifference >= 0 &&
              yearDifference % rule.interval === 0 &&
              cursor.getMonth() + 1 === (rule.month ?? anchor.getMonth() + 1) &&
              cursor.getDate() === (rule.monthDay ?? anchor.getDate()));
    if (matches) {
      const startMs = cursor.getTime();
      const endMs = startMs + duration;
      if (endMs > fromMs) {
        out.push({
          event,
          instanceStartMs: startMs,
          instanceEndMs: endMs,
          isRecurrence: startMs !== event.start_at,
        });
      }
    }
    cursor = addDays(cursor, 1);
    scanned += 1;
  }
  return out;
}

/** Friendly label for a kind — used by the chip row in the modal. */
export function recurrenceLabel(k: RecurrenceKind): string {
  switch (k) {
    case 'none':
      return 'No repeat';
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return 'Monthly';
  }
}
