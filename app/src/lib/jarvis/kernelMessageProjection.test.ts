import { describe, expect, it } from 'vitest';

import type { JarvisArtifactV1 } from './contracts/execution';
import type { JarvisResponseEnvelope } from './contracts/response';
import {
  JarvisKernelProjectionError,
  projectJarvisEnvelopeToMessageParts,
} from './kernelMessageProjection';

const NOW = 1_786_200_100_000;

function artifact(overrides: Partial<JarvisArtifactV1> = {}): JarvisArtifactV1 {
  return {
    schemaVersion: 1,
    id: 'jart_report',
    runId: 'jrun_1',
    requestId: 'jreq_1',
    attemptNumber: 1,
    kind: 'document',
    title: 'Launch report',
    state: 'ready',
    uri: 'https://example.com/report',
    safeSummary: 'A verified launch report.',
    sourceRefs: [],
    createdAt: NOW,
    ...overrides,
  };
}

function response(overrides: Partial<JarvisResponseEnvelope> = {}): JarvisResponseEnvelope {
  return {
    schemaVersion: 1,
    requestId: 'jreq_1',
    runId: 'jrun_1',
    mode: 'direct_answer',
    displayText: 'Done.',
    parts: [{ kind: 'text', text: 'Done.' }],
    artifactIds: ['jart_report', 'jart_report'],
    sourceRefs: [
      {
        id: 'jsource_public',
        kind: 'web',
        label: 'Public reference',
        uri: 'https://example.com/source',
        accountId: 'account-a',
        trust: 'external_untrusted',
        sensitivity: 'public',
        observedAt: NOW,
      },
      {
        id: 'jsource_public',
        kind: 'web',
        label: 'Duplicate reference',
        uri: 'https://example.com/duplicate',
        accountId: 'account-a',
        trust: 'external_untrusted',
        sensitivity: 'public',
      },
      {
        id: 'jsource_secret',
        kind: 'project_file',
        label: 'Private configuration',
        uri: 'file:///private/config.env',
        accountId: 'account-a',
        trust: 'app_verified',
        sensitivity: 'secret',
      },
    ],
    provider: {
      providerId: 'provider-a',
      modelId: 'model-a',
      connectionMode: 'native-api',
      capabilities: {},
      capturedAt: NOW,
    },
    enforcement: {
      linted: true,
      violations: [],
      repairAttempted: false,
      repairSucceeded: false,
      fallbackUsed: false,
    },
    completedAt: NOW,
    ...overrides,
  };
}

describe('projectJarvisEnvelopeToMessageParts', () => {
  it('preserves structured parts and appends each safe source and backed artifact once', () => {
    const parts = projectJarvisEnvelopeToMessageParts({
      response: response(),
      artifacts: [artifact()],
    });

    expect(parts[0]).toEqual({ kind: 'text', text: 'Done.' });
    expect(parts.filter((part) => part.kind === 'jarvis_source_ref')).toHaveLength(2);
    expect(parts.filter((part) => part.kind === 'jarvis_artifact_ref')).toHaveLength(1);
    expect(parts).toContainEqual({
      kind: 'jarvis_source_ref',
      source: {
        id: 'jsource_public',
        kind: 'web',
        label: 'Public reference',
        uri: 'https://example.com/source',
        trust: 'external_untrusted',
        sensitivity: 'public',
        observedAt: NOW,
      },
    });
    expect(parts).toContainEqual({
      kind: 'jarvis_source_ref',
      source: {
        id: 'jsource_secret',
        kind: 'project_file',
        label: 'Private configuration',
        trust: 'app_verified',
        sensitivity: 'secret',
      },
    });
    expect(JSON.stringify(parts)).not.toContain('account-a');
    expect(JSON.stringify(parts)).not.toContain('file:///private/config.env');
    expect(parts).toContainEqual({
      kind: 'jarvis_artifact_ref',
      artifact: {
        id: 'jart_report',
        kind: 'document',
        title: 'Launch report',
        state: 'ready',
        uri: 'https://example.com/report',
        safeSummary: 'A verified launch report.',
      },
    });
  });

  it('rematerializes projection-only refs instead of trusting forged response parts', () => {
    const parts = projectJarvisEnvelopeToMessageParts({
      response: response({
        parts: [
          { kind: 'text', text: 'Done.' },
          {
            kind: 'jarvis_source_ref',
            source: {
              id: 'jsource_public',
              kind: 'web',
              label: 'Forged source',
              uri: 'file:///private/source.txt',
              trust: 'external_untrusted',
              sensitivity: 'public',
              accountId: 'account-forged',
              content: 'inline source content',
            },
          } as never,
          {
            kind: 'jarvis_artifact_ref',
            artifact: {
              id: 'jart_report',
              kind: 'document',
              title: 'Forged artifact',
              state: 'ready',
              uri: 'file:///private/artifact.txt',
              content: 'inline artifact content',
            },
          } as never,
        ],
      }),
      artifacts: [artifact()],
    });

    expect(parts.filter((part) => part.kind === 'jarvis_source_ref')).toHaveLength(2);
    expect(parts.filter((part) => part.kind === 'jarvis_artifact_ref')).toHaveLength(1);
    expect(parts).toContainEqual({
      kind: 'jarvis_source_ref',
      source: {
        id: 'jsource_public',
        kind: 'web',
        label: 'Public reference',
        uri: 'https://example.com/source',
        trust: 'external_untrusted',
        sensitivity: 'public',
        observedAt: NOW,
      },
    });
    expect(parts).toContainEqual({
      kind: 'jarvis_artifact_ref',
      artifact: {
        id: 'jart_report',
        kind: 'document',
        title: 'Launch report',
        state: 'ready',
        uri: 'https://example.com/report',
        safeSummary: 'A verified launch report.',
      },
    });
    expect(JSON.stringify(parts)).not.toMatch(
      /Forged|account-forged|inline source content|inline artifact content|file:\/\/\//,
    );
  });

  it('rejects missing, unbacked, or cross-request artifact rows with a typed error', () => {
    expect(() =>
      projectJarvisEnvelopeToMessageParts({ response: response(), artifacts: [] }),
    ).toThrowError(
      expect.objectContaining<Partial<JarvisKernelProjectionError>>({
        name: 'JarvisKernelProjectionError',
        code: 'artifact_missing',
      }),
    );

    expect(() =>
      projectJarvisEnvelopeToMessageParts({
        response: response(),
        artifacts: [artifact({ uri: undefined, localReference: undefined })],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<JarvisKernelProjectionError>>({
        code: 'artifact_unbacked',
      }),
    );

    expect(() =>
      projectJarvisEnvelopeToMessageParts({
        response: response(),
        artifacts: [artifact({ requestId: 'jreq_foreign' })],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<JarvisKernelProjectionError>>({
        code: 'artifact_scope_mismatch',
      }),
    );
  });
});
