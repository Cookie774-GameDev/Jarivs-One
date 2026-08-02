import { describe, expect, it } from 'vitest';
import {
  buildContextNoteReferenceIndex,
  parseContextNoteSyntax,
  type ContextNoteReferenceDocumentV1,
} from './noteSyntax';
import {
  buildContextNoteRelationReport,
  planContextMentionLinkEdits,
  type ContextNoteRelationSourceV1,
} from './noteRelations';

function source(
  noteId: string,
  title: string,
  relativePath: string,
  markdown: string,
  modifiedAt: number,
): ContextNoteRelationSourceV1 {
  const parsed = parseContextNoteSyntax(markdown);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.reason);
  return {
    noteId,
    title,
    relativePath,
    modifiedAt,
    markdown,
    syntax: parsed.value,
  };
}

function indexFor(sources: readonly ContextNoteRelationSourceV1[]) {
  const index = buildContextNoteReferenceIndex(
    sources.map(
      ({ noteId, title, syntax }): ContextNoteReferenceDocumentV1 => ({
        noteId,
        title,
        syntax,
      }),
    ),
  );
  expect(index.ok).toBe(true);
  if (!index.ok) throw new Error(index.reason);
  return index.value;
}

describe('Context note relation reports', () => {
  it('reports provenance-rich backlinks and classified outgoing relations', () => {
    const sources = [
      source(
        'note-security',
        'Security Review',
        'notes/Security.md',
        `# Release review
Review [[Authentication Flow#Token Refresh]] before release.
Embed ![[Runbook#^step-one]].
See [guide](https://example.com/guide) and [symbol](vibespace:symbol/auth/check).
`,
        300,
      ),
      source(
        'note-auth',
        'Authentication Flow',
        'notes/Authentication.md',
        '# Token Refresh\nRotate safely.',
        200,
      ),
      source('note-runbook', 'Runbook', 'notes/Runbook.md', 'First step. ^step-one', 100),
    ];
    const index = indexFor(sources);

    const authentication = buildContextNoteRelationReport({
      index,
      sources,
      focusNoteId: 'note-auth',
      generatedRelationships: [
        {
          id: 'generated-auth-runbook',
          sourceNoteId: 'note-auth',
          targetNoteId: 'note-runbook',
          relationType: 'supports',
          context: 'Generated from verified graph evidence.',
          confidence: 0.88,
          observedAt: 400,
        },
      ],
    });
    expect(authentication.ok).toBe(true);
    if (!authentication.ok) return;
    expect(authentication.value.backlinks).toMatchObject([
      {
        sourceNoteId: 'note-security',
        sourcePath: 'notes/Security.md',
        context: 'Review [[Authentication Flow#Token Refresh]] before release.',
        heading: 'Release review',
        relationType: 'wiki_link',
        line: 2,
        lastModifiedAt: 300,
        targetHeadingSlug: 'token-refresh',
      },
    ]);
    expect(authentication.value.outgoing).toMatchObject([
      {
        state: 'generated',
        targetNoteId: 'note-runbook',
        relationType: 'supports',
        confidence: 0.88,
      },
    ]);

    const security = buildContextNoteRelationReport({
      index,
      sources,
      focusNoteId: 'note-security',
    });
    expect(security.ok).toBe(true);
    if (!security.ok) return;
    expect(security.value.outgoing).toMatchObject([
      {
        state: 'resolved',
        relationType: 'wiki_link',
        targetNoteId: 'note-auth',
        targetHeadingSlug: 'token-refresh',
      },
      {
        state: 'resolved',
        relationType: 'embed',
        targetNoteId: 'note-runbook',
        targetBlockId: 'step-one',
      },
      {
        state: 'external',
        relationType: 'external_url',
        target: 'https://example.com/guide',
      },
      {
        state: 'resolved',
        relationType: 'code_reference',
        target: 'vibespace:symbol/auth/check',
      },
    ]);
    expect(Object.isFrozen(security.value)).toBe(true);
    expect(Object.isFrozen(security.value.outgoing)).toBe(true);
  });

  it('builds deterministic repair diagnostics without mutating targets', () => {
    const sources = [
      source(
        'note-source',
        'Source',
        'notes/Source.md',
        `[[Authentcation Flow]]
[[Unrelated Missing]]
[[Shared Alias]]
[[Authentication Flow#^old-block]]
[private repository](https://github.com/acme/private)
[deleted file](archive/deleted.md)
[escape](../../other-tenant/private.md)
`,
        300,
      ),
      source(
        'note-auth',
        'Authentication Flow',
        'notes/Authentication.md',
        'Current block. ^current-block',
        200,
      ),
      source('note-one', 'One', 'notes/One.md', '---\naliases: [Shared Alias]\n---\n# One', 100),
      source('note-two', 'Two', 'notes/Two.md', '---\naliases: [Shared Alias]\n---\n# Two', 100),
    ];
    const report = buildContextNoteRelationReport({
      index: indexFor(sources),
      sources,
      focusNoteId: 'note-source',
      inaccessibleGithubTargets: ['https://github.com/acme/private'],
      deletedLocalTargets: ['archive/deleted.md'],
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    expect(report.value.repairs).toMatchObject([
      {
        kind: 'renamed_target_candidate',
        target: 'Authentcation Flow',
        candidateNoteIds: ['note-auth'],
      },
      { kind: 'missing_target', target: 'Unrelated Missing' },
      {
        kind: 'ambiguous_title',
        target: 'Shared Alias',
        candidateNoteIds: ['note-one', 'note-two'],
      },
      {
        kind: 'stale_block_id',
        target: 'Authentication Flow#^old-block',
        targetNoteId: 'note-auth',
      },
      {
        kind: 'inaccessible_github_source',
        target: 'https://github.com/acme/private',
      },
      { kind: 'deleted_file', target: 'archive/deleted.md' },
      { kind: 'missing_target', target: '../../other-tenant/private.md' },
    ]);
    expect(
      report.value.outgoing.find(({ target }) => target === '../../other-tenant/private.md'),
    ).toMatchObject({ state: 'missing_note', relationType: 'local_file' });
  });

  it('ranks unlinked mentions and creates preview-only one-or-many conversion plans', () => {
    const markdown = `# Security
Authentication Flow depends on Access Gate.
`;
    const sources = [
      source('note-source', 'Security', 'notes/Security.md', markdown, 300),
      source(
        'note-auth',
        'Authentication Flow',
        'notes/Authentication.md',
        '---\naliases: [Access Gate]\n---\n# Auth',
        200,
      ),
    ];
    const index = indexFor(sources);
    const report = buildContextNoteRelationReport({
      index,
      sources,
      focusNoteId: 'note-source',
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.unlinkedMentions).toMatchObject([
      {
        matchedText: 'Authentication Flow',
        candidateNoteIds: ['note-auth'],
        confidence: 1,
        availableActions: ['convert_one', 'convert_selected', 'ignore', 'add_alias', 'create_note'],
      },
      {
        matchedText: 'Access Gate',
        candidateNoteIds: ['note-auth'],
        confidence: 0.9,
      },
    ]);

    const one = planContextMentionLinkEdits({
      index,
      sourceNoteId: 'note-source',
      markdown,
      sourceKind: 'note',
      mentions: [report.value.unlinkedMentions[0]!],
    });
    expect(one).toMatchObject({
      ok: true,
      value: {
        requiresExplicitApply: true,
        edits: [{ replacement: '[[Authentication Flow]]' }],
      },
    });
    if (!one.ok) return;
    expect(one.value.previewMarkdown).toContain('[[Authentication Flow]] depends on Access Gate.');
    expect(markdown).toContain('Authentication Flow depends on Access Gate.');

    const selected = planContextMentionLinkEdits({
      index,
      sourceNoteId: 'note-source',
      markdown,
      sourceKind: 'note',
      mentions: report.value.unlinkedMentions,
    });
    expect(selected).toMatchObject({
      ok: true,
      value: {
        requiresExplicitApply: true,
        previewMarkdown:
          '# Security\n[[Authentication Flow]] depends on [[Authentication Flow|Access Gate]].\n',
      },
    });

    const crlf = markdown.replace(/\n/gu, '\r\n');
    const crlfPlan = planContextMentionLinkEdits({
      index,
      sourceNoteId: 'note-source',
      markdown: crlf,
      sourceKind: 'note',
      mentions: report.value.unlinkedMentions,
    });
    expect(crlfPlan).toMatchObject({
      ok: true,
      value: {
        previewMarkdown:
          '# Security\r\n[[Authentication Flow]] depends on [[Authentication Flow|Access Gate]].\r\n',
      },
    });

    expect(
      planContextMentionLinkEdits({
        index,
        sourceNoteId: 'note-source',
        markdown,
        sourceKind: 'source_code',
        mentions: report.value.unlinkedMentions,
      }),
    ).toEqual({
      ok: false,
      reason: 'source_code_auto_edit_forbidden',
    });
  });

  it('fails closed on missing focus notes, malformed source metadata, and stale mention offsets', () => {
    const valid = source('note-a', 'A', 'notes/A.md', '# A', 1);
    const index = indexFor([valid]);
    expect(
      buildContextNoteRelationReport({
        index,
        sources: [valid],
        focusNoteId: 'missing',
      }),
    ).toEqual({ ok: false, reason: 'focus_note_missing' });

    expect(
      buildContextNoteRelationReport({
        index,
        sources: [{ ...valid, relativePath: 'C:\\private\\A.md' }],
        focusNoteId: 'note-a',
      }),
    ).toEqual({ ok: false, reason: 'invalid_relation_source', detail: 'note-a' });

    expect(
      buildContextNoteRelationReport({
        index: { version: 1, documents: null },
        sources: [],
        focusNoteId: 'note-a',
      } as never),
    ).toEqual({ ok: false, reason: 'invalid_relation_source', detail: 'index' });

    expect(
      buildContextNoteRelationReport({
        index,
        sources: [valid],
        focusNoteId: 'note-a',
        inaccessibleGithubTargets: 42,
      } as never),
    ).toEqual({ ok: false, reason: 'invalid_relation_source' });

    expect(
      planContextMentionLinkEdits({
        index,
        sourceNoteId: 'note-a',
        markdown: '# A',
        sourceKind: 'note',
        mentions: [
          {
            matchedText: 'Changed',
            label: 'A',
            matchKind: 'title',
            candidateNoteIds: ['note-a'],
            line: 1,
            column: 1,
            confidence: 1,
            availableActions: [
              'convert_one',
              'convert_selected',
              'ignore',
              'add_alias',
              'create_note',
            ],
          },
        ],
      }),
    ).toEqual({ ok: false, reason: 'mention_stale' });

    expect(
      planContextMentionLinkEdits({
        index,
        sourceNoteId: 'note-a',
        markdown: '# A',
        sourceKind: 'other',
        mentions: [],
      } as never),
    ).toEqual({ ok: false, reason: 'mention_input_invalid' });
  });

  it('rejects stale indexes and wiki-metacharacter targets before producing deceptive output', () => {
    const oldSource = source('note-source', 'Source', 'notes/Source.md', 'See [[Target]].', 2);
    const currentSource = source(
      'note-source',
      'Source',
      'notes/Source.md',
      'The link was removed.',
      3,
    );
    const target = source('note-target', 'Target', 'notes/Target.md', '# Target', 1);
    expect(
      buildContextNoteRelationReport({
        index: indexFor([oldSource, target]),
        sources: [currentSource, target],
        focusNoteId: 'note-source',
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_relation_source',
      detail: 'note-source',
    });

    const unsafeTitleSource = source(
      'note-unsafe',
      'Foo|Bar',
      'notes/Foo-Bar.md',
      '# Unsafe title',
      1,
    );
    const mentionSource = source(
      'note-mention',
      'Mention',
      'notes/Mention.md',
      'Foo|Bar is referenced.',
      1,
    );
    const unsafeIndex = indexFor([mentionSource, unsafeTitleSource]);
    const report = buildContextNoteRelationReport({
      index: unsafeIndex,
      sources: [mentionSource, unsafeTitleSource],
      focusNoteId: 'note-mention',
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(
      planContextMentionLinkEdits({
        index: unsafeIndex,
        sourceNoteId: 'note-mention',
        markdown: mentionSource.markdown,
        sourceKind: 'note',
        mentions: report.value.unlinkedMentions,
      }),
    ).toEqual({ ok: false, reason: 'mention_target_invalid' });
  });

  it('rejects shallow-frozen reference indexes whose nested syntax can invalidate caches', () => {
    const sources = [
      source('note-source', 'Source', 'notes/Source.md', 'See [[Access Gate]].', 1),
      source(
        'note-auth',
        'Authentication',
        'notes/Authentication.md',
        '---\naliases: [Access Gate]\n---\n# Authentication',
        1,
      ),
    ];
    const built = indexFor(sources);
    const mutableAliases = [...built.documents[0]!.syntax.aliases];
    const documents = built.documents.map((document) =>
      document.noteId === built.documents[0]!.noteId
        ? Object.freeze({
            ...document,
            syntax: Object.freeze({
              ...document.syntax,
              aliases: mutableAliases,
            }),
          })
        : document,
    );
    const shallowIndex = Object.freeze({
      version: 1 as const,
      documents: Object.freeze(documents),
    });

    expect(
      buildContextNoteRelationReport({
        index: shallowIndex,
        sources,
        focusNoteId: 'note-source',
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_relation_source',
      detail: 'index',
    });
  });

  it('rejects ambiguous-label candidate fanout before materializing amplified relations', () => {
    const focus = source(
      'note-source',
      'Source',
      'notes/Source.md',
      Array.from({ length: 100 }, () => '[[Shared]]').join('\n'),
      1,
    );
    const candidates = Array.from({ length: 201 }, (_, index) =>
      source(
        `note-shared-${index}`,
        'Shared',
        `notes/Shared-${index}.md`,
        `# Candidate ${index}`,
        1,
      ),
    );
    const sources = [focus, ...candidates];

    expect(
      buildContextNoteRelationReport({
        index: indexFor(sources),
        sources,
        focusNoteId: 'note-source',
      }),
    ).toEqual({
      ok: false,
      reason: 'relation_input_too_large',
    });
  });
});
