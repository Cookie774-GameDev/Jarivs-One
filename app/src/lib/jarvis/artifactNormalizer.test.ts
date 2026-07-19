import { describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactDraft, JarvisArtifactV1 } from './contracts/execution';
import type { ArtifactPreDigestBinding } from './artifactReceipts';
import { createArtifactReceiptAuthority } from './artifactReceipts';
import {
  canonicalizeArtifactDraftInternal,
  normalizeVerifiedArtifactInternal,
} from './artifactNormalizer';

const NOW = 1_786_200_100_000;

function binding(overrides: Partial<ArtifactPreDigestBinding> = {}): ArtifactPreDigestBinding {
  return {
    accountId: 'account-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    artifactId: 'jart_artifact-alpha',
    producerId: 'provider_response',
    resultRef: 'provider-result-alpha',
    verifiedAt: NOW,
    ...overrides,
  };
}

function draft(overrides: Partial<JarvisArtifactDraft> = {}): JarvisArtifactDraft {
  return {
    artifact: {
      kind: 'text',
      title: 'Verified provider output',
      mimeType: 'text/plain',
      safeSummary: 'A synthetic verified output.',
      sourceRefs: [
        {
          id: 'source-alpha',
          kind: 'tool_result',
          label: 'Verified producer result',
          accountId: 'account-alpha',
          trust: 'app_verified',
          sensitivity: 'private',
        },
      ],
      createdAt: NOW,
    },
    backing: { kind: 'producer_result', content: 'hello artifact' },
    ...overrides,
  };
}

async function normalize(candidate = draft(), preDigest = binding()): Promise<JarvisArtifactV1> {
  const material = await canonicalizeArtifactDraftInternal({
    binding: preDigest,
    draft: candidate,
  });
  const authority = createArtifactReceiptAuthority({ randomUUID: () => 'receipt', now: () => NOW });
  const fullBinding = { ...preDigest, artifactDigest: material.artifactDigest };
  const receipt = authority.issueReceipt(fullBinding);
  const verified = authority.verifyAndBindReceipt({ receipt, binding: fullBinding });
  if (!verified) throw new Error('Expected verified binding');
  return normalizeVerifiedArtifactInternal({ binding: verified, material });
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('verified artifact normalizer', () => {
  it.each([
    'file',
    'link',
    'text',
    'image',
    'document',
    'code',
    'terminal_output',
    'provider_result',
  ] as const)('normalizes the closed %s artifact kind', async (kind) => {
    const value = await normalize(
      draft({
        artifact: { ...draft().artifact, kind },
        backing: {
          kind: 'producer_result',
          content: kind === 'image' ? new Uint8Array([1, 2, 3]) : kind,
        },
      }),
    );
    expect(value).toMatchObject({
      schemaVersion: 1,
      id: 'jart_artifact-alpha',
      runId: 'run-alpha',
      requestId: 'request-alpha',
      attemptNumber: 1,
      kind,
      state: 'ready',
      localReference: { kind: 'message_part', value: 'provider-result-alpha' },
    });
    expect(Object.isFrozen(value)).toBe(true);
  });

  it('hashes exact UTF-8 content bytes and returns a detached text preview', async () => {
    const content = 'hello 🌸 artifact';
    const candidate = draft({ backing: { kind: 'producer_result', content } });
    const value = await normalize(candidate);

    expect(value.contentHash).toBe(await sha256(content));
    expect(value.sizeBytes).toBe(new TextEncoder().encode(content).byteLength);
    expect(value.preview).toEqual({
      kind: 'text',
      text: content,
      truncated: false,
      sizeBytes: value.sizeBytes,
    });
    expect(value.sourceRefs).not.toBe(candidate.artifact.sourceRefs);
  });

  it('truncates text at 16,384 bytes without splitting a UTF-8 code point', async () => {
    const content = `${'a'.repeat(16_383)}🌸tail`;
    const value = await normalize(draft({ backing: { kind: 'producer_result', content } }));
    expect(value.preview).toEqual({
      kind: 'text',
      text: 'a'.repeat(16_383),
      truncated: true,
      sizeBytes: new TextEncoder().encode(content).byteLength,
    });
  });

  it('stores image metadata but never inline image bytes', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const value = await normalize(
      draft({
        artifact: { ...draft().artifact, kind: 'image', mimeType: 'image/png' },
        backing: { kind: 'producer_result', content: bytes },
      }),
    );
    expect(value.contentHash).toBe(await sha256(bytes));
    expect(value.preview).toEqual({ kind: 'image', truncated: false, sizeBytes: bytes.byteLength });
    expect(JSON.stringify(value)).not.toContain('137,80,78,71');
  });

  it.each([
    'https://example.test/artifact',
    'asset://jarvis/artifact-alpha',
    'vibespace://artifact/artifact-alpha',
  ])('accepts allowlisted URI backing: %s', async (uri) => {
    const value = await normalize(draft({ backing: { kind: 'uri', uri } }));
    expect(value.uri).toBe(uri);
    expect(value.localReference).toBeUndefined();
  });

  it.each(['http://example.test', 'file:///C:/private.txt', 'artifact label', 'javascript:x'])(
    'rejects untrusted or unparsable URI backing: %s',
    async (uri) => {
      await expect(
        canonicalizeArtifactDraftInternal({
          binding: binding(),
          draft: draft({ backing: { kind: 'uri', uri } }),
        }),
      ).rejects.toThrow('artifact_backing_invalid');
    },
  );

  it('accepts non-empty verified local backing and preserves its stronger reference', async () => {
    const value = await normalize(
      draft({
        backing: {
          kind: 'local_reference',
          localReference: { kind: 'path', value: 'C:/sandbox/output.txt' },
          content: 'written bytes',
        },
      }),
      binding({ producerId: 'file_action_result', resultRef: 'file-result-alpha' }),
    );
    expect(value.localReference).toEqual({ kind: 'path', value: 'C:/sandbox/output.txt' });
  });

  it('requires real backing for partial artifacts', async () => {
    const partial = draft({
      artifact: { ...draft().artifact, state: 'partial' },
      backing: { kind: 'producer_result' },
    });
    await expect(
      canonicalizeArtifactDraftInternal({ binding: binding(), draft: partial }),
    ).rejects.toThrow('artifact_partial_backing_required');
  });

  it('allows quarantined metadata only for a verified producer result', async () => {
    const value = await normalize(
      draft({
        artifact: { ...draft().artifact, state: 'quarantined' },
        backing: { kind: 'producer_result' },
      }),
    );
    expect(value).toMatchObject({
      state: 'quarantined',
      preview: { kind: 'none', truncated: false, sizeBytes: 0 },
    });
    expect(value).not.toHaveProperty('contentHash');
    expect(value).not.toHaveProperty('sizeBytes');

    await expect(
      canonicalizeArtifactDraftInternal({
        binding: binding(),
        draft: draft({
          artifact: { ...draft().artifact, state: 'quarantined' },
          backing: { kind: 'producer_result', content: 'withheld bytes' },
        }),
      }),
    ).rejects.toThrow('artifact_quarantine_invalid');
  });

  it.each([
    [
      'inline secret',
      draft({ backing: { kind: 'producer_result', content: 'password=hunter2-real-value' } }),
    ],
    [
      'secret summary',
      draft({
        artifact: {
          ...draft().artifact,
          safeSummary: 'token=ghp_abcdefghijklmnopqrstuvwxyz123456',
        },
      }),
    ],
  ] as const)('rejects %s instead of redacting and persisting it', async (_label, candidate) => {
    await expect(
      canonicalizeArtifactDraftInternal({ binding: binding(), draft: candidate }),
    ).rejects.toThrow('artifact_secret_rejected');
  });

  it.each([
    ['Slack bot token', 'xoxb-111111111111-222222222222-syntheticTokenValue'],
    ['Slack user token', 'xoxp-111111111111-222222222222-syntheticTokenValue'],
    ['GitHub OAuth token', 'gho_SyntheticCredentialValue1234567890'],
    ['raw AWS secret access key', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/AB'],
    [
      'bearer JWT',
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.syntheticSignatureValue',
    ],
    ['Google provider key', 'AIzaSyntheticProviderCredential1234567890'],
    ['Groq provider key', 'gsk_syntheticProviderCredential1234567890'],
    ['Supabase secret key', 'sb_secret_syntheticProviderCredential1234567890'],
    [
      'private key block',
      '-----BEGIN PRIVATE KEY-----\nc3ludGhldGljLW5vdC1hLXJlYWwta2V5\n-----END PRIVATE KEY-----',
    ],
    ['authorization assignment', 'Authorization: Basic c3ludGhldGljOmNyZWRlbnRpYWw='],
    ['client-secret assignment', 'client_secret=syntheticCredentialValue123456'],
  ] as const)(
    'rejects synthetic %s content before producing preview or canonical material',
    async (_credentialClass, secretText) => {
      let material: Awaited<ReturnType<typeof canonicalizeArtifactDraftInternal>> | undefined;
      let failure: unknown;
      try {
        material = await canonicalizeArtifactDraftInternal({
          binding: binding(),
          draft: draft({ backing: { kind: 'producer_result', content: secretText } }),
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toEqual(new Error('artifact_secret_rejected'));
      expect(material).toBeUndefined();
    },
  );

  it.each([
    ['Slack token summary', 'Completed with xoxp-111111111111-222222222222-syntheticTokenValue'],
    [
      'bearer JWT summary',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.syntheticSignatureValue',
    ],
    ['provider-token summary', 'x-api-key: gsk_syntheticProviderCredential1234567890'],
  ] as const)(
    'rejects synthetic %s instead of redact-and-save',
    async (_credentialClass, safeSummary) => {
      let material: Awaited<ReturnType<typeof canonicalizeArtifactDraftInternal>> | undefined;
      let failure: unknown;
      try {
        material = await canonicalizeArtifactDraftInternal({
          binding: binding(),
          draft: draft({ artifact: { ...draft().artifact, safeSummary } }),
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toEqual(new Error('artifact_secret_rejected'));
      expect(material).toBeUndefined();
    },
  );

  it('rejects cross-account provenance and non-result evidence references', async () => {
    const crossAccount = draft({
      artifact: {
        ...draft().artifact,
        sourceRefs: [{ ...draft().artifact.sourceRefs[0]!, accountId: 'account-beta' }],
      },
    });
    await expect(
      canonicalizeArtifactDraftInternal({ binding: binding(), draft: crossAccount }),
    ).rejects.toThrow('artifact_account_scope_mismatch');

    for (const resultRef of ['queued', 'planned-capability', 'source-only']) {
      await expect(
        canonicalizeArtifactDraftInternal({ binding: binding({ resultRef }), draft: draft() }),
      ).rejects.toThrow('artifact_result_not_verified');
    }
  });

  it('rejects accessor-backed draft fields without invoking them', async () => {
    const getter = vi.fn(() => 'producer_result');
    const backing = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(backing, 'kind', { enumerable: true, get: getter });
    await expect(
      canonicalizeArtifactDraftInternal({
        binding: binding(),
        draft: { artifact: draft().artifact, backing } as never,
      }),
    ).rejects.toThrow('artifact_backing_invalid');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects forged or mismatched material and consumes canonical material at most once', async () => {
    const preDigest = binding();
    const material = await canonicalizeArtifactDraftInternal({
      binding: preDigest,
      draft: draft(),
    });
    const authority = createArtifactReceiptAuthority({
      randomUUID: () => 'receipt',
      now: () => NOW,
    });
    const exact = { ...preDigest, artifactDigest: material.artifactDigest };
    const receipt = authority.issueReceipt(exact);
    const verified = authority.verifyAndBindReceipt({ receipt, binding: exact });
    if (!verified) throw new Error('Expected verified binding');

    expect(() =>
      normalizeVerifiedArtifactInternal({
        binding: { ...verified, runId: 'run-beta' },
        material,
      }),
    ).toThrow('artifact_binding_mismatch');
    expect(() => normalizeVerifiedArtifactInternal({ binding: verified, material })).toThrow(
      'artifact_material_invalid',
    );
    expect(() =>
      normalizeVerifiedArtifactInternal({ binding: verified, material: { ...material } }),
    ).toThrow('artifact_material_invalid');
  });
});
