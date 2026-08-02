import { describe, expect, it } from 'vitest';
import {
  buildContextEmbedPlan,
  buildContextNoteReferenceIndex,
  contextNoteReferenceCompletions,
  findContextNoteUnlinkedMentions,
  parseContextNoteSyntax,
  resolveContextNoteReferences,
  type ContextNoteReferenceDocumentV1,
} from './noteSyntax';

function parsed(markdown: string) {
  const result = parseContextNoteSyntax(markdown);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

function document(noteId: string, title: string, markdown: string): ContextNoteReferenceDocumentV1 {
  return { noteId, title, syntax: parsed(markdown) };
}

describe('Context note syntax', () => {
  it('extracts bounded frontmatter, headings, stable blocks, wiki targets, embeds, and Markdown links', () => {
    const result = parseContextNoteSyntax(`---
aliases:
  - Access Gate
  - "Subscription Gate"
tags: [auth, "security"]
---
# Authentication Flow
The decision is server-authoritative. ^entitlement-authority

## Token Refresh
See [[Authentication Flow]], [[Authentication Flow#Token Refresh]],
[[Authentication Flow#^refresh-race]], and [[Authentication Flow|Auth notes]].
Embed ![[Recovery#Checklist]] and [the guide](https://example.com/guide).
![diagram](assets/auth.png)
`);

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 1,
        bodyStartLine: 7,
        aliases: ['Access Gate', 'Subscription Gate'],
        tags: ['auth', 'security'],
        headings: [
          { text: 'Authentication Flow', slug: 'authentication-flow', level: 1, line: 7 },
          { text: 'Token Refresh', slug: 'token-refresh', level: 2, line: 10 },
        ],
        blocks: [{ id: 'entitlement-authority', line: 8 }],
      },
    });
    if (!result.ok) return;
    expect(result.value.wikiLinks).toMatchObject([
      {
        targetTitle: 'Authentication Flow',
        embed: false,
        line: 11,
      },
      {
        targetTitle: 'Authentication Flow',
        heading: 'Token Refresh',
        embed: false,
        line: 11,
      },
      {
        targetTitle: 'Authentication Flow',
        blockId: 'refresh-race',
        embed: false,
        line: 12,
      },
      {
        targetTitle: 'Authentication Flow',
        alias: 'Auth notes',
        embed: false,
        line: 12,
      },
      {
        targetTitle: 'Recovery',
        heading: 'Checklist',
        embed: true,
        line: 13,
      },
    ]);
    expect(result.value.markdownLinks).toMatchObject([
      {
        label: 'the guide',
        target: 'https://example.com/guide',
        image: false,
        external: true,
        line: 13,
      },
      {
        label: 'diagram',
        target: 'assets/auth.png',
        image: true,
        external: false,
        line: 14,
      },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.wikiLinks)).toBe(true);
  });

  it('ignores frontmatter bodies, fenced and inline code, escaped links, and unsafe Markdown schemes', () => {
    const result = parsed(`---
aliases: [Safe Alias]
description: "[[Not a link]]"
---
# Real heading
\\[[Escaped Note]]
\`[[Inline Code]]\`
\`\`\`md
# Fake heading
[[Fenced Note]]
fake ^fake-block
\`\`\`
    [[Indented Code]]
    indented ^hidden-block
[unsafe](javascript:alert(1))
[data](data:text/html,bad)
[safe](../notes/safe.md#Heading)
Real block. ^real-block
`);

    expect(result.headings).toMatchObject([{ text: 'Real heading', line: 5 }]);
    expect(result.blocks).toEqual([{ id: 'real-block', line: 18 }]);
    expect(result.wikiLinks).toEqual([]);
    expect(result.markdownLinks).toMatchObject([
      {
        label: 'safe',
        target: '../notes/safe.md#Heading',
        external: false,
        line: 17,
      },
    ]);
    expect(result.diagnostics).toMatchObject([
      { kind: 'unsafe_markdown_target', line: 15 },
      { kind: 'unsafe_markdown_target', line: 16 },
    ]);
  });

  it('preserves balanced parentheses in safe standard Markdown targets', () => {
    const result = parsed(
      '[guide](https://example.com/a_(b)) and [nested](../notes/(archive)/guide.md)',
    );

    expect(result.markdownLinks).toMatchObject([
      { label: 'guide', target: 'https://example.com/a_(b)', external: true },
      { label: 'nested', target: '../notes/(archive)/guide.md', external: false },
    ]);
  });

  it('does not treat a four-space-indented fence marker as a real fence', () => {
    expect(parsed('    ```\n[[Real Note]]').wikiLinks).toMatchObject([
      { targetTitle: 'Real Note', line: 2 },
    ]);
  });

  it('assigns deterministic unique heading slugs and rejects duplicate or malformed block IDs', () => {
    expect(
      parsed(`# Token Refresh
## Token Refresh
### Tökén Refresh
`).headings,
    ).toMatchObject([
      { slug: 'token-refresh' },
      { slug: 'token-refresh-1' },
      { slug: 'token-refresh-2' },
    ]);

    expect(
      parseContextNoteSyntax(`First. ^same
Second. ^same
`),
    ).toEqual({
      ok: false,
      reason: 'duplicate_block_id',
      detail: 'same',
    });
    expect(parseContextNoteSyntax('Invalid block. ^not valid')).toMatchObject({
      ok: true,
      value: {
        blocks: [],
        diagnostics: [{ kind: 'invalid_block_id', line: 1 }],
      },
    });
  });

  it('rejects non-string, oversized, NUL-bearing, and unterminated frontmatter input', () => {
    expect(parseContextNoteSyntax(null)).toEqual({
      ok: false,
      reason: 'note_content_invalid',
    });
    expect(parseContextNoteSyntax('x'.repeat(1_048_577))).toEqual({
      ok: false,
      reason: 'note_content_too_large',
    });
    expect(parseContextNoteSyntax('safe\u0000unsafe')).toEqual({
      ok: false,
      reason: 'note_content_control_character',
    });
    expect(parseContextNoteSyntax('---\naliases: [Never closed]\n# body')).toEqual({
      ok: false,
      reason: 'frontmatter_unterminated',
    });
  });
});

describe('Context note reference index', () => {
  it('rejects duplicate stable block IDs anywhere in one map', () => {
    const result = buildContextNoteReferenceIndex([
      document('note-a', 'Authentication', 'A. ^shared'),
      document('note-b', 'Authorization', 'B. ^shared'),
    ]);

    expect(result).toEqual({
      ok: false,
      reason: 'duplicate_block_id',
      detail: 'shared',
      noteIds: ['note-a', 'note-b'],
    });
  });

  it('rejects malformed runtime reference documents without throwing', () => {
    expect(
      buildContextNoteReferenceIndex([
        {
          noteId: 'note-a',
          title: 'A',
          syntax: { version: 1 },
        } as never,
      ]),
    ).toEqual({
      ok: false,
      reason: 'invalid_reference_document',
      detail: 'note-a',
    });

    expect(
      buildContextNoteReferenceIndex([document('note-a', 'A', '# A')], {
        version: 1,
        documents: null,
      } as never),
    ).toEqual({
      ok: false,
      reason: 'invalid_reference_document',
      detail: 'previous_index',
    });
  });

  it('resolves note, alias, heading, and block links with explicit broken and ambiguous diagnostics', () => {
    const source = document(
      'note-source',
      'Source',
      `[[Authentication Flow]]
[[Access Gate#Token Refresh]]
[[Authentication Flow#^refresh-race]]
[[Missing Note]]
[[Authentication Flow#Missing Heading]]
[[Authentication Flow#^missing-block]]
[[Shared Alias]]
`,
    );
    const index = buildContextNoteReferenceIndex([
      source,
      document(
        'note-auth',
        'Authentication Flow',
        `---
aliases: [Access Gate, Shared Alias]
---
# Token Refresh
Race notes. ^refresh-race
`,
      ),
      document(
        'note-other',
        'Other',
        `---
aliases: [Shared Alias]
---
# Other
`,
      ),
    ]);
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    expect(resolveContextNoteReferences(index.value, 'note-source')).toMatchObject([
      { state: 'resolved', targetNoteId: 'note-auth' },
      {
        state: 'resolved',
        targetNoteId: 'note-auth',
        targetHeadingSlug: 'token-refresh',
      },
      {
        state: 'resolved',
        targetNoteId: 'note-auth',
        targetBlockId: 'refresh-race',
      },
      { state: 'missing_note' },
      { state: 'missing_heading', targetNoteId: 'note-auth' },
      { state: 'missing_block', targetNoteId: 'note-auth' },
      { state: 'ambiguous_note', candidateNoteIds: ['note-auth', 'note-other'] },
    ]);
  });

  it('reuses the immutable title and alias lookup across batched resolutions', () => {
    const built = buildContextNoteReferenceIndex([
      document('note-source', 'Source', '[[Access Gate]]'),
      document('note-auth', 'Authentication', '---\naliases: [Access Gate]\n---\n# Authentication'),
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    let aliasIterations = 0;
    const documents = built.value.documents.map((entry) => {
      if (entry.noteId !== 'note-auth') return entry;
      const aliases = new Proxy([...entry.syntax.aliases], {
        get(target, property, receiver) {
          if (property === Symbol.iterator) aliasIterations += 1;
          return Reflect.get(target, property, receiver);
        },
      });
      return Object.freeze({
        ...entry,
        syntax: Object.freeze({ ...entry.syntax, aliases: Object.freeze(aliases) }),
      });
    });
    const index = Object.freeze({ version: 1 as const, documents: Object.freeze(documents) });

    expect(resolveContextNoteReferences(index, 'note-source')[0]).toMatchObject({
      state: 'resolved',
      targetNoteId: 'note-auth',
    });
    expect(resolveContextNoteReferences(index, 'note-source')[0]).toMatchObject({
      state: 'resolved',
      targetNoteId: 'note-auth',
    });
    expect(aliasIterations).toBe(1);
  });

  it('reuses immutable document and fragment lookups across repeated resolutions', () => {
    const built = buildContextNoteReferenceIndex([
      document('note-source', 'Source', '[[Target#^missing-one]]\n[[Target#^missing-two]]'),
      document(
        'note-target',
        'Target',
        Array.from({ length: 32 }, (_, index) => `Block ${index}. ^block-${index}`).join('\n'),
      ),
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    let documentReads = 0;
    let blockReads = 0;
    const documents = built.value.documents.map((entry) => {
      if (entry.noteId !== 'note-target') return entry;
      const blocks = new Proxy(entry.syntax.blocks, {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/u.test(property)) blockReads += 1;
          return Reflect.get(target, property, receiver);
        },
      });
      return Object.freeze({
        ...entry,
        syntax: Object.freeze({ ...entry.syntax, blocks }),
      });
    });
    const frozenDocuments = Object.freeze(documents);
    const instrumentedDocuments = new Proxy(frozenDocuments, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) documentReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const index = Object.freeze({
      version: 1 as const,
      documents: instrumentedDocuments,
    });

    expect(resolveContextNoteReferences(index, 'note-source')).toMatchObject([
      { state: 'missing_block', targetNoteId: 'note-target' },
      { state: 'missing_block', targetNoteId: 'note-target' },
    ]);
    const readsAfterPreparation = { documentReads, blockReads };
    expect(resolveContextNoteReferences(index, 'note-source')).toMatchObject([
      { state: 'missing_block', targetNoteId: 'note-target' },
      { state: 'missing_block', targetNoteId: 'note-target' },
    ]);
    expect({ documentReads, blockReads }).toEqual(readsAfterPreparation);
  });

  it('returns deterministic bounded autocomplete records for titles, aliases, headings, and blocks', () => {
    const index = buildContextNoteReferenceIndex([
      document(
        'note-auth',
        'Authentication Flow',
        `---
aliases: [Access Gate]
---
# Token Refresh
Race notes. ^refresh-race
`,
      ),
    ]);
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    expect(contextNoteReferenceCompletions(index.value, 'refresh', 10)).toEqual([
      {
        kind: 'block',
        noteId: 'note-auth',
        label: 'refresh-race',
        insertText: '[[Authentication Flow#^refresh-race]]',
      },
      {
        kind: 'heading',
        noteId: 'note-auth',
        label: 'Token Refresh',
        insertText: '[[Authentication Flow#Token Refresh]]',
      },
    ]);
    expect(contextNoteReferenceCompletions(index.value, 'access', 1)).toEqual([
      {
        kind: 'alias',
        noteId: 'note-auth',
        label: 'Access Gate',
        insertText: '[[Access Gate]]',
      },
    ]);
  });

  it('preserves stable note bindings across a title rename', () => {
    const initial = buildContextNoteReferenceIndex([
      document('note-source', 'Source', 'See [[Old Title]].'),
      document('note-target', 'Old Title', '# Target'),
    ]);
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    expect(resolveContextNoteReferences(initial.value, 'note-source')).toMatchObject([
      { state: 'resolved', targetNoteId: 'note-target' },
    ]);

    const renamed = buildContextNoteReferenceIndex(
      [
        document('note-source', 'Source', 'See [[Old Title]].'),
        document('note-target', 'New Title', '# Target'),
      ],
      initial.value,
    );
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;

    expect(resolveContextNoteReferences(renamed.value, 'note-source')).toMatchObject([
      { state: 'resolved', targetNoteId: 'note-target' },
    ]);
  });

  it('finds ranked title and alias mentions while ignoring frontmatter, code, and existing links', () => {
    const index = buildContextNoteReferenceIndex([
      document('note-source', 'Source', '# Source'),
      document(
        'note-auth',
        'Authentication Flow',
        `---
aliases: [Access Gate, Shared Gate]
---
# Authentication
`,
      ),
      document(
        'note-other',
        'Authorization',
        `---
aliases: [Shared Gate]
---
# Authorization
`,
      ),
    ]);
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const mentions = findContextNoteUnlinkedMentions(
      index.value,
      'note-source',
      `---
description: "Access Gate"
---
Authentication Flow depends on Access Gate.
\`Access Gate\` and [[Access Gate]] are already handled.
\`\`\`md
Shared Gate
\`\`\`
    \`\`\`
Access Gate after indented code.
Shared Gate remains ambiguous.
`,
    );

    expect(mentions).toEqual([
      {
        matchedText: 'Authentication Flow',
        label: 'Authentication Flow',
        matchKind: 'title',
        candidateNoteIds: ['note-auth'],
        line: 4,
        column: 1,
        confidence: 1,
      },
      {
        matchedText: 'Access Gate',
        label: 'Access Gate',
        matchKind: 'alias',
        candidateNoteIds: ['note-auth'],
        line: 4,
        column: 32,
        confidence: 0.9,
      },
      {
        matchedText: 'Access Gate',
        label: 'Access Gate',
        matchKind: 'alias',
        candidateNoteIds: ['note-auth'],
        line: 10,
        column: 1,
        confidence: 0.9,
      },
      {
        matchedText: 'Shared Gate',
        label: 'Shared Gate',
        matchKind: 'alias',
        candidateNoteIds: ['note-auth', 'note-other'],
        line: 11,
        column: 1,
        confidence: 0.65,
      },
    ]);
  });

  it('builds a bounded embed plan with cycles, depth limits, and unresolved targets made explicit', () => {
    const index = buildContextNoteReferenceIndex([
      document('note-a', 'A', '![[B]]\n![[Missing]]'),
      document('note-b', 'B', '![[C]]'),
      document('note-c', 'C', '![[A]]'),
    ]);
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    expect(buildContextEmbedPlan(index.value, 'note-a', { maxDepth: 8 })).toMatchObject([
      {
        state: 'resolved',
        sourceNoteId: 'note-a',
        targetNoteId: 'note-b',
        depth: 1,
      },
      {
        state: 'resolved',
        sourceNoteId: 'note-b',
        targetNoteId: 'note-c',
        depth: 2,
      },
      {
        state: 'cycle',
        sourceNoteId: 'note-c',
        targetNoteId: 'note-a',
        depth: 3,
        path: ['note-a', 'note-b', 'note-c', 'note-a'],
      },
      {
        state: 'unresolved',
        sourceNoteId: 'note-a',
        depth: 1,
      },
    ]);
    expect(buildContextEmbedPlan(index.value, 'note-a', { maxDepth: 1 })).toMatchObject([
      { state: 'resolved', targetNoteId: 'note-b', depth: 1 },
      { state: 'depth_limited', sourceNoteId: 'note-b', targetNoteId: 'note-c', depth: 2 },
      { state: 'unresolved', sourceNoteId: 'note-a', depth: 1 },
    ]);
  });

  it('retains heading and block fragment identity and scopes nested embed traversal', () => {
    const index = buildContextNoteReferenceIndex([
      document('note-a', 'A', '![[B#Included]]\n![[B#^exact-block]]'),
      document(
        'note-b',
        'B',
        `# Included
![[C]]
# Excluded
![[D]]
Exact ![[E]] ^exact-block
`,
      ),
      document('note-c', 'C', '# C'),
      document('note-d', 'D', '# D'),
      document('note-e', 'E', '# E'),
    ]);
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    expect(buildContextEmbedPlan(index.value, 'note-a')).toMatchObject([
      {
        state: 'resolved',
        sourceNoteId: 'note-a',
        targetNoteId: 'note-b',
        targetHeadingSlug: 'included',
      },
      {
        state: 'resolved',
        sourceNoteId: 'note-b',
        targetNoteId: 'note-c',
      },
      {
        state: 'resolved',
        sourceNoteId: 'note-a',
        targetNoteId: 'note-b',
        targetBlockId: 'exact-block',
      },
      {
        state: 'resolved',
        sourceNoteId: 'note-b',
        targetNoteId: 'note-e',
      },
    ]);
  });
});
