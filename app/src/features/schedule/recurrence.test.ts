import { describe, expect, it } from 'vitest';
import type { EventRow } from '@/types/event';
import {
  expandRecurrence,
  parseCustomRecurrence,
  parseRecurrence,
  recurrencePreview,
  serializeCustomRecurrence,
} from './recurrence';

describe('custom event recurrence', () => {
  it('round-trips a bounded weekly rule without changing existing short recurrence values', () => {
    const rule = serializeCustomRecurrence({
      frequency: 'weekly',
      interval: 2,
      weekdays: [1, 3, 5],
      until: '2026-12-31',
    });

    expect(rule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20261231T235959');
    expect(parseCustomRecurrence(rule)).toEqual({
      frequency: 'weekly',
      interval: 2,
      weekdays: [1, 3, 5],
      until: '2026-12-31',
    });
    expect(recurrencePreview(parseCustomRecurrence(rule)!, Date.UTC(2026, 7, 17))).toMatch(
      /Every 2 weeks on Monday, Wednesday, and Friday until Dec 31, 2026/i,
    );
    expect(parseRecurrence('weekly')).toBe('weekly');
    expect(parseCustomRecurrence('weekly')).toBeNull();
  });

  it('expands a custom weekly rule only on selected weekdays and stops at its end date', () => {
    const monday = new Date(2026, 7, 17, 9).getTime();
    const event = {
      id: 'evt_custom',
      start_at: monday,
      end_at: monday + 60 * 60 * 1000,
      recurrence_rule: serializeCustomRecurrence({
        frequency: 'weekly',
        interval: 1,
        weekdays: [1, 3],
        until: '2026-08-26',
      }),
    } as EventRow;

    const instances = expandRecurrence(event, monday, new Date(2026, 8, 1).getTime());
    expect(instances.map((item) => new Date(item.instanceStartMs).getDay())).toEqual([1, 3, 1, 3]);
  });
});
