const SAFE_CORPUS_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/u;

/**
 * Addressable corpus size, not a model prompt-window claim. The bound is kept
 * deliberately above the product target while remaining practical to validate,
 * partition, serialize, and compare without lossy JavaScript numbers.
 */
export const MAX_ADDRESSABLE_CORPUS_TOKENS = 1_000_000_000_000_000n;

export interface CorpusScaleMetadata {
  corpusId: string;
  totalTokens: bigint;
  indexedTokens: bigint;
  chunkCount: bigint;
  shardCount: bigint;
  contentDigest: `sha256:${string}`;
  generatedAt: number;
}

export interface SerializedCorpusScaleMetadata {
  version: 1;
  corpusId: string;
  totalTokens: string;
  indexedTokens: string;
  chunkCount: string;
  shardCount: string;
  contentDigest: `sha256:${string}`;
  generatedAt: number;
}

export type CorpusTokenCountInput = bigint | number | string;

export class CorpusScaleError extends Error {
  constructor(readonly detail: string) {
    super(`invalid_corpus_scale_metadata:${detail}`);
    this.name = 'CorpusScaleError';
  }
}

export function parseCorpusTokenCount(value: CorpusTokenCountInput, field = 'token_count'): bigint {
  let parsed: bigint;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new CorpusScaleError(field);
    parsed = BigInt(value);
  } else if (typeof value === 'string' && CANONICAL_DECIMAL.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new CorpusScaleError(field);
  }
  if (parsed < 0n || parsed > MAX_ADDRESSABLE_CORPUS_TOKENS) {
    throw new CorpusScaleError(field);
  }
  return parsed;
}

function count(value: CorpusTokenCountInput, field: string): bigint {
  return parseCorpusTokenCount(value, field);
}

function safeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

export function createCorpusScaleMetadata(input: {
  corpusId: string;
  totalTokens: CorpusTokenCountInput;
  indexedTokens: CorpusTokenCountInput;
  chunkCount: CorpusTokenCountInput;
  shardCount: CorpusTokenCountInput;
  contentDigest: string;
  generatedAt: number;
}): Readonly<CorpusScaleMetadata> {
  if (!SAFE_CORPUS_ID.test(input.corpusId)) throw new CorpusScaleError('corpus_id');
  if (!SHA256_DIGEST.test(input.contentDigest)) throw new CorpusScaleError('content_digest');
  if (!safeTimestamp(input.generatedAt)) throw new CorpusScaleError('generated_at');
  const totalTokens = count(input.totalTokens, 'total_tokens');
  const indexedTokens = count(input.indexedTokens, 'indexed_tokens');
  const chunkCount = count(input.chunkCount, 'chunk_count');
  const shardCount = count(input.shardCount, 'shard_count');
  if (indexedTokens > totalTokens) throw new CorpusScaleError('indexed_tokens_exceed_total');
  if (indexedTokens > 0n && (chunkCount === 0n || shardCount === 0n)) {
    throw new CorpusScaleError('indexed_corpus_requires_chunks_and_shards');
  }
  if (indexedTokens === 0n && (chunkCount !== 0n || shardCount !== 0n)) {
    throw new CorpusScaleError('empty_index_has_counts');
  }
  return Object.freeze({
    corpusId: input.corpusId,
    totalTokens,
    indexedTokens,
    chunkCount,
    shardCount,
    contentDigest: input.contentDigest as `sha256:${string}`,
    generatedAt: input.generatedAt,
  });
}

export function serializeCorpusScaleMetadata(
  metadata: Readonly<CorpusScaleMetadata>,
): Readonly<SerializedCorpusScaleMetadata> {
  const validated = createCorpusScaleMetadata(metadata);
  return Object.freeze({
    version: 1,
    corpusId: validated.corpusId,
    totalTokens: validated.totalTokens.toString(10),
    indexedTokens: validated.indexedTokens.toString(10),
    chunkCount: validated.chunkCount.toString(10),
    shardCount: validated.shardCount.toString(10),
    contentDigest: validated.contentDigest,
    generatedAt: validated.generatedAt,
  });
}

export function parseSerializedCorpusScaleMetadata(
  value: Readonly<SerializedCorpusScaleMetadata>,
): Readonly<CorpusScaleMetadata> {
  if (value.version !== 1) throw new CorpusScaleError('version');
  return createCorpusScaleMetadata(value);
}
