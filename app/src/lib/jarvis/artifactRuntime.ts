import {
  createJarvisArtifactRuntimeInternals,
  type JarvisArtifactRuntimeInternals,
} from './artifactRuntimeInternals';
import {
  createJarvisBoundArtifactPipelineIssuerInternal,
  type CanonicalArtifactEvidenceAuthorities,
  type JarvisArtifactPipeline,
  type JarvisBoundArtifactPipelineIssuer,
} from './artifactProducerAdapters';
import type { JarvisArtifactV1 } from './contracts/execution';

/** @internal Supplied only while the private artifact runtime is in lexical scope. */
type PrivateArtifactCommitVerifier = Readonly<{
  consumeForCommit(input: {
    accountId: string;
    runId: string;
    requestId: string;
    attemptNumber: number;
    artifacts: readonly JarvisArtifactV1[];
  }): void;
}>;

type JarvisArtifactCommitBinder<TCommit> = (input: {
  consumeArtifactsForCommit: PrivateArtifactCommitVerifier['consumeForCommit'];
}) => TCommit;

export type JarvisArtifactKernelComposition<TCommit> = Readonly<{
  issueBoundArtifactPipeline: JarvisBoundArtifactPipelineIssuer;
  commitKernelTurn: TCommit;
}>;

function bindPrivateConsumer(
  internals: JarvisArtifactRuntimeInternals,
): PrivateArtifactCommitVerifier['consumeForCommit'] {
  return (input) =>
    internals.consumePendingForCommit({
      accountId: input.accountId,
      runId: input.runId,
      requestId: input.requestId,
      attemptNumber: input.attemptNumber,
      artifacts: input.artifacts,
    });
}

/**
 * Deep-module composition factory. Omitted from every public barrel and called
 * in production only by the closed kernel runtime.
 */
export function createJarvisArtifactKernelComposition<TCommit>(input: {
  randomUUID: () => string;
  now: () => number;
  authorities: CanonicalArtifactEvidenceAuthorities;
  bindKernelCommit: JarvisArtifactCommitBinder<TCommit>;
}): JarvisArtifactKernelComposition<TCommit> {
  const internals = createJarvisArtifactRuntimeInternals({
    randomUUID: input.randomUUID,
    now: input.now,
  });
  const issueBoundArtifactPipeline: (
    effectClaims: Parameters<JarvisBoundArtifactPipelineIssuer>[0],
  ) => JarvisArtifactPipeline = createJarvisBoundArtifactPipelineIssuerInternal({
    authorities: input.authorities,
    materializeVerified: internals.materializeVerified,
    now: input.now,
  });
  const commitKernelTurn = input.bindKernelCommit({
    consumeArtifactsForCommit: bindPrivateConsumer(internals),
  });
  return Object.freeze({ issueBoundArtifactPipeline, commitKernelTurn });
}
