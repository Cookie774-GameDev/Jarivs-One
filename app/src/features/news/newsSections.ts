/**
 * Pure helpers that turn the static news catalog into sectioned feeds.
 * No React / store deps — easy to unit test.
 */
import {
  NEWS_CATALOG,
  type NewsItem,
  type NewsKind,
  type NewsSectionId,
} from './newsCatalog';

/** Parse YYYY-MM-DD as a local calendar day (noon UTC to avoid TZ edge cases). */
export function parseNewsDay(isoDay: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d, 12, 0, 0));
}

/** Format a Date as YYYY-MM-DD in UTC calendar. */
export function toIsoDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Days between two YYYY-MM-DD values (b - a), integer calendar days.
 * Returns NaN if either date is invalid.
 */
export function daysBetween(isoA: string, isoB: string): number {
  const a = parseNewsDay(isoA);
  const b = parseNewsDay(isoB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.NaN;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Which panel tab an item belongs to for a given "today".
 *
 * - today: same calendar day
 * - last_week: 1–7 days before today (inclusive of 7)
 * - more: older than 7 days, or invalid / future dates
 */
export function sectionForItem(
  item: Pick<NewsItem, 'publishedAt'>,
  todayIso: string,
): NewsSectionId {
  const delta = daysBetween(item.publishedAt, todayIso);
  if (Number.isNaN(delta)) return 'more';
  if (delta === 0) return 'today';
  if (delta >= 1 && delta <= 7) return 'last_week';
  return 'more';
}

export interface NewsFeedOptions {
  /** Override "today" for tests. Defaults to current UTC calendar day. */
  now?: Date;
  /** Optional kind filter. */
  kind?: NewsKind | 'all';
  catalog?: readonly NewsItem[];
}

export function resolveTodayIso(now: Date = new Date()): string {
  return toIsoDay(now);
}

export function getNewsFeed(section: NewsSectionId, options: NewsFeedOptions = {}): NewsItem[] {
  const catalog = options.catalog ?? NEWS_CATALOG;
  const todayIso = resolveTodayIso(options.now ?? new Date());
  const kind = options.kind ?? 'all';

  return catalog
    .filter((item) => sectionForItem(item, todayIso) === section)
    .filter((item) => kind === 'all' || item.kind === kind)
    .slice()
    .sort((a, b) => {
      // Newest first, then title for stability.
      const byDate = b.publishedAt.localeCompare(a.publishedAt);
      if (byDate !== 0) return byDate;
      return a.title.localeCompare(b.title);
    });
}

export function countNewsBySection(options: NewsFeedOptions = {}): Record<NewsSectionId, number> {
  return {
    today: getNewsFeed('today', options).length,
    last_week: getNewsFeed('last_week', options).length,
    more: getNewsFeed('more', options).length,
  };
}

/** Friendly long date for cards. */
export function formatNewsDate(isoDay: string, locale?: string): string {
  const d = parseNewsDay(isoDay);
  if (Number.isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
