/**
 * Windows-style date grouping for the themed File Explorer.
 * Sections: Today, Yesterday, Earlier this week, Last week, etc.
 * Uses modified time (falls back to created). Search results should not use this.
 */

export type DateGroupId =
  | 'today'
  | 'yesterday'
  | 'earlierThisWeek'
  | 'lastWeek'
  | 'earlierThisMonth'
  | 'lastMonth'
  | 'earlierThisYear'
  | 'aLongTimeAgo'
  | 'unknown';

export const DATE_GROUP_ORDER: DateGroupId[] = [
  'today',
  'yesterday',
  'earlierThisWeek',
  'lastWeek',
  'earlierThisMonth',
  'lastMonth',
  'earlierThisYear',
  'aLongTimeAgo',
  'unknown',
];

export const DATE_GROUP_LABELS: Record<DateGroupId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlierThisWeek: 'Earlier this week',
  lastWeek: 'Last week',
  earlierThisMonth: 'Earlier this month',
  lastMonth: 'Last month',
  earlierThisYear: 'Earlier this year',
  aLongTimeAgo: 'A long time ago',
  unknown: 'Unknown date',
};

export interface DateGroupSection<T> {
  id: DateGroupId;
  label: string;
  entries: T[];
}

export interface DateGroupable {
  name: string;
  isDir: boolean;
  modifiedMs?: number;
  createdMs?: number;
}

/** Prefer modified time, then created; null if neither is usable. */
export function entryTimestampMs(entry: DateGroupable): number | null {
  const candidates = [entry.modifiedMs, entry.createdMs];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Windows-style week starts Sunday (local time). */
function startOfLocalWeek(ms: number): number {
  const d = new Date(startOfLocalDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function startOfLocalMonth(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfLocalYear(ms: number): number {
  const d = new Date(ms);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Map a timestamp into a Windows-like date group bucket.
 * `nowMs` is injectable for tests.
 */
export function getDateGroupId(timestampMs: number | null, nowMs: number = Date.now()): DateGroupId {
  if (timestampMs == null || !Number.isFinite(timestampMs) || timestampMs <= 0) {
    return 'unknown';
  }

  // Future timestamps still land in Today so the list stays usable.
  const ts = Math.min(timestampMs, nowMs + 24 * 60 * 60 * 1000);

  const todayStart = startOfLocalDay(nowMs);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const thisWeekStart = startOfLocalWeek(nowMs);
  const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
  const thisMonthStart = startOfLocalMonth(nowMs);
  const lastMonthStart = startOfLocalMonth(new Date(thisMonthStart - 1).getTime());
  const thisYearStart = startOfLocalYear(nowMs);

  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  if (ts >= thisWeekStart) return 'earlierThisWeek';
  if (ts >= lastWeekStart) return 'lastWeek';
  if (ts >= thisMonthStart) return 'earlierThisMonth';
  if (ts >= lastMonthStart) return 'lastMonth';
  if (ts >= thisYearStart) return 'earlierThisYear';
  return 'aLongTimeAgo';
}

/**
 * Sort like Windows when "Date modified" is active:
 * newest first; folders and files mixed by timestamp; name as tiebreaker.
 * Entries without a timestamp sort last (A–Z).
 */
export function sortEntriesByDateDesc<T extends DateGroupable>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const ta = entryTimestampMs(a);
    const tb = entryTimestampMs(b);
    if (ta != null && tb != null && ta !== tb) return tb - ta;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;
    // Stable secondary: folders first, then name (only when timestamps equal/missing)
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Group folder listings into Today / Yesterday / … sections.
 * Empty groups are omitted. Order matches Windows File Explorer.
 */
export function groupEntriesByDate<T extends DateGroupable>(
  entries: T[],
  nowMs: number = Date.now(),
): DateGroupSection<T>[] {
  const sorted = sortEntriesByDateDesc(entries);
  const buckets = new Map<DateGroupId, T[]>();

  for (const entry of sorted) {
    const id = getDateGroupId(entryTimestampMs(entry), nowMs);
    const list = buckets.get(id);
    if (list) list.push(entry);
    else buckets.set(id, [entry]);
  }

  const sections: DateGroupSection<T>[] = [];
  for (const id of DATE_GROUP_ORDER) {
    const list = buckets.get(id);
    if (!list?.length) continue;
    sections.push({
      id,
      label: DATE_GROUP_LABELS[id],
      entries: list,
    });
  }
  return sections;
}
