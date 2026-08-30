import { validateJarvisArtifact } from '@/lib/jarvis/contracts/validators';
import type { JarvisArtifactRepository } from '@/lib/db/jarvisRepositories';
import type { JarvisArtifactV1 } from './types';

const SAFE_INTERNAL_ARTIFACT_URI_PROTOCOLS = new Set([
  'app:',
  'asset:',
  'jarvis:',
  'tauri:',
  'vibespace:',
]);
const SUMMARY_LIMIT = 160;
const ARTIFACT_TITLE_LIMIT = 512;
const ARTIFACT_SAFE_SUMMARY_LIMIT = 2_048;
const ARTIFACT_PREVIEW_LIMIT = 48_000;
const CANONICAL_ARTIFACT_DIGEST = /^[a-f0-9]{64}$/u;

export type JarvisArtifactAccess =
  | Readonly<{ kind: 'external_uri'; target: string; hostname: string }>
  | Readonly<{ kind: 'internal_uri'; target: string }>;

export type JarvisArtifactReference = Readonly<
  Pick<JarvisArtifactV1, 'title' | 'kind' | 'state'> & { artifactId: string }
>;

export type JarvisArtifactPreviewSnapshot = Readonly<{
  accountId: string;
  artifactId: string;
  artifactDigest: string;
  title: string;
  safeSummary?: string;
  preview:
    | Readonly<{ kind: 'none'; truncated: false }>
    | Readonly<{ kind: 'text'; text: string; truncated: boolean }>;
}>;

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

function isExactArtifactScopeValue(value: string, maxLength: number): boolean {
  return (
    value.length > 0 && value.length <= maxLength && value === value.trim() && !value.includes('\0')
  );
}

function isStableArtifactDisplayText(value: string, maxLength: number): boolean {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isSafeArtifactPreviewText(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= ARTIFACT_PREVIEW_LIMIT &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  );
}

/**
 * Resolve access only after the canonical repository has enforced the exact account boundary.
 * Repository errors are intentionally contained so callers cannot fall back to unscoped data.
 */
export async function resolveAccountJarvisArtifactAccess(
  repository: Pick<JarvisArtifactRepository, 'getById'>,
  input: Readonly<{
    accountId: string;
    artifactId: string;
    runtime: Readonly<{ desktop: boolean }>;
  }>,
): Promise<JarvisArtifactAccess | undefined> {
  if (
    !isExactArtifactScopeValue(input.accountId, 256) ||
    !isExactArtifactScopeValue(input.artifactId, 512)
  ) {
    return undefined;
  }
  try {
    const artifact = await repository.getById(input.accountId, input.artifactId);
    return artifact ? resolveJarvisArtifactAccess(artifact, input.runtime) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Return a bounded metadata-only preview for an exact account/artifact scope.
 * This projection deliberately omits URI, local reference, hashes other than the
 * canonical content digest, source references, and every unrestricted backing payload.
 */
export async function resolveAccountJarvisArtifactPreview(
  repository: Pick<JarvisArtifactRepository, 'getById'>,
  input: Readonly<{ accountId: string; artifactId: string }>,
): Promise<JarvisArtifactPreviewSnapshot | undefined> {
  if (
    !isExactArtifactScopeValue(input.accountId, 256) ||
    !isExactArtifactScopeValue(input.artifactId, 512)
  ) {
    return undefined;
  }
  try {
    const artifact = await repository.getById(input.accountId, input.artifactId);
    if (
      !artifact ||
      artifact.id !== input.artifactId ||
      !isRenderableJarvisArtifact(artifact) ||
      typeof artifact.contentHash !== 'string' ||
      !CANONICAL_ARTIFACT_DIGEST.test(artifact.contentHash) ||
      !isStableArtifactDisplayText(artifact.title, ARTIFACT_TITLE_LIMIT) ||
      (artifact.safeSummary !== undefined &&
        !isStableArtifactDisplayText(artifact.safeSummary, ARTIFACT_SAFE_SUMMARY_LIMIT))
    ) {
      return undefined;
    }
    const preview =
      artifact.preview?.kind === 'text' &&
      typeof artifact.preview.text === 'string' &&
      isSafeArtifactPreviewText(artifact.preview.text)
        ? Object.freeze({
            kind: 'text' as const,
            text: artifact.preview.text,
            truncated: artifact.preview.truncated,
          })
        : artifact.preview?.kind === 'text'
          ? undefined
          : Object.freeze({ kind: 'none' as const, truncated: false as const });
    if (!preview) return undefined;
    return Object.freeze({
      accountId: input.accountId,
      artifactId: artifact.id,
      artifactDigest: artifact.contentHash,
      title: artifact.title,
      ...(artifact.safeSummary === undefined ? {} : { safeSummary: artifact.safeSummary }),
      preview,
    });
  } catch {
    return undefined;
  }
}

/**
 * Project the only canonical artifact metadata that a discovery surface may expose.
 * Backing references, URIs, previews, hashes, summaries, and content stay behind the
 * artifact repository/access boundary.
 */
export function projectJarvisArtifactReference(
  artifact: Readonly<JarvisArtifactV1>,
): JarvisArtifactReference | undefined {
  if (!isRenderableJarvisArtifact(artifact)) return undefined;
  return Object.freeze({
    artifactId: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    state: artifact.state,
  });
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
