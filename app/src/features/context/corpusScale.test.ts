import { describe, expect, it } from 'vitest';
import {
  CorpusScaleError,
  MAX_ADDRESSABLE_CORPUS_TOKENS,
  createCorpusScaleMetadata,
  locateCorpusTokenPosition,
  parseCorpusTokenCount,
  parseSerializedCorpusScaleMetadata,
  serializeCorpusScaleMetadata,
} from './corpusScale';

const digest = `sha256:${'a'.repeat(64)}`;

function metadata(totalTokens: bigint) {
  return createCorpusScaleMetadata({
    corpusId: 'vibespace-pr31-addressing',
    totalTokens,
    indexedTokens: totalTokens,
    chunkCount: totalTokens / 2_048n + 1n,
    shardCount: totalTokens / 1_000_000n + 1n,
    contentDigest: digest,
    generatedAt: 1_700_000_000_000,
  });
}

describe('corpus-scale metadata', () => {
  it.each([
    1_000_000_000n,
    10_000_000_000n,
    10_000_000_001n,
    100_000_000_000n,
    9_007_199_254_740_993n,
  ])('round-trips the exact logical token address %s canonically', (tokenCount) => {
    const serialized = serializeCorpusScaleMetadata(metadata(tokenCount));
    expect(serialized.totalTokens).toBe(tokenCount.toString(10));
    expect(parseSerializedCorpusScaleMetadata(serialized).totalTokens).toBe(tokenCount);
  });

  it('rejects overflow, unsafe numbers, negative and non-canonical inputs', () => {
    expect(() => parseCorpusTokenCount(MAX_ADDRESSABLE_CORPUS_TOKENS + 1n)).toThrow(
      CorpusScaleError,
    );
    expect(() => parseCorpusTokenCount(Number.MAX_SAFE_INTEGER + 1)).toThrow(CorpusScaleError);
    expect(() => parseCorpusTokenCount(-1n)).toThrow(CorpusScaleError);
    expect(() => parseCorpusTokenCount('01')).toThrow(CorpusScaleError);
    expect(() => parseCorpusTokenCount('1e10')).toThrow(CorpusScaleError);
  });

  it.each([
    [999_999_999n, '999', '999999'],
    [1_000_000_000n, '1000', '0'],
    [10_000_000_000n, '10000', '0'],
    [10_000_000_001n, '10000', '1'],
    [9_007_199_254_740_993n, '9007199254', '740993'],
  ])(
    'selects the exact deterministic shard and offset for logical position %s',
    (position, shard, offset) => {
      expect(
        locateCorpusTokenPosition(metadata(10_000_000_000_000_000n), position, 1_000_000n),
      ).toEqual({
        position: position.toString(10),
        shard,
        offset,
      });
    },
  );

  it('fails closed when indexed counts contradict the corpus total', () => {
    expect(() =>
      createCorpusScaleMetadata({
        corpusId: 'vibespace-pr31-addressing',
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
