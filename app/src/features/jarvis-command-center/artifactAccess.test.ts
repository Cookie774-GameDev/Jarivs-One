import { describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactV1 } from './types';
import {
  conciseJarvisArtifactSummary,
  isRenderableJarvisArtifact,
  projectJarvisArtifactReference,
  resolveAccountJarvisArtifactAccess,
  resolveAccountJarvisArtifactPreview,
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

describe('resolveAccountJarvisArtifactAccess', () => {
  it('resolves only the exact account and opaque artifact identity through the repository', async () => {
    const getById = vi.fn(async () => artifact({ uri: 'https://example.test/report' }));

    await expect(
      resolveAccountJarvisArtifactAccess(
        { getById },
        {
          accountId: 'account-alpha',
          artifactId: 'jart_opaque-report',
          runtime: { desktop: true },
        },
      ),
    ).resolves.toEqual({
      kind: 'external_uri',
      target: 'https://example.test/report',
      hostname: 'example.test',
    });
    expect(getById).toHaveBeenCalledExactlyOnceWith('account-alpha', 'jart_opaque-report');
  });

  it.each([
    { accountId: '', artifactId: 'jart_opaque-report' },
    { accountId: ' account-alpha', artifactId: 'jart_opaque-report' },
    { accountId: 'account-alpha', artifactId: '' },
    { accountId: 'account-alpha', artifactId: 'jart_bad\u0000id' },
  ])('fails closed before repository access for an invalid scope: %o', async (input) => {
    const getById = vi.fn();
    await expect(
      resolveAccountJarvisArtifactAccess({ getById }, { ...input, runtime: { desktop: false } }),
    ).resolves.toBeUndefined();
    expect(getById).not.toHaveBeenCalled();
  });

  it('contains repository errors and unavailable or quarantined artifacts', async () => {
    const rejected = vi.fn(async () => Promise.reject(new Error('private database unavailable')));
    await expect(
      resolveAccountJarvisArtifactAccess(
        { getById: rejected },
        {
          accountId: 'account-alpha',
          artifactId: 'jart_opaque-report',
          runtime: { desktop: false },
        },
      ),
    ).resolves.toBeUndefined();

    const quarantined = vi.fn(async () => artifact({ state: 'quarantined' }));
    await expect(
      resolveAccountJarvisArtifactAccess(
        { getById: quarantined },
        {
          accountId: 'account-alpha',
          artifactId: 'jart_opaque-report',
          runtime: { desktop: false },
        },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('resolveAccountJarvisArtifactPreview', () => {
  it('projects exact account-bound digest and bounded canonical display metadata', async () => {
    const getById = vi.fn(async () =>
      artifact({
        id: 'jart_opaque-report',
        contentHash: 'a'.repeat(64),
        title: 'Launch report',
        safeSummary: 'A verified report.',
        preview: { kind: 'text', text: '# Launch\n\nReady.', truncated: false, sizeBytes: 18 },
        uri: 'https://example.test/private',
        localReference: { kind: 'path', value: 'C:\\private\\launch.md' },
      }),
    );

    await expect(
      resolveAccountJarvisArtifactPreview(
        { getById },
        { accountId: 'account-alpha', artifactId: 'jart_opaque-report' },
      ),
    ).resolves.toEqual({
      accountId: 'account-alpha',
      artifactId: 'jart_opaque-report',
      artifactDigest: 'a'.repeat(64),
      title: 'Launch report',
      safeSummary: 'A verified report.',
      preview: { kind: 'text', text: '# Launch\n\nReady.', truncated: false },
    });
    expect(getById).toHaveBeenCalledExactlyOnceWith('account-alpha', 'jart_opaque-report');
  });

  it.each([
    artifact({ contentHash: undefined }),
    artifact({ contentHash: `sha256:${'a'.repeat(64)}` }),
    artifact({ contentHash: 'A'.repeat(64) }),
    artifact({ contentHash: 'a'.repeat(64), title: ' title' }),
    artifact({ contentHash: 'a'.repeat(64), state: 'quarantined' }),
    artifact({
      contentHash: 'a'.repeat(64),
      preview: { kind: 'text', text: 'x'.repeat(48_001), truncated: true, sizeBytes: 48_001 },
    }),
  ])('fails closed for a noncanonical or unsafe metadata snapshot', async (value) => {
    await expect(
      resolveAccountJarvisArtifactPreview(
        { getById: vi.fn(async () => value) },
        { accountId: 'account-alpha', artifactId: value.id },
      ),
    ).resolves.toBeUndefined();
  });

  it('does not disclose URI, backing references, or image preview payloads', async () => {
    const resolved = await resolveAccountJarvisArtifactPreview(
      {
        getById: vi.fn(async () =>
          artifact({
            contentHash: 'b'.repeat(64),
            uri: 'https://example.test/private',
            localReference: { kind: 'path', value: 'C:\\private\\launch.png' },
            preview: { kind: 'image', text: 'raw-image-payload', truncated: false, sizeBytes: 17 },
          }),
        ),
      },
      { accountId: 'account-alpha', artifactId: 'artifact-access-1' },
    );

    expect(resolved).toMatchObject({ preview: { kind: 'none', truncated: false } });
    expect(JSON.stringify(resolved)).not.toMatch(/example\.test|private|raw-image-payload/u);
  });
});

describe('projectJarvisArtifactReference', () => {
  it('projects only opaque identity and display metadata from a canonical artifact', () => {
    const projected = projectJarvisArtifactReference(
      artifact({
        id: 'jart_opaque-report',
        title: 'Launch report',
        kind: 'document',
        uri: 'https://user:password@example.test/private',
        safeSummary: 'credential=do-not-render',
        contentHash: 'sha256-secret-digest',
        preview: {
          kind: 'text',
          text: 'private document body',
          truncated: false,
          sizeBytes: 21,
        },
        localReference: {
          kind: 'path',
          value: 'C:\\private\\launch.md',
        },
      }),
    );

    expect(projected).toEqual({
      artifactId: 'jart_opaque-report',
      title: 'Launch report',
      kind: 'document',
      state: 'ready',
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /password|credential|private document|private\\\\launch|sha256-secret/u,
    );
  });

  it('rejects quarantined or contract-invalid artifacts', () => {
    expect(projectJarvisArtifactReference(artifact({ state: 'quarantined' }))).toBeUndefined();
    expect(projectJarvisArtifactReference(artifact({ attemptNumber: 0 }))).toBeUndefined();
  });
});
