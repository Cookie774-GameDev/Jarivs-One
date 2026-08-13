import { describe, expect, it } from 'vitest';
import {
  CorpusScaleError,
  MAX_ADDRESSABLE_CORPUS_TOKENS,
  createCorpusScaleMetadata,
  parseCorpusTokenCount,
  parseSerializedCorpusScaleMetadata,
  serializeCorpusScaleMetadata,
} from './corpusScale';

const digest = `sha256:${'a'.repeat(64)}`;

function metadata(totalTokens: bigint) {
  return createCorpusScaleMetadata({
    corpusId: 'vibespace-main',
    totalTokens,
    indexedTokens: totalTokens,
    chunkCount: totalTokens / 2_048n + 1n,
    shardCount: totalTokens / 1_000_000n + 1n,
    contentDigest: digest,
    generatedAt: 1_700_000_000_000,
  });
}

describe('corpus-scale metadata', () => {
  it.each([1_000_000n, 10_000_000_000n, 100_000_000_000n])(
    'preserves %s tokens exactly without number precision loss',
    (tokenCount) => {
      const original = metadata(tokenCount);
      const serialized = serializeCorpusScaleMetadata(original);
      expect(serialized.totalTokens).toBe(tokenCount.toString());
      expect(parseSerializedCorpusScaleMetadata(serialized).totalTokens).toBe(tokenCount);
    },
  );

  it('rejects overflow, unsafe numbers, negative and non-canonical inputs', () => {
    expect(() => parseCorpusTokenCount(MAX_ADDRESSABLE_CORPUS_TOKENS + 1n)).toThrow(
      CorpusScaleError,
    );
    expect(() => parseCorpusTokenCount(Number.MAX_SAFE_INTEGER + 1)).toThrow(CorpusScaleError);
    expect(() => parseCorpusTokenCount(-1n)).toThrow(CorpusScaleError);
    expect(() => parseCorpusTokenCount('01')).toThrow(CorpusScaleError);
    expect(() => parseCorpusTokenCount('1e10')).toThrow(CorpusScaleError);
  });

  it('fails closed when indexed counts contradict the corpus total', () => {
    expect(() =>
      createCorpusScaleMetadata({
        corpusId: 'vibespace-main',
        totalTokens: 10n,
        indexedTokens: 11n,
        chunkCount: 1n,
        shardCount: 1n,
        contentDigest: digest,
        generatedAt: 1,
      }),
    ).toThrowError('invalid_corpus_scale_metadata:indexed_tokens_exceed_total');
  });
});
