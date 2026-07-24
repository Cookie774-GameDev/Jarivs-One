import { describe, expect, it } from 'vitest';
import { restoreJarvisStructuredRegions, tokenizeJarvisResponse } from './tokenizer';

describe('tokenizeJarvisResponse', () => {
  it('round-trips valid structured regions byte-for-byte', () => {
    const text = [
      'Opening prose.',
      '```ts',
      'const answer = 42;',
      '```',
      '```action',
      '{"id":"nav.chat","params":{}}',
      '```',
      '| Name | State |',
      '| --- | --- |',
      '| Jarvis | ready |',
      '> exact quoted evidence',
      'See [the source](https://example.test/docs) and https://example.test/raw.',
    ].join('\n');

    const tokenized = tokenizeJarvisResponse(text);

    expect(tokenized.regions.map((region) => region.kind)).toEqual([
      'code_fence',
      'action',
      'table',
      'quoted_text',
      'citation',
      'url',
    ]);
    expect(tokenized.regions.every((region) => region.valid)).toBe(true);
    expect(restoreJarvisStructuredRegions(tokenized.proseWithPlaceholders, tokenized.regions)).toBe(
      text,
    );
  });

  it.each([
    ['action', '```action\n{"id":\n```', 'invalid_json'],
    ['action', '```action\n{"id":"nav.chat","params":[]}\n```', 'invalid_shape'],
    ['plan', '```jarvis_plan\n{}\n```', 'invalid_shape'],
    ['plan', '```jarvis_plan\n{"steps":[{}]}\n```', 'invalid_shape'],
    ['question', '```jarvis_question\n{"questions":[]}\n```', 'invalid_shape'],
    ['question', '```jarvis_question\n{"questions":[{}]}\n```', 'invalid_shape'],
    ['permission', '```jarvis_permission\n{"title":"Only"}\n```', 'invalid_shape'],
  ] as const)('preserves malformed %s bytes but marks them non-executable', (kind, bytes, code) => {
    const tokenized = tokenizeJarvisResponse(`Before\n${bytes}\nAfter`);
    const region = tokenized.regions[0];

    expect(region).toMatchObject({ kind, bytes, valid: false, errorCode: code });
    expect(restoreJarvisStructuredRegions(tokenized.proseWithPlaceholders, tokenized.regions)).toBe(
      `Before\n${bytes}\nAfter`,
    );
  });

  it('captures an unclosed fence exactly and marks it invalid', () => {
    const bytes = '```action\n{"id":"nav.chat"}';
    const tokenized = tokenizeJarvisResponse(bytes);

    expect(tokenized.regions).toEqual([
      expect.objectContaining({
        index: 0,
        kind: 'action',
        bytes,
        valid: false,
        errorCode: 'unclosed_fence',
      }),
    ]);
  });

  it.each([
    '[root](/docs/output)',
    '[protocol](//example.test/output)',
    '[dot](./output)',
    '[parent](../output)',
    '[fragment](#output)',
    '[internal](jarvis:output)',
    '[custom](custom:payload)',
  ])('round-trips non-HTTP Markdown link %s as a citation region', (link) => {
    const text = `Before ${link} after.`;
    const tokenized = tokenizeJarvisResponse(text);

    expect(tokenized.regions).toEqual([
      expect.objectContaining({ kind: 'citation', bytes: link, valid: true }),
    ]);
    expect(restoreJarvisStructuredRegions(tokenized.proseWithPlaceholders, tokenized.regions)).toBe(
      text,
    );
  });

  it('round-trips verified URL parentheses and a Markdown title byte-for-byte', () => {
    const url = 'https://example.test/report_(final).pdf';
    const markdown = `[report](${url} "Final report")`;
    const text = `${markdown}\n${url}`;
    const tokenized = tokenizeJarvisResponse(text);

    expect(tokenized.regions.map(({ kind, bytes }) => ({ kind, bytes }))).toEqual([
      { kind: 'citation', bytes: markdown },
      { kind: 'url', bytes: url },
    ]);
    expect(restoreJarvisStructuredRegions(tokenized.proseWithPlaceholders, tokenized.regions)).toBe(
      text,
    );
  });

  it.each(['[download][result]', '[result][]', '[result]'])(
    'round-trips reference-style Markdown usage %s and its definition',
    (usage) => {
      const definition = '[result]: //example.test/output "Result"';
      const text = `${usage}\n\n${definition}`;
      const tokenized = tokenizeJarvisResponse(text);

      expect(tokenized.regions.map(({ kind, bytes }) => ({ kind, bytes }))).toEqual([
        { kind: 'citation', bytes: usage },
        { kind: 'citation', bytes: definition },
      ]);
      expect(
        restoreJarvisStructuredRegions(tokenized.proseWithPlaceholders, tokenized.regions),
      ).toBe(text);
    },
  );
});
