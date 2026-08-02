import type { Part } from '@/types';

import type { JarvisArtifactV1 } from './contracts/execution';
import type { JarvisResponseEnvelope } from './contracts/response';
import { validateJarvisArtifact } from './contracts/validators';

export class JarvisKernelProjectionError extends Error {
  readonly code:
    | 'artifact_missing'
    | 'artifact_invalid'
    | 'artifact_unbacked'
    | 'artifact_scope_mismatch';

  constructor(code: JarvisKernelProjectionError['code'], message: string) {
    super(message);
    this.name = 'JarvisKernelProjectionError';
    this.code = code;
  }
}

const VISIBLE_URI_PROTOCOLS = new Set([
  'https:',
  'asset:',
  'vibespace:',
  'app:',
  'jarvis:',
  'tauri:',
]);

function visibleUri(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return VISIBLE_URI_PROTOCOLS.has(parsed.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function requireArtifact(
  response: Readonly<JarvisResponseEnvelope>,
  artifactsById: ReadonlyMap<string, JarvisArtifactV1>,
  artifactId: string,
): JarvisArtifactV1 {
  const artifact = artifactsById.get(artifactId);
  if (!artifact) {
    throw new JarvisKernelProjectionError(
      'artifact_missing',
      `Canonical artifact ${artifactId} is unavailable.`,
    );
  }
  if (artifact.runId !== response.runId || artifact.requestId !== response.requestId) {
    throw new JarvisKernelProjectionError(
      'artifact_scope_mismatch',
      `Canonical artifact ${artifactId} is bound to another request.`,
    );
  }
  if (!artifact.uri && !artifact.localReference) {
    throw new JarvisKernelProjectionError(
      'artifact_unbacked',
      `Canonical artifact ${artifactId} has no verified backing.`,
    );
  }
  if (!validateJarvisArtifact(artifact).ok) {
    throw new JarvisKernelProjectionError(
      'artifact_invalid',
      `Canonical artifact ${artifactId} is invalid.`,
    );
  }
  return artifact;
}

export function projectJarvisEnvelopeToMessageParts(input: {
  response: Readonly<JarvisResponseEnvelope>;
  artifacts: readonly JarvisArtifactV1[];
}): readonly Part[] {
  const parts: Part[] = input.response.parts.filter(
    (part) => part.kind !== 'jarvis_source_ref' && part.kind !== 'jarvis_artifact_ref',
  );
  const projectedSourceIds = new Set<string>();
  const projectedArtifactIds = new Set<string>();

  for (const source of input.response.sourceRefs) {
    if (projectedSourceIds.has(source.id)) continue;
    projectedSourceIds.add(source.id);
    const uri =
      source.sensitivity === 'restricted' || source.sensitivity === 'secret'
        ? undefined
        : visibleUri(source.uri);
    parts.push(
      Object.freeze({
        kind: 'jarvis_source_ref' as const,
        source: Object.freeze({
          id: source.id,
          kind: source.kind,
          label: source.label,
          ...(uri === undefined ? {} : { uri }),
          trust: source.trust,
          sensitivity: source.sensitivity,
          ...(source.observedAt === undefined ? {} : { observedAt: source.observedAt }),
        }),
      }),
    );
  }

  const artifactsById = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const artifactId of input.response.artifactIds) {
    if (projectedArtifactIds.has(artifactId)) continue;
    const artifact = requireArtifact(input.response, artifactsById, artifactId);
    projectedArtifactIds.add(artifactId);
    const uri = visibleUri(artifact.uri);
    parts.push(
      Object.freeze({
        kind: 'jarvis_artifact_ref' as const,
        artifact: Object.freeze({
          id: artifact.id,
          kind: artifact.kind,
          title: artifact.title,
          state: artifact.state,
          ...(uri === undefined ? {} : { uri }),
          ...(artifact.safeSummary === undefined ? {} : { safeSummary: artifact.safeSummary }),
        }),
      }),
    );
  }

  return Object.freeze(parts);
}
