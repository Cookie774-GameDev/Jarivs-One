export const EMPIRE_FREEZER_STORAGE_KEY = 'vibespace-empire-freezer-v1';
export const EMPIRE_FREEZER_DEFAULT_INTERVAL_MS = 20 * 60_000;
export const EMPIRE_FREEZER_DEFAULT_DURATION_MS = 20_000;

export interface EmpireFreezerConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly durationMs: number;
}

const DEFAULT_CONFIG: EmpireFreezerConfig = Object.freeze({
  enabled: false,
  intervalMs: EMPIRE_FREEZER_DEFAULT_INTERVAL_MS,
  durationMs: EMPIRE_FREEZER_DEFAULT_DURATION_MS,
});

const listeners = new Set<() => void>();

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function readStoredConfig(): EmpireFreezerConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(EMPIRE_FREEZER_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<EmpireFreezerConfig>;
    return Object.freeze({
      enabled: parsed.enabled === true,
      intervalMs: boundedNumber(
        parsed.intervalMs,
        EMPIRE_FREEZER_DEFAULT_INTERVAL_MS,
        60_000,
        180 * 60_000,
      ),
      durationMs: boundedNumber(
        parsed.durationMs,
        EMPIRE_FREEZER_DEFAULT_DURATION_MS,
        5_000,
        10 * 60_000,
      ),
    });
  } catch {
    return DEFAULT_CONFIG;
  }
}

let snapshot = readStoredConfig();

export function getEmpireFreezerConfig(): EmpireFreezerConfig {
  return snapshot;
}

export function subscribeEmpireFreezer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateEmpireFreezerConfig(
  patch: Partial<EmpireFreezerConfig>,
): EmpireFreezerConfig {
  snapshot = Object.freeze({
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : snapshot.enabled,
    intervalMs: boundedNumber(patch.intervalMs, snapshot.intervalMs, 60_000, 180 * 60_000),
    durationMs: boundedNumber(patch.durationMs, snapshot.durationMs, 5_000, 10 * 60_000),
  });
  try {
    window.localStorage.setItem(EMPIRE_FREEZER_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // The in-memory preference remains usable when storage is unavailable.
  }
  for (const listener of listeners) listener();
  return snapshot;
}

export function resetEmpireFreezerForTests(): void {
  snapshot = DEFAULT_CONFIG;
  listeners.clear();
  if (typeof window !== 'undefined') window.localStorage.removeItem(EMPIRE_FREEZER_STORAGE_KEY);
}
