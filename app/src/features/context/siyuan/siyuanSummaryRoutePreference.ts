import type { EffortLabel } from '@/lib/ai/catalog/modelVariants';

export type SiyuanSummaryRoutePreference =
  | Readonly<{ mode: 'automatic' }>
  | Readonly<{
      mode: 'route';
      providerId: string;
      connectionId: string;
      modelId: string;
      effort: EffortLabel;
    }>;

const STORAGE_KEY = 'vibespace.siyuan-summary-route-preferences.v1';

function clean(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  if (!result || result.length > maximum || /[\u0000-\u001f\u007f]/u.test(result)) return null;
  return result;
}

function scopeKey(
  accountId: string | null,
  projectId: string | null,
  mapId: string,
): string | null {
  const account = clean(accountId, 512);
  const project = clean(projectId, 512);
  const map = clean(mapId, 512);
  return account && project && map ? JSON.stringify([account, project, map]) : null;
}

function parsePreference(value: unknown): SiyuanSummaryRoutePreference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.mode === 'automatic') return { mode: 'automatic' };
  const providerId = clean(record.providerId, 128);
  const connectionId = clean(record.connectionId, 256);
  const modelId = clean(record.modelId, 512);
  const effort = ['auto', 'minimal', 'low', 'medium', 'high', 'ultra', 'max'].includes(
    String(record.effort ?? 'auto'),
  )
    ? (String(record.effort ?? 'auto') as EffortLabel)
    : null;
  return providerId && connectionId && modelId
    ? effort && { mode: 'route', providerId, connectionId, modelId, effort }
    : null;
}

function readAll(storage: Pick<Storage, 'getItem'>): Record<string, SiyuanSummaryRoutePreference> {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key, parsePreference(value)] as const)
        .filter((entry): entry is readonly [string, SiyuanSummaryRoutePreference] =>
          Boolean(entry[1]),
        ),
    );
  } catch {
    return {};
  }
}

export function readSiyuanSummaryRoutePreference(
  storage: Pick<Storage, 'getItem'>,
  accountId: string | null,
  projectId: string | null,
  mapId: string,
): SiyuanSummaryRoutePreference | null {
  const key = scopeKey(accountId, projectId, mapId);
  return key ? (readAll(storage)[key] ?? null) : null;
}

export function matchesSiyuanSummaryRoutePreference(
  preference: SiyuanSummaryRoutePreference | null,
  route: Readonly<{
    providerId: string;
    connectionId: string;
    modelId: string;
    effort: EffortLabel;
  }>,
): boolean {
  return (
    preference?.mode === 'route' &&
    preference.providerId === route.providerId &&
    preference.connectionId === route.connectionId &&
    preference.modelId === route.modelId &&
    preference.effort === route.effort
  );
}

export function writeSiyuanSummaryRoutePreference(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  accountId: string | null,
  projectId: string | null,
  mapId: string,
  preference: Omit<Extract<SiyuanSummaryRoutePreference, { mode: 'route' }>, 'mode'>,
): boolean {
  const key = scopeKey(accountId, projectId, mapId);
  const validated = parsePreference({ mode: 'route', ...preference });
  if (!key || !validated) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(storage), [key]: validated }));
    return true;
  } catch {
    return false;
  }
}

export function writeAutomaticSiyuanSummaryRoutePreference(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  accountId: string | null,
  projectId: string | null,
  mapId: string,
): boolean {
  const key = scopeKey(accountId, projectId, mapId);
  if (!key) return false;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readAll(storage), [key]: { mode: 'automatic' } }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSiyuanSummaryRoutePreference(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  accountId: string | null,
  projectId: string | null,
  mapId: string,
): boolean {
  const key = scopeKey(accountId, projectId, mapId);
  if (!key) return false;
  try {
    const preferences = readAll(storage);
    delete preferences[key];
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
