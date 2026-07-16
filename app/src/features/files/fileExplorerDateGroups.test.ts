import { describe, expect, it } from 'vitest';
import {
  DATE_GROUP_LABELS,
  entryTimestampMs,
  getDateGroupId,
  groupEntriesByDate,
  sortEntriesByDateDesc,
} from './fileExplorerDateGroups';

/** Fixed "now": Wednesday 2026-07-15 15:00 local. */
function fixedNow(): number {
  return new Date(2026, 6, 15, 15, 0, 0, 0).getTime();
}

function ms(y: number, m0: number, d: number, h = 12): number {
  return new Date(y, m0, d, h, 0, 0, 0).getTime();
}

describe('entryTimestampMs', () => {
  it('prefers modified over created', () => {
    expect(entryTimestampMs({ name: 'a', isDir: false, modifiedMs: 20, createdMs: 10 })).toBe(20);
    expect(entryTimestampMs({ name: 'a', isDir: false, createdMs: 10 })).toBe(10);
    expect(entryTimestampMs({ name: 'a', isDir: false })).toBeNull();
  });
});

describe('getDateGroupId', () => {
  const now = fixedNow();

  it('maps today and yesterday', () => {
    expect(getDateGroupId(ms(2026, 6, 15, 9), now)).toBe('today');
    expect(getDateGroupId(ms(2026, 6, 14, 18), now)).toBe('yesterday');
  });

  it('maps earlier this week and last week (Sunday-start week)', () => {
    // 2026-07-15 is Wednesday; week starts Sunday 2026-07-12
    expect(getDateGroupId(ms(2026, 6, 13, 10), now)).toBe('earlierThisWeek'); // Monday
    expect(getDateGroupId(ms(2026, 6, 8, 10), now)).toBe('lastWeek'); // previous Wed
  });

  it('maps month and year buckets', () => {
    expect(getDateGroupId(ms(2026, 6, 2, 10), now)).toBe('earlierThisMonth');
    expect(getDateGroupId(ms(2026, 5, 20, 10), now)).toBe('lastMonth');
    expect(getDateGroupId(ms(2026, 2, 10, 10), now)).toBe('earlierThisYear');
    expect(getDateGroupId(ms(2025, 11, 1, 10), now)).toBe('aLongTimeAgo');
  });

  it('maps missing timestamps to unknown', () => {
    expect(getDateGroupId(null, now)).toBe('unknown');
    expect(getDateGroupId(0, now)).toBe('unknown');
  });
});

describe('sortEntriesByDateDesc', () => {
  it('sorts newest first and folders first only on equal/missing times', () => {
    const sorted = sortEntriesByDateDesc([
      { name: 'old.txt', isDir: false, modifiedMs: ms(2026, 6, 1) },
      { name: 'new.txt', isDir: false, modifiedMs: ms(2026, 6, 15) },
      { name: 'folder', isDir: true, modifiedMs: ms(2026, 6, 10) },
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['new.txt', 'folder', 'old.txt']);
  });
});

describe('groupEntriesByDate', () => {
  it('builds Windows-style sections and omits empty groups', () => {
    const now = fixedNow();
    const sections = groupEntriesByDate(
      [
        { name: 'today.txt', isDir: false, modifiedMs: ms(2026, 6, 15, 10) },
        { name: 'yest.txt', isDir: false, modifiedMs: ms(2026, 6, 14, 10) },
        { name: 'old.txt', isDir: false, modifiedMs: ms(2025, 1, 1, 10) },
        { name: 'no-date.txt', isDir: false },
      ],
      now,
    );

    expect(sections.map((s) => s.id)).toEqual(['today', 'yesterday', 'aLongTimeAgo', 'unknown']);
    expect(sections[0]?.label).toBe(DATE_GROUP_LABELS.today);
    expect(sections[0]?.entries.map((e) => e.name)).toEqual(['today.txt']);
    expect(sections[1]?.entries.map((e) => e.name)).toEqual(['yest.txt']);
  });

  it('sorts within each section by date descending', () => {
    const now = fixedNow();
    const sections = groupEntriesByDate(
      [
        { name: 'later-today.txt', isDir: false, modifiedMs: ms(2026, 6, 15, 14) },
        { name: 'earlier-today.txt', isDir: false, modifiedMs: ms(2026, 6, 15, 8) },
      ],
      now,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.entries.map((e) => e.name)).toEqual([
      'later-today.txt',
      'earlier-today.txt',
    ]);
  });
});
