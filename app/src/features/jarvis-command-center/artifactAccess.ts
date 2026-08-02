import { validateJarvisArtifact } from '@/lib/jarvis/contracts/validators';
import type { JarvisArtifactV1 } from './types';

const SAFE_INTERNAL_ARTIFACT_URI_PROTOCOLS = new Set([
  'app:',
  'asset:',
  'jarvis:',
  'tauri:',
  'vibespace:',
]);
const SUMMARY_LIMIT = 160;

export type JarvisArtifactAccess =
  | Readonly<{ kind: 'external_uri'; target: string; hostname: string }>
  | Readonly<{ kind: 'internal_uri'; target: string }>;

export function isRenderableJarvisArtifact(artifact: Readonly<JarvisArtifactV1>): boolean {
  return artifact.state !== 'quarantined' && validateJarvisArtifact(artifact).ok;
}

function safeArtifactUri(
  value: string | undefined,
): Extract<JarvisArtifactAccess, { kind: 'external_uri' | 'internal_uri' }> | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (!parsed.hostname) return undefined;
    if (protocol === 'https:') {
      if (parsed.username || parsed.password) return undefined;
      return Object.freeze({
        kind: 'external_uri',
        target: parsed.href,
        hostname: parsed.hostname,
      });
    }
    return SAFE_INTERNAL_ARTIFACT_URI_PROTOCOLS.has(protocol)
      ? Object.freeze({ kind: 'internal_uri', target: parsed.href })
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveJarvisArtifactAccess(
  artifact: Readonly<JarvisArtifactV1>,
  _runtime: Readonly<{ desktop: boolean }>,
): JarvisArtifactAccess | undefined {
  if (!isRenderableJarvisArtifact(artifact)) return undefined;

  const uri = safeArtifactUri(artifact.uri);
  if (uri) return uri;
  return undefined;
}

export function conciseJarvisArtifactSummary(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/gu, ' ');
  if (!normalized) return undefined;
  const characters = Array.from(normalized);
  if (characters.length <= SUMMARY_LIMIT) return normalized;
  return `${characters
    .slice(0, SUMMARY_LIMIT - 1)
    .join('')
    .trimEnd()}…`;
}
