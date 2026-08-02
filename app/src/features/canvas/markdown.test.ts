import { describe, expect, it } from 'vitest';
import {
  CanvasValidationError,
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  withPageOrder,
  type CanvasBlockContent,
} from './contracts';
import {
  CANVAS_MARKDOWN_MAX_BLOCKS,
  CANVAS_MARKDOWN_MAX_SOURCE_LENGTH,
  exportBlockContentsToMarkdown,
  exportCanvasBlocksToMarkdown,
  exportCanvasDocumentToMarkdown,
  parseMarkdownToBlockContents,
} from './markdown';

const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;
const BSLASH = String.fromCharCode(92);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const BIDI_RLO = String.fromCharCode(0x202e);
const T0 = 1_750_000_000_000;
const T1 = T0 + 60_000;

function fenced(lang: string, body: string): string {
  return FENCE + lang + LF + body + LF + FENCE;
}

function expectCode(fn: () => unknown, code: string): void {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    expect(error).toBeInstanceOf(CanvasValidationError);
    expect((error as CanvasValidationError).code).toBe(code);
  }
  if (!threw) {
    throw new Error('expected CanvasValidationError with code ' + code);
  }
}

describe('parseMarkdownToBlockContents', () => {
  it('parses an empty string into no blocks', () => {
    expect(parseMarkdownToBlockContents('')).toEqual([]);
    expect(parseMarkdownToBlockContents('   ' + LF + LF)).toEqual([]);
  });

  it('parses ATX headings at levels 1 through 6', () => {
    const md =
      '# One' +
      LF +
      LF +
      '## Two' +
      LF +
      LF +
      '### Three' +
      LF +
      LF +
      '#### Four' +
      LF +
      LF +
      '##### Five' +
      LF +
      LF +
      '###### Six';
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'heading', level: 1, text: 'One' },
      { kind: 'heading', level: 2, text: 'Two' },
      { kind: 'heading', level: 3, text: 'Three' },
      { kind: 'heading', level: 4, text: 'Four' },
      { kind: 'heading', level: 5, text: 'Five' },
      { kind: 'heading', level: 6, text: 'Six' },
    ]);
  });

  it('treats a bare hash run as an empty heading', () => {
    expect(parseMarkdownToBlockContents('###')).toEqual([{ kind: 'heading', level: 3, text: '' }]);
  });

  it('trims heading text and keeps a single line', () => {
    expect(parseMarkdownToBlockContents('##   Spaced title   ')).toEqual([
      { kind: 'heading', level: 2, text: 'Spaced title' },
    ]);
  });

  it('treats seven hashes and missing space as paragraph text', () => {
    expect(parseMarkdownToBlockContents('####### too deep')).toEqual([
      { kind: 'text', text: '####### too deep' },
    ]);
    expect(parseMarkdownToBlockContents('#nospace')).toEqual([{ kind: 'text', text: '#nospace' }]);
  });

  it('joins consecutive paragraph lines into one text block', () => {
    const md = 'first line' + LF + 'second line' + LF + LF + 'another paragraph';
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'text', text: 'first line' + LF + 'second line' },
      { kind: 'text', text: 'another paragraph' },
    ]);
  });

  it('parses blockquotes into note blocks', () => {
    const md = '> quoted one' + LF + '> quoted two' + LF + LF + 'plain';
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'note', text: 'quoted one' + LF + 'quoted two' },
      { kind: 'text', text: 'plain' },
    ]);
  });

  it('keeps an empty blockquote line as an internal note newline', () => {
    const md = '> a' + LF + '>' + LF + '> b';
    expect(parseMarkdownToBlockContents(md)).toEqual([{ kind: 'note', text: 'a' + LF + LF + 'b' }]);
  });

  it('strips only one blockquote marker level', () => {
    expect(parseMarkdownToBlockContents('> > nested')).toEqual([
      { kind: 'note', text: '> nested' },
    ]);
  });

  it('parses a fenced code block with its language', () => {
    const md = fenced('ts', 'const answer = 42;');
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'code', language: 'ts', text: 'const answer = 42;' },
    ]);
  });

  it('defaults an empty fence language to text', () => {
    const md = FENCE + LF + 'no language' + LF + FENCE;
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'code', language: 'text', text: 'no language' },
    ]);
  });

  it('preserves multi-line code order and blank lines verbatim', () => {
    const body = 'line one' + LF + LF + 'line three';
    const md = fenced('python', body);
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'code', language: 'python', text: body },
    ]);
  });

  it('does not close a fence on a shorter backtick run inside the body', () => {
    const longer = BT + BT + BT + BT;
    const body = 'before' + LF + FENCE + 'inner' + LF + 'after';
    const md = longer + 'js' + LF + body + LF + longer;
    expect(parseMarkdownToBlockContents(md)).toEqual([
      { kind: 'code', language: 'js', text: body },
    ]);
  });

  it('preserves document order across mixed block kinds', () => {
    const md =
      '# Title' +
      LF +
      LF +
      'intro paragraph' +
      LF +
      LF +
      '> a note' +
      LF +
      LF +
      fenced('js', 'x()') +
      LF +
      LF +
      'closing paragraph';
    const blocks = parseMarkdownToBlockContents(md);
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'text', 'note', 'code', 'text']);
  });

  it('normalizes CRLF and lone CR line endings to LF', () => {
    expect(parseMarkdownToBlockContents('a' + CR + LF + 'b' + CR + 'c')).toEqual([
      { kind: 'text', text: 'a' + LF + 'b' + LF + 'c' },
    ]);
    expect(parseMarkdownToBlockContents('x' + CR + LF + CR + LF + 'y')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'text', text: 'y' },
    ]);
  });

  it('treats a leading backslash as an escape so sigils stay text', () => {
    expect(parseMarkdownToBlockContents(BSLASH + '# not a heading')).toEqual([
      { kind: 'text', text: '# not a heading' },
    ]);
    expect(parseMarkdownToBlockContents(BSLASH + '> not a note')).toEqual([
      { kind: 'text', text: '> not a note' },
    ]);
    expect(parseMarkdownToBlockContents(BSLASH)).toEqual([{ kind: 'text', text: '' }]);
  });

  it('returns a frozen array of frozen blocks', () => {
    const blocks = parseMarkdownToBlockContents('# hi');
    expect(Object.isFrozen(blocks)).toBe(true);
    expect(Object.isFrozen(blocks[0])).toBe(true);
  });
});

describe('exportBlockContentsToMarkdown', () => {
  it('emits an empty array as an empty string', () => {
    expect(exportBlockContentsToMarkdown([])).toBe('');
  });

  it('emits headings with the right hash count and no trailing space when empty', () => {
    expect(exportBlockContentsToMarkdown([{ kind: 'heading', level: 2, text: 'Hi' }])).toBe(
      '## Hi',
    );
    expect(exportBlockContentsToMarkdown([{ kind: 'heading', level: 4, text: '' }])).toBe('####');
  });

  it('escapes text lines that would otherwise parse as other blocks', () => {
    expect(exportBlockContentsToMarkdown([{ kind: 'text', text: '# hash' }])).toBe(
      BSLASH + '# hash',
    );
    expect(exportBlockContentsToMarkdown([{ kind: 'text', text: '> quote' }])).toBe(
      BSLASH + '> quote',
    );
    expect(exportBlockContentsToMarkdown([{ kind: 'text', text: FENCE + 'js' }])).toBe(
      BSLASH + FENCE + 'js',
    );
    expect(exportBlockContentsToMarkdown([{ kind: 'text', text: BSLASH + 'path' }])).toBe(
      BSLASH + BSLASH + 'path',
    );
    expect(exportBlockContentsToMarkdown([{ kind: 'text', text: '' }])).toBe(BSLASH);
    expect(exportBlockContentsToMarkdown([{ kind: 'text', text: '   ' }])).toBe(BSLASH + '   ');
  });

  it('emits note lines with one blockquote marker and a bare marker for blanks', () => {
    expect(exportBlockContentsToMarkdown([{ kind: 'note', text: 'a' + LF + LF + 'b' }])).toBe(
      '> a' + LF + '>' + LF + '> b',
    );
  });

  it('chooses a longer fence when the code body contains backticks', () => {
    const four = BT + BT + BT + BT;
    const five = BT + BT + BT + BT + BT;
    const out = exportBlockContentsToMarkdown([{ kind: 'code', language: 'js', text: four }]);
    expect(out).toBe(five + 'js' + LF + four + LF + five);
  });

  it('emits an empty code body as adjacent fences', () => {
    expect(exportBlockContentsToMarkdown([{ kind: 'code', language: 'text', text: '' }])).toBe(
      FENCE + 'text' + LF + FENCE,
    );
  });

  it('separates blocks with a blank line', () => {
    const out = exportBlockContentsToMarkdown([
      { kind: 'heading', level: 1, text: 'A' },
      { kind: 'text', text: 'b' },
    ]);
    expect(out).toBe('# A' + LF + LF + 'b');
  });
});

describe('round-trip and determinism', () => {
  const rich: CanvasBlockContent[] = [
    { kind: 'heading', level: 1, text: 'Title' },
    { kind: 'heading', level: 3, text: '' },
    { kind: 'text', text: 'plain paragraph' },
    { kind: 'text', text: 'multi' + LF + 'line' + LF + 'paragraph' },
    { kind: 'text', text: '# looks like heading' },
    { kind: 'text', text: '> looks like quote' },
    { kind: 'text', text: FENCE + ' looks like fence' },
    { kind: 'text', text: BSLASH + ' leading backslash' },
    { kind: 'text', text: 'blank' + LF + LF + 'inside' },
    { kind: 'text', text: '' },
    { kind: 'text', text: '   ' },
    { kind: 'note', text: 'a note' },
    { kind: 'note', text: 'note' + LF + LF + 'with blank' },
    { kind: 'note', text: '> nested marker' },
    { kind: 'code', language: 'js', text: 'const x = 1;' },
    { kind: 'code', language: 'text', text: '' },
    { kind: 'code', language: 'c++', text: 'int main() {}' + LF + FENCE + 'not a fence' },
    { kind: 'code', language: 'python', text: BT + BT + BT + BT },
  ];

  it('export then import is the identity for canonical blocks', () => {
    const exported = exportBlockContentsToMarkdown(rich);
    expect(parseMarkdownToBlockContents(exported)).toEqual(rich);
  });

  it('import then export then import is a fixed point', () => {
    const md =
      '# Heading' +
      LF +
      LF +
      'paragraph one' +
      LF +
      LF +
      '> note line' +
      LF +
      LF +
      fenced('rust', 'fn main() {}') +
      LF +
      LF +
      BSLASH +
      '# escaped text';
    const once = parseMarkdownToBlockContents(md);
    const twice = parseMarkdownToBlockContents(exportBlockContentsToMarkdown(once));
    expect(twice).toEqual(once);
  });

  it('exports deterministically for structurally equal inputs', () => {
    const a: CanvasBlockContent[] = [
      { kind: 'heading', level: 2, text: 'H' },
      { kind: 'code', language: 'js', text: 'y()' },
    ];
    const b: CanvasBlockContent[] = a.map((block) => ({ ...block }));
    expect(exportBlockContentsToMarkdown(a)).toBe(exportBlockContentsToMarkdown(b));
  });
});

describe('security: inert HTML and script content', () => {
  it('treats a script tag as inert literal text', () => {
    const input = '<script>alert(1)</script>';
    expect(parseMarkdownToBlockContents(input)).toEqual([{ kind: 'text', text: input }]);
  });

  it('treats an img onerror payload as inert literal text', () => {
    const input = '<img src=x onerror=alert(1)>';
    expect(parseMarkdownToBlockContents(input)).toEqual([{ kind: 'text', text: input }]);
  });

  it('keeps HTML inside a heading as literal text', () => {
    expect(parseMarkdownToBlockContents('# <b>bold</b>')).toEqual([
      { kind: 'heading', level: 1, text: '<b>bold</b>' },
    ]);
  });

  it('keeps an HTML comment as literal text', () => {
    const input = '<!-- secret -->';
    expect(parseMarkdownToBlockContents(input)).toEqual([{ kind: 'text', text: input }]);
  });

  it('keeps script content inside a code fence as literal text', () => {
    const body = '<script>steal()</script>';
    expect(parseMarkdownToBlockContents(fenced('html', body))).toEqual([
      { kind: 'code', language: 'html', text: body },
    ]);
  });

  it('round-trips hostile content without interpreting it', () => {
    const hostile: CanvasBlockContent[] = [
      { kind: 'text', text: '<script>alert(1)</script>' },
      { kind: 'code', language: 'html', text: '<iframe src=javascript:alert(1)></iframe>' },
    ];
    expect(parseMarkdownToBlockContents(exportBlockContentsToMarkdown(hostile))).toEqual(hostile);
  });
});

describe('typed failures', () => {
  it('rejects non-string input', () => {
    expectCode(() => parseMarkdownToBlockContents(42 as unknown as string), 'invalid-type');
    expectCode(() => parseMarkdownToBlockContents(null as unknown as string), 'invalid-type');
    expectCode(() => parseMarkdownToBlockContents({} as unknown as string), 'invalid-type');
  });

  it('rejects an oversized source document', () => {
    const huge = 'x'.repeat(CANVAS_MARKDOWN_MAX_SOURCE_LENGTH + 1);
    expectCode(() => parseMarkdownToBlockContents(huge), 'unsupported-value');
  });

  it('rejects too many blocks on import', () => {
    const huge = ('x' + LF + LF).repeat(CANVAS_MARKDOWN_MAX_BLOCKS + 1);
    expectCode(() => parseMarkdownToBlockContents(huge), 'unsupported-value');
  });

  it('rejects too many blocks on export', () => {
    const huge = Array.from({ length: CANVAS_MARKDOWN_MAX_BLOCKS + 1 }, () => ({
      kind: 'text' as const,
      text: 'x',
    }));
    expectCode(() => exportBlockContentsToMarkdown(huge), 'unsupported-value');
  });

  it('rejects an oversized code body', () => {
    const md = fenced('text', 'x'.repeat(100_001));
    expectCode(() => parseMarkdownToBlockContents(md), 'unsupported-value');
  });

  it('rejects an oversized paragraph', () => {
    expectCode(() => parseMarkdownToBlockContents('x'.repeat(100_001)), 'unsupported-value');
  });

  it('rejects an unclosed code fence', () => {
    expectCode(
      () => parseMarkdownToBlockContents(FENCE + 'js' + LF + 'never closed'),
      'unsupported-value',
    );
  });

  it('rejects a hostile fence info string containing a backtick', () => {
    const md = FENCE + 'js' + BT + 'evil' + LF + 'x' + LF + FENCE;
    expectCode(() => parseMarkdownToBlockContents(md), 'unsupported-value');
  });

  it('rejects a hostile fence info string containing attributes', () => {
    const md = FENCE + 'js onload=alert(1)' + LF + 'x' + LF + FENCE;
    expectCode(() => parseMarkdownToBlockContents(md), 'unsupported-value');
  });

  it('rejects control characters', () => {
    expectCode(() => parseMarkdownToBlockContents('hello' + NUL + 'world'), 'unsupported-value');
  });

  it('rejects bidi override characters', () => {
    expectCode(
      () => parseMarkdownToBlockContents('hello' + BIDI_RLO + 'world'),
      'unsupported-value',
    );
  });

  it('rejects control and bidi characters during export', () => {
    expectCode(
      () => exportBlockContentsToMarkdown([{ kind: 'text', text: 'hello' + NUL + 'world' }]),
      'unsupported-value',
    );
    expectCode(
      () => exportBlockContentsToMarkdown([{ kind: 'note', text: 'hello' + BIDI_RLO + 'world' }]),
      'unsupported-value',
    );
  });

  it('rejects a non-array export input', () => {
    expectCode(
      () => exportBlockContentsToMarkdown('nope' as unknown as CanvasBlockContent[]),
      'invalid-type',
    );
  });

  it('rejects a heading containing a newline on export', () => {
    expectCode(
      () => exportBlockContentsToMarkdown([{ kind: 'heading', level: 1, text: 'a' + LF + 'b' }]),
      'unsupported-value',
    );
  });

  it('rejects an unsupported code language on export', () => {
    expectCode(
      () => exportBlockContentsToMarkdown([{ kind: 'code', language: 'bad lang', text: 'x' }]),
      'unsupported-value',
    );
    expectCode(
      () => exportBlockContentsToMarkdown([{ kind: 'code', language: 'js' + BT, text: 'x' }]),
      'unsupported-value',
    );
  });
});

describe('canvas block and document exporters', () => {
  it('projects canvas block content in array order', () => {
    const b1 = createCanvasBlock({
      id: 'b1',
      content: { kind: 'heading', level: 1, text: 'First' },
      now: T0,
    });
    const b2 = createCanvasBlock({ id: 'b2', content: { kind: 'text', text: 'Second' }, now: T0 });
    expect(exportCanvasBlocksToMarkdown([b1, b2])).toBe('# First' + LF + LF + 'Second');
  });

  it('honors deterministic page order for a document', () => {
    const b1 = createCanvasBlock({
      id: 'b1',
      content: { kind: 'heading', level: 1, text: 'First' },
      now: T0,
    });
    const b2 = createCanvasBlock({ id: 'b2', content: { kind: 'text', text: 'Second' }, now: T0 });
    let doc = createCanvasDocument({ id: 'doc1', projectId: 'p1', ownerId: 'o1', now: T0 });
    doc = withBlockAdded(doc, b1, T1);
    doc = withBlockAdded(doc, b2, T1);
    doc = withPageOrder(doc, ['b2', 'b1'], T1);
    expect(exportCanvasDocumentToMarkdown(doc)).toBe('Second' + LF + LF + '# First');
  });
});
