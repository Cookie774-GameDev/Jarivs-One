import type { JarvisArtifactDraft, JarvisArtifactV1 } from './contracts/execution';
import {
  createArtifactReceiptAuthority,
  type ArtifactPreDigestBinding,
  type ArtifactReceiptBinding,
} from './artifactReceipts';
import {
  canonicalizeArtifactDraftInternal,
  normalizeVerifiedArtifactInternal,
} from './artifactNormalizer';

/** @internal Imported only by artifactRuntime.ts and focused tests. */
export type JarvisArtifactRuntimeInternals = Readonly<{
  materializeVerified(input: {
    binding: Omit<ArtifactPreDigestBinding, 'artifactId'>;
    draft: JarvisArtifactDraft;
  }): Promise<JarvisArtifactV1>;
  consumePendingForCommit(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    artifacts: readonly JarvisArtifactV1[];
  }): void;
}>;

type PendingCommitScope = Readonly<{
  accountId: string;
  runId: string;
  requestId: string;
  attemptNumber: number;
}>;

function stableText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertCommitScope(input: PendingCommitScope): void {
  if (
    !stableText(input.accountId) ||
    !stableText(input.runId) ||
    !stableText(input.requestId) ||
    !Number.isSafeInteger(input.attemptNumber) ||
    input.attemptNumber < 1
  ) {
    throw new Error('artifact_commit_scope_invalid');
  }
}

function sameScope(left: PendingCommitScope, right: PendingCommitScope): boolean {
  return (
    left.accountId === right.accountId &&
    left.runId === right.runId &&
    left.requestId === right.requestId &&
    left.attemptNumber === right.attemptNumber
  );
}

function lockKey(binding: Omit<ArtifactPreDigestBinding, 'artifactId'>): string {
  return JSON.stringify([
    binding.accountId,
    binding.runId,
    binding.requestId,
    binding.attemptNumber,
    binding.producerId,
    binding.resultRef,
  ]);
}

/** @internal Imported only by artifactRuntime.ts and focused tests. */
export function createJarvisArtifactRuntimeInternals(input: {
  randomUUID: () => string;
  now: () => number;
}): JarvisArtifactRuntimeInternals {
  const receipts = createArtifactReceiptAuthority(input);
  const pending = new WeakMap<JarvisArtifactV1, PendingCommitScope>();
  const locks = new Map<string, Promise<void>>();

  async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    locks.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (locks.get(key) === tail) locks.delete(key);
    }
  }

  return Object.freeze({
    async materializeVerified({ binding, draft }) {
      return serialized(lockKey(binding), async () => {
        const uuid = input.randomUUID();
        if (!stableText(uuid)) throw new Error('artifact_id_invalid');
        const preDigest: ArtifactPreDigestBinding = Object.freeze({
          accountId: binding.accountId,
          runId: binding.runId,
          requestId: binding.requestId,
          attemptNumber: binding.attemptNumber,
          artifactId: `jart_${uuid}`,
          producerId: binding.producerId,
          resultRef: binding.resultRef,
          verifiedAt: binding.verifiedAt,
        });
        const material = await canonicalizeArtifactDraftInternal({ binding: preDigest, draft });

        // Deliberately synchronous from this point through pending registration.
        const fullBinding: ArtifactReceiptBinding = Object.freeze({
          ...preDigest,
          artifactDigest: material.artifactDigest,
        });
        const receipt = receipts.issueReceipt(fullBinding);
        const verified = receipts.verifyAndBindReceipt({ receipt, binding: fullBinding });
        if (!verified) throw new Error('artifact_receipt_verification_failed');
        const artifact = normalizeVerifiedArtifactInternal({ binding: verified, material });
        const scope = Object.freeze({
          accountId: binding.accountId,
          runId: binding.runId,
          requestId: binding.requestId,
          attemptNumber: binding.attemptNumber,
        });
        pending.set(artifact, scope);
        return artifact;
      });
    },

    consumePendingForCommit(commit) {
      assertCommitScope(commit);
      if (!Array.isArray(commit.artifacts) || commit.artifacts.length === 0) {
        throw new Error('artifact_commit_empty');
      }
      const unique = new Set(commit.artifacts);
      if (unique.size !== commit.artifacts.length) throw new Error('artifact_commit_duplicate');
      const expectedScope: PendingCommitScope = commit;
      for (const artifact of commit.artifacts) {
        const actualScope = pending.get(artifact);
        if (!actualScope) throw new Error('artifact_commit_not_pending');
        if (!sameScope(actualScope, expectedScope))
          throw new Error('artifact_commit_scope_mismatch');
        if (
          artifact.runId !== commit.runId ||
          artifact.requestId !== commit.requestId ||
          artifact.attemptNumber !== commit.attemptNumber
        ) {
          throw new Error('artifact_commit_scope_mismatch');
        }
      }
      for (const artifact of commit.artifacts) pending.delete(artifact);
    },
  });
}
