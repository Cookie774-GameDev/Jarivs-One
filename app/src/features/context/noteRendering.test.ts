import { describe, expect, it } from 'vitest';
import { compileContextNoteRenderPlan } from './noteRendering';

describe('Context note rendering boundary', () => {
  it('keeps raw HTML, SVG, and imported extensions inert while preserving ordinary text', () => {
    const plan = compileContextNoteRenderPlan(
      [
        '# Safety',
        '<script>[Script docs](https://example.com/script)</script>',
        '<svg>![[Secret SVG Note]]</svg>',
        ':::component [Extension docs](https://example.com/extension)',
        '<CustomMdx>![[Secret MDX Note]]</CustomMdx>',
      ].join('\n'),
    );

    expect(plan).toMatchObject({
      schemaVersion: 1,
      executable: false,
      rawHtml: 'text_only',
      svg: 'text_only',
      importedExtensions: 'text_only',
      links: [],
      embeds: [],
    });
    expect(plan.blocks).toEqual([
      {
        kind: 'text',
        text: [
          '# Safety',
          '<script>[Script docs](https://example.com/script)</script>',
          '<svg>![[Secret SVG Note]]</svg>',
          ':::component [Extension docs](https://example.com/extension)',
          '<CustomMdx>![[Secret MDX Note]]</CustomMdx>',
        ].join('\n'),
      },
    ]);
  });

  it('allowlists active links and internal embeds without activating unsafe schemes', () => {
    const plan = compileContextNoteRenderPlan(
      [
        '[Docs](https://example.com/docs)',
        '[Mail](mailto:security@example.com)',
        '[Bad](javascript:alert(1))',
        '![Image](data:image/svg+xml,<svg onload=alert(1)>)',
        '[Credentials](https://user:password@example.com/private)',
        '[UNC](\\\\server\\share\\secret.md)',
        '![[Authentication Flow#Token Refresh|Auth]]',
        '![[javascript:alert(1)]]',
        '![[\\\\server\\share\\secret.md]]',
      ].join('\n'),
    );

    expect(plan.links).toEqual([
      { label: 'Docs', target: 'https://example.com/docs', image: false, external: true },
      {
        label: 'Mail',
        target: 'mailto:security@example.com',
        image: false,
        external: true,
      },
    ]);
    expect(plan.embeds).toEqual([
      { targetTitle: 'Authentication Flow', heading: 'Token Refresh', alias: 'Auth' },
    ]);
    expect(JSON.stringify({ links: plan.links, embeds: plan.embeds })).not.toMatch(
      /javascript:|data:/iu,
    );
  });

  it('masks multiline HTML and extension regions without suppressing later passive Markdown', () => {
    const plan = compileContextNoteRenderPlan(
      [
        '<div>',
        '[Inside HTML](https://example.com/html)',
        '</div>',
        ':::component',
        '![[Inside Extension]]',
        ':::',
        '<!--',
        '[Inside Comment](https://example.com/comment)',
        '-->',
        '[Outside](https://example.com/outside)',
        '![[Outside Note]]',
      ].join('\n'),
    );

    expect(plan.links).toEqual([
      {
        label: 'Outside',
        target: 'https://example.com/outside',
        image: false,
        external: true,
      },
    ]);
    expect(plan.embeds).toEqual([{ targetTitle: 'Outside Note' }]);
  });

  it('keeps nested and multiline HTML, SVG, MDX, and ESM continuations inert', () => {
    for (const markdown of [
      '<div>\n<div></div>\n![[Nested Escape]]\n</div>',
      'prefix <svg>\n![[Multiline SVG Escape]]\n</svg>',
      '<CustomMdx\n  name="x"\n>\n![[Multiline MDX Escape]]\n</CustomMdx>',
      'export const docs =\n  "[ESM docs](https://example.com/esm)"',
      'export const docs = `\n[Template docs](https://example.com/template)\n`;',
      [
        'export const docs =',
        '  "prefix" +',
        '  "[Binary docs](https://example.com/binary)";',
      ].join('\n'),
      'export const docs = `\n\n[Blank escape](https://example.com/blank)\n`;',
      'export const docs = `\n;\n[Semicolon escape](https://example.com/semicolon)\n`;',
      '<>\n![[Fragment Escape]]\n</>',
    ]) {
      const plan = compileContextNoteRenderPlan(markdown);
      expect(plan.links).toEqual([]);
      expect(plan.embeds).toEqual([]);
    }
  });

  it('turns fenced code into immutable inert text and never interprets nested markup', () => {
    const plan = compileContextNoteRenderPlan(
      [
        'Before',
        '```javascript',
        '<script>globalThis.pwned = true</script>',
        '[Bad](javascript:alert(1))',
        '```',
        'After',
      ].join('\n'),
    );

    expect(plan.blocks).toEqual([
      { kind: 'text', text: 'Before' },
      {
        kind: 'code',
        language: 'javascript',
        text: ['<script>globalThis.pwned = true</script>', '[Bad](javascript:alert(1))'].join('\n'),
      },
      { kind: 'text', text: 'After' },
    ]);
    expect(plan.links).toEqual([]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.blocks)).toBe(true);
    expect(plan.blocks.every(Object.isFrozen)).toBe(true);
  });

  it('fails closed on oversized or control-bearing Markdown', () => {
    expect(() => compileContextNoteRenderPlan('x'.repeat(32_769))).toThrow(/Markdown/i);
    expect(() => compileContextNoteRenderPlan('safe\u0000unsafe')).toThrow(/Markdown/i);
  });
});
