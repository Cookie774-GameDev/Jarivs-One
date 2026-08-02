import { describe, expect, it } from 'vitest';
import type { JarvisArtifactV1 } from './types';
import {
  conciseJarvisArtifactSummary,
  isRenderableJarvisArtifact,
  resolveJarvisArtifactAccess,
} from './artifactAccess';

function artifact(overrides: Partial<JarvisArtifactV1> = {}): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id: 'artifact-access-1',
    runId: 'run-access-1',
    requestId: 'request-access-1',
    attemptNumber: 1,
    state: 'ready',
    kind: 'document',
    title: 'Verified report',
    sourceRefs: [],
    createdAt: 100,
    ...overrides,
  };
}

describe('resolveJarvisArtifactAccess', () => {
  it('admits only contract-valid nonquarantined artifacts for rendering', () => {
    expect(isRenderableJarvisArtifact(artifact())).toBe(true);
    expect(isRenderableJarvisArtifact(artifact({ state: 'quarantined' }))).toBe(false);
    expect(isRenderableJarvisArtifact(artifact({ attemptNumber: 0 }))).toBe(false);
  });

  it('classifies an approved HTTPS target with the hostname disclosed separately', () => {
    expect(
      resolveJarvisArtifactAccess(artifact({ uri: 'https://example.test/report?view=full' }), {
        desktop: false,
      }),
    ).toEqual({
      kind: 'external_uri',
      target: 'https://example.test/report?view=full',
      hostname: 'example.test',
    });
  });

  it.each([
    'asset://artifact/report',
    'vibespace://artifact/report',
    'app://artifact/report',
    'jarvis://artifact/report',
    'tauri://artifact/report',
  ])('returns an approved internal URI target for %s', (uri) => {
    expect(resolveJarvisArtifactAccess(artifact({ uri }), { desktop: false })).toEqual({
      kind: 'internal_uri',
      target: uri,
    });
  });

  it('keeps renderer-supplied local paths unavailable without a native verified-artifact root', () => {
    const path = 'C:\\workspace\\reports\\launch.md';
    const output = artifact({ localReference: { kind: 'path', value: path } });

    expect(resolveJarvisArtifactAccess(output, { desktop: true })).toBeUndefined();
    expect(resolveJarvisArtifactAccess(output, { desktop: false })).toBeUndefined();
  });

  it.each([
    artifact({ uri: 'javascript:alert(document.domain)' }),
    artifact({ uri: 'http://example.test/insecure' }),
    artifact({ uri: 'https://user:password@example.test/private' }),
    artifact({ state: 'quarantined', uri: 'https://example.test/quarantined' }),
    artifact({ localReference: { kind: 'path', value: 'relative/report.md' } }),
    artifact({ localReference: { kind: 'blob_key', value: 'artifact-blob-1' } }),
    artifact({ localReference: { kind: 'message_part', value: 'message-part-1' } }),
  ])('does not invent access for unsafe, quarantined, relative, or opaque backing', (output) => {
    expect(resolveJarvisArtifactAccess(output, { desktop: true })).toBeUndefined();
  });
});

describe('conciseJarvisArtifactSummary', () => {
  it('collapses whitespace and bounds a long summary without splitting the contract', () => {
    const summary = `  ${'Verified output '.repeat(20)} \n ready.  `;
    const concise = conciseJarvisArtifactSummary(summary);

    expect(concise).toBeDefined();
    expect(Array.from(concise ?? '').length).toBeLessThanOrEqual(160);
    expect(concise).toMatch(/…$/u);
    expect(concise).not.toMatch(/\s{2,}/u);
  });

  it('returns no copy for an empty summary', () => {
    expect(conciseJarvisArtifactSummary(' \n\t ')).toBeUndefined();
  });
});
