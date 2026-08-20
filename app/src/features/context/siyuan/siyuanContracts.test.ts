import { describe, expect, it } from 'vitest';
import {
  SIYUAN_CONTEXT_VAULT_ENABLED,
  SiyuanContractError,
  assertSiyuanDocumentPath,
  assertSiyuanIdentifier,
  assertSiyuanMarkdown,
  assertSiyuanNotebookName,
  assertSiyuanQuery,
  assertSiyuanSnapshotMemo,
  parseSiyuanBlock,
  parseSiyuanDocumentMutation,
  parseSiyuanMutationResult,
  parseSiyuanNotebook,
  parseSiyuanSearchResults,
  parseSiyuanStatus,
} from './siyuanContracts';

describe('SiYuan renderer contracts', () => {
  it('keeps the checked-in verified feature gate enabled', () => {
    expect(SIYUAN_CONTEXT_VAULT_ENABLED).toBe(true);
  });

  it('accepts only the closed status shape', () => {
    expect(
      parseSiyuanStatus({
        featureEnabled: false,
        runtimeBundled: true,
        state: 'disabled',
      }),
    ).toEqual({ featureEnabled: false, runtimeBundled: true, state: 'disabled' });
    expect(() =>
      parseSiyuanStatus({
        featureEnabled: false,
        runtimeBundled: true,
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

  it('bounds managed write paths, UTF-8 content, memos, and response shapes', () => {
    expect(assertSiyuanDocumentPath('/Nightly/Decision')).toBe('/Nightly/Decision');
    expect(() => assertSiyuanDocumentPath('/Nightly/../escape')).toThrow(/siyuan_path_invalid/u);
    expect(assertSiyuanMarkdown('# Local knowledge')).toBe('# Local knowledge');
    expect(() => assertSiyuanMarkdown('🙂'.repeat(300_000))).toThrow(/siyuan_content_invalid/u);
    expect(assertSiyuanSnapshotMemo('Before nightly run')).toBe('Before nightly run');
    expect(assertSiyuanNotebookName('VibeSpace Project Vault')).toBe('VibeSpace Project Vault');
    expect(() => assertSiyuanNotebookName('line\nbreak')).toThrow(/siyuan_notebook_name_invalid/u);
    expect(() => assertSiyuanSnapshotMemo('line\nbreak')).toThrow(/siyuan_content_invalid/u);
    expect(parseSiyuanDocumentMutation({ id: 'document-1' })).toEqual({ id: 'document-1' });
    expect(parseSiyuanMutationResult({ applied: true })).toEqual({ applied: true });
    expect(
      parseSiyuanNotebook({
        notebook: { id: 'notebook-1', name: 'VibeSpace Project Vault', closed: false },
      }),
    ).toEqual({ id: 'notebook-1', name: 'VibeSpace Project Vault', closed: false });
    expect(() => parseSiyuanMutationResult({ applied: true, token: 'forbidden' })).toThrow(
      /siyuan_mutation_response_keys_invalid/u,
    );
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
