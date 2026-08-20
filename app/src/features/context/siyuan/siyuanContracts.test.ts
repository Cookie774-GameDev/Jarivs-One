import { describe, expect, it } from 'vitest';
import {
  SIYUAN_CONTEXT_VAULT_ENABLED,
  SiyuanContractError,
  assertSiyuanIdentifier,
  assertSiyuanQuery,
  parseSiyuanBlock,
  parseSiyuanSearchResults,
  parseSiyuanStatus,
} from './siyuanContracts';

describe('SiYuan renderer contracts', () => {
  it('keeps the checked-in feature gate disabled', () => {
    expect(SIYUAN_CONTEXT_VAULT_ENABLED).toBe(false);
  });

  it('accepts only the closed status shape', () => {
    expect(
      parseSiyuanStatus({
        featureEnabled: false,
        runtimeBundled: false,
        state: 'disabled',
      }),
    ).toEqual({ featureEnabled: false, runtimeBundled: false, state: 'disabled' });
    expect(() =>
      parseSiyuanStatus({
        featureEnabled: false,
        runtimeBundled: false,
        state: 'disabled',
        token: 'must-never-cross-the-renderer-boundary',
      }),
    ).toThrowError(new SiyuanContractError('siyuan_status_keys_invalid'));
  });

  it('rejects traversal-like identifiers and control-bearing queries', () => {
    expect(() => assertSiyuanIdentifier('../data')).toThrow(/siyuan_identifier_invalid/u);
    expect(() => assertSiyuanQuery('hello\nworld')).toThrow(/siyuan_query_invalid/u);
    expect(assertSiyuanIdentifier('20260820-block_1')).toBe('20260820-block_1');
  });

  it('bounds result counts and rejects extra response fields', () => {
    expect(() =>
      parseSiyuanSearchResults(
        {
          blocks: [
            { id: 'block-1', notebookId: 'notebook-1', path: '/spec', content: 'one' },
            { id: 'block-2', notebookId: 'notebook-1', path: '/spec', content: 'two' },
          ],
        },
        1,
      ),
    ).toThrow(/siyuan_search_results_invalid/u);
    expect(() =>
      parseSiyuanBlock({
        block: {
          id: 'block-1',
          notebookId: 'notebook-1',
          path: '/spec',
          markdown: '# Spec',
          rawSql: 'select * from blocks',
        },
      }),
    ).toThrow(/siyuan_block_keys_invalid/u);
  });
});
