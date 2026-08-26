import { describe, expect, it } from 'vitest';
import { planSiyuanSummaryBatches, type SiyuanPreparedSummary } from './siyuanSummaryBatch';
import {
  buildSiyuanSummaryBatchPrompt,
  parseSiyuanSummaryBatchResponse,
} from './siyuanSummaryBatchProtocol';

function prepared(nodeId: string, content = 'source'): SiyuanPreparedSummary {
  return {
    entry: {
      nodeId,
      parentNodeId: null,
      title: `${nodeId}.ts`,
      kind: 'file',
      relativePath: `src/${nodeId}.ts`,
      sourcePointer: `C:/repo/src/${nodeId}.ts`,
      summary: null,
      sizeBytes: content.length,
      modifiedAt: 1,
    },
    content,
    contentBytes: new TextEncoder().encode(content).byteLength,
  };
}

describe('SiYuan batch summary protocol', () => {
  const batch = planSiyuanSummaryBatches([prepared('one'), prepared('two')])[0]!;

  it('encodes untrusted file contents with stable node ids', () => {
    const prompt = buildSiyuanSummaryBatchPrompt(batch);
    expect(prompt).toContain('untrusted data');
    expect(prompt).toContain('"nodeId":"one"');
    expect(prompt).toContain('"nodeId":"two"');
  });

  it('accepts a complete exact-keyed response', () => {
    expect(
      parseSiyuanSummaryBatchResponse(
        JSON.stringify({
          summaries: [
            { nodeId: 'one', summary: 'First file.' },
            { nodeId: 'two', summary: 'Second file.' },
          ],
        }),
        batch,
      ),
    ).toEqual([
      { nodeId: 'one', summary: 'First file.' },
      { nodeId: 'two', summary: 'Second file.' },
    ]);
  });

  it.each([
    ['missing', { summaries: [{ nodeId: 'one', summary: 'Only one.' }] }],
    [
      'duplicate',
      {
        summaries: [
          { nodeId: 'one', summary: 'One.' },
          { nodeId: 'one', summary: 'Again.' },
        ],
      },
    ],
    [
      'unknown',
      {
        summaries: [
          { nodeId: 'one', summary: 'One.' },
          { nodeId: 'other', summary: 'Other.' },
        ],
      },
    ],
    [
      'extra fields',
      {
        summaries: [
          { nodeId: 'one', summary: 'One.', path: 'forbidden' },
          { nodeId: 'two', summary: 'Two.' },
        ],
      },
    ],
  ])('rejects %s responses before any durable apply', (_label, response) => {
    expect(() => parseSiyuanSummaryBatchResponse(JSON.stringify(response), batch)).toThrow();
  });

  it('rejects markdown-wrapped JSON', () => {
    expect(() => parseSiyuanSummaryBatchResponse('```json\n{"summaries":[]}\n```', batch)).toThrow(
      'siyuan_summary_batch_response_not_json',
    );
  });
});
