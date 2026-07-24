import { validateJarvisArtifact } from '@/lib/jarvis/contracts/validators';
import type { JarvisArtifactV1 } from './types';

const SAFE_ARTIFACT_URI_PROTOCOLS = new Set([
  'app:',
  'asset:',
  'https:',
  'jarvis:',
  'tauri:',
  'vibespace:',
]);
const SUMMARY_LIMIT = 160;

export type JarvisArtifactAccess =
  | Readonly<{ kind: 'uri'; target: string }>
  | Readonly<{ kind: 'local_path'; target: string }>;

export function isRenderableJarvisArtifact(artifact: Readonly<JarvisArtifactV1>): boolean {
  return artifact.state !== 'quarantined' && validateJarvisArtifact(artifact).ok;
}

function safeArtifactUri(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return SAFE_ARTIFACT_URI_PROTOCOLS.has(new URL(value).protocol.toLowerCase())
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function absoluteLocalPath(value: string): string | undefined {
  const path = value.trim();
  if (!path || /[\u0000\r\n]/u.test(path)) return undefined;
  if (/^[A-Za-z]:[\\/]/u.test(path)) return path;
  if (/^\\\\[^\\/]+[\\/][^\\/]+/u.test(path)) return path;
  if (/^\/(?!\/)/u.test(path)) return path;
  return undefined;
}

export function resolveJarvisArtifactAccess(
  artifact: Readonly<JarvisArtifactV1>,
  runtime: Readonly<{ desktop: boolean }>,
): JarvisArtifactAccess | undefined {
  if (!isRenderableJarvisArtifact(artifact)) return undefined;

  const uri = safeArtifactUri(artifact.uri);
  if (uri) return Object.freeze({ kind: 'uri', target: uri });

  if (!runtime.desktop || artifact.localReference?.kind !== 'path') return undefined;
  const path = absoluteLocalPath(artifact.localReference.value);
  return path ? Object.freeze({ kind: 'local_path', target: path }) : undefined;
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
