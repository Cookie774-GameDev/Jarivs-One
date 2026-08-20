import { describe, expect, it } from 'vitest';
import { parseEventInput } from './parseEventInput';

const REF = new Date(2026, 7, 19, 17, 40, 0, 0);

function expectLocal(
  timestamp: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const date = new Date(timestamp);
  expect([
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ]).toEqual([year, month, day, hour, minute]);
}

describe('parseEventInput', () => {
  it('parses tomorrow with a one-digit 24-hour clock time', () => {
    const event = parseEventInput('Review VibeSpace tomorrow 9:30', REF);
    expect(event.title).toBe('Review VibeSpace');
    expect(event.all_day).toBe(false);
    expectLocal(event.start_at, 2026, 7, 20, 9, 30);
    expect(event.end_at - event.start_at).toBe(60 * 60 * 1000);
  });

  it('parses explicit at time and PM time', () => {
    const tomorrow = parseEventInput('Review tomorrow at 9:30', REF);
    expect(tomorrow.title).toBe('Review');
    expectLocal(tomorrow.start_at, 2026, 7, 20, 9, 30);

    const today = parseEventInput('Ship today 5 PM', REF);
    expect(today.title).toBe('Ship');
    expectLocal(today.start_at, 2026, 7, 19, 17, 0);
  });

  it('parses weekday and next weekday phrases without leaking them into the title', () => {
    const friday = parseEventInput('Review Friday at 3', REF);
    expect(friday.title).toBe('Review');
    expectLocal(friday.start_at, 2026, 7, 21, 3, 0);

    const monday = parseEventInput('Planning next Monday 10:15 AM', REF);
    expect(monday.title).toBe('Planning');
    expectLocal(monday.start_at, 2026, 7, 24, 10, 15);
  });

  it('anchors date-only events to local midnight', () => {
    const event = parseEventInput('Vacation tomorrow', REF);
    expect(event.title).toBe('Vacation');
    expect(event.all_day).toBe(true);
    expectLocal(event.start_at, 2026, 7, 20, 0, 0);
    expect(event.end_at - event.start_at).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('supports a time-only one-digit hour input', () => {
    const event = parseEventInput('Focus block 9:30', REF);
    expect(event.title).toBe('Focus block');
    expect(event.all_day).toBe(false);
    expectLocal(event.start_at, 2026, 7, 19, 9, 30);
    expect(event.end_at - event.start_at).toBe(60 * 60 * 1000);
  });
});
