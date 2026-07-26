import { describe, expect, it, vi } from 'vitest';
import {
  authorizeContextProcessorCapability,
  parsePassiveContextPackage,
  reviewContextProcessorInstall,
  setContextProcessorEnabled,
} from './contextProcessorSafety';

const manifest = {
  schemaVersion: 1,
  id: 'processor.build',
  name: 'Build Context',
  version: '1.2.3',
  engine: 'wasm',
  isolation: 'sandboxed_process',
  permissions: {
    canReadContext: true,
    canSuggestLinks: true,
    canCreateNotes: false,
    canUpdateProperties: false,
    canRefreshSources: false,
  },
};

const signed = {
  kind: 'signed_package',
  packageDigest: 'a'.repeat(64),
  processorId: 'processor.build',
  version: '1.2.3',
  signer: 'vibespace',
  verificationId: 'verification-1',
};
const verifySigned = () => signed;

describe('Context processor safety', () => {
  it('accepts a verified signed manifest with exact permissions and starts disabled', () => {
    const state = reviewContextProcessorInstall(
      manifest,
      signed.packageDigest,
      verifySigned,
      'owner-1',
      100,
    );
    expect(state).toMatchObject({
      schemaVersion: 1,
      manifest,
      trust: signed,
      enabled: false,
      auditLog: [{ action: 'install_reviewed', actor: 'owner-1', occurredAt: 100 }],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.manifest.permissions)).toBe(true);
    expect(Object.isFrozen(state.auditLog)).toBe(true);
  });

  it('accepts a reviewed local install and rejects absent or unverified trust', () => {
    expect(
      reviewContextProcessorInstall(
        { ...manifest, id: 'processor.local', engine: 'declarative' },
        signed.packageDigest,
        ({ manifest: reviewed, packageDigest }) => ({
          kind: 'reviewed_local_install',
          packageDigest,
          processorId: reviewed.id,
          version: reviewed.version,
          reviewId: 'review-1',
          reviewedBy: 'owner-1',
        }),
        'owner-1',
        100,
      ).trust,
    ).toEqual({
      kind: 'reviewed_local_install',
      packageDigest: signed.packageDigest,
      processorId: 'processor.local',
      version: '1.2.3',
      reviewId: 'review-1',
      reviewedBy: 'owner-1',
    });
    expect(() =>
      reviewContextProcessorInstall(
        manifest,
        signed.packageDigest,
        () => ({ ...signed, packageDigest: 'b'.repeat(64) }),
        'owner-1',
        100,
      ),
    ).toThrow(/package-bound verified signature/i);
    expect(() =>
      reviewContextProcessorInstall(manifest, signed.packageDigest, () => ({}), 'owner-1', 100),
    ).toThrow(/signed package or reviewed local install/i);
  });

  it('requires isolation, semantic versions, closed permissions, and non-JavaScript engines', () => {
    expect(() =>
      reviewContextProcessorInstall(
        { ...manifest, engine: 'javascript' },
        signed.packageDigest,
        verifySigned,
        'owner-1',
        100,
      ),
    ).toThrow(/JavaScript execution/i);
    expect(() =>
      reviewContextProcessorInstall(
        { ...manifest, isolation: 'none' },
        signed.packageDigest,
        verifySigned,
        'owner-1',
        100,
      ),
    ).toThrow(/isolation/i);
    expect(() =>
      reviewContextProcessorInstall(
        { ...manifest, version: 'latest' },
        signed.packageDigest,
        verifySigned,
        'owner-1',
        100,
      ),
    ).toThrow(/version/i);
    expect(() =>
      reviewContextProcessorInstall(
        { ...manifest, version: '1.2.3-01' },
        signed.packageDigest,
        verifySigned,
        'owner-1',
        100,
      ),
    ).toThrow(/version/i);
    expect(
      reviewContextProcessorInstall(
        { ...manifest, version: '1.2.3-beta.1+build.7' },
        signed.packageDigest,
        ({ manifest: reviewed, packageDigest }) => ({
          ...signed,
          packageDigest,
          processorId: reviewed.id,
          version: reviewed.version,
        }),
        'owner-1',
        100,
      ).manifest.version,
    ).toBe('1.2.3-beta.1+build.7');
    expect(() =>
      reviewContextProcessorInstall(
        {
          ...manifest,
          permissions: { ...manifest.permissions, canExecuteTerminal: true },
        },
        signed.packageDigest,
        verifySigned,
        'owner-1',
        100,
      ),
    ).toThrow(/declared permissions/i);
  });

  it('audits enable, allow, deny, and disable decisions without expanding scope', () => {
    const installed = reviewContextProcessorInstall(
      manifest,
      signed.packageDigest,
      verifySigned,
      'owner-1',
      100,
    );
    expect(() =>
      setContextProcessorEnabled(installed, 'false' as unknown as boolean, 'owner-1', 100),
    ).toThrow(/enabled state/i);
    const disabledDecision = authorizeContextProcessorCapability(
      installed,
      'canReadContext',
      'runtime-1',
      101,
    );
    expect(disabledDecision).toMatchObject({
      allowed: false,
      reason: 'Processor is disabled.',
      state: { auditLog: [expect.anything(), { action: 'execution_denied' }] },
    });
    const enabled = setContextProcessorEnabled(installed, true, 'owner-1', 102);
    const allowed = authorizeContextProcessorCapability(
      enabled,
      'canReadContext',
      'runtime-1',
      103,
    );
    expect(allowed).toMatchObject({
      allowed: true,
      state: {
        auditLog: [expect.anything(), { action: 'enabled' }, { action: 'execution_allowed' }],
      },
    });
    const denied = authorizeContextProcessorCapability(
      allowed.state,
      'canUpdateProperties',
      'runtime-1',
      104,
    );
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'Capability was not declared.',
      state: {
        auditLog: [
          expect.anything(),
          expect.anything(),
          expect.anything(),
          { action: 'execution_denied' },
        ],
      },
    });
    expect(setContextProcessorEnabled(denied.state, false, 'owner-1', 105)).toMatchObject({
      enabled: false,
      auditLog: [
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { action: 'disabled' },
      ],
    });

    const forged = {
      ...installed,
      enabled: true,
      manifest: {
        ...installed.manifest,
        engine: 'javascript',
        isolation: 'none',
        permissions: { ...installed.manifest.permissions, canUpdateProperties: true },
      },
    };
    expect(() =>
      authorizeContextProcessorCapability(forged as never, 'canUpdateProperties', 'runtime-1', 106),
    ).toThrow(/unreviewed processor state/i);
    const hostile = new Proxy({} as never, {
      get() {
        throw new Error('must not be read');
      },
    });
    expect(() =>
      authorizeContextProcessorCapability(hostile, 'canReadContext', 'runtime-1', 107),
    ).toThrow(/unreviewed processor state/i);
  });

  it('parses untrusted Markdown as passive data and rejects executable package fields/accessors', () => {
    const passive = parsePassiveContextPackage({
      schemaVersion: 1,
      kind: 'context_package',
      documents: [{ id: 'note-1', markdown: '<script>globalThis.pwned = true</script>' }],
    });
    expect(passive).toEqual({
      schemaVersion: 1,
      kind: 'context_package',
      executable: false,
      documents: [{ id: 'note-1', markdown: '<script>globalThis.pwned = true</script>' }],
    });
    expect(() =>
      parsePassiveContextPackage({
        schemaVersion: 1,
        kind: 'context_package',
        documents: [],
        javascript: 'alert(1)',
      }),
    ).toThrow(/package fields/i);

    const getter = vi.fn(() => []);
    const hostile = { schemaVersion: 1, kind: 'context_package' };
    Object.defineProperty(hostile, 'documents', { enumerable: true, get: getter });
    expect(() => parsePassiveContextPackage(hostile)).toThrow(/boundary/i);
    expect(getter).not.toHaveBeenCalled();
  });
});
