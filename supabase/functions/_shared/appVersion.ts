export type ServerAppVersionResolution =
  | { readonly kind: 'version'; readonly value: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' };

const MAX_APP_VERSION_LENGTH = 128;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function resolveServerAppVersion(
  value: string | null | undefined,
): ServerAppVersionResolution {
  if (value == null || value.trim() === '') return { kind: 'missing' };
  const normalized = value.trim();
  if (normalized.length > MAX_APP_VERSION_LENGTH) return { kind: 'invalid' };
  const match = SEMVER.exec(normalized);
  if (!match) return { kind: 'invalid' };
  const prerelease = match[4];
  if (
    prerelease?.split('.').some(
      (identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier[0] === '0',
    )
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'version', value: normalized };
}

export function isAuthoritativePrelaunchConfig(
  value: unknown,
  nowMs: number = Date.now(),
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as { enabled?: unknown; launch_at?: unknown };
  if (config.enabled === false) return true;
  if (config.enabled !== true || typeof config.launch_at !== 'string') return false;
  const launchAtMs = Date.parse(config.launch_at);
  return Number.isFinite(launchAtMs) && nowMs < launchAtMs;
}
