import { describe, expect, it } from 'vitest';
import {
  analyzeContextPropertyRegistryChange,
  buildContextDerivedProperties,
  parseContextNoteProperties,
  parseContextPropertyRegistry,
  planContextPropertyEdits,
} from './noteProperties';

const definitions = [
  { name: 'title', type: 'text', required: true },
  { name: 'summary', type: 'text', defaultValue: 'Untriaged', templateDefined: true },
  { name: 'platforms', type: 'list' },
  { name: 'risk_score', type: 'number' },
  { name: 'release_blocker', type: 'checkbox' },
  { name: 'review_date', type: 'date' },
  { name: 'reviewed_at', type: 'date_time' },
  { name: 'tags', type: 'tags' },
  { name: 'parent_note', type: 'internal_link' },
  { name: 'source_url', type: 'url' },
  { name: 'status', type: 'status', options: ['open', 'closed'], defaultValue: 'open' },
  { name: 'severity', type: 'select', options: ['low', 'high'] },
  { name: 'owners', type: 'multi_select', options: ['VibeSpace', 'Security'] },
  { name: 'artifact_path', type: 'file_reference' },
  { name: 'agent', type: 'agent_reference' },
  { name: 'entity', type: 'context_entity_reference' },
] as const;

function registry() {
  const result = parseContextPropertyRegistry({
    version: 1,
    mapId: 'map-one',
    definitions,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('Context note properties', () => {
  it('builds a strict immutable map registry with every required property type', () => {
    const result = parseContextPropertyRegistry({
      version: 1,
      mapId: 'map-one',
      definitions,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definitions.map(({ type }) => type)).toEqual([
      'text',
      'text',
      'list',
      'number',
      'checkbox',
      'date',
      'date_time',
      'tags',
      'internal_link',
      'url',
      'status',
      'select',
      'multi_select',
      'file_reference',
      'agent_reference',
      'context_entity_reference',
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.definitions)).toBe(true);
    expect(Object.isFrozen(result.value.definitions[10]!.options)).toBe(true);

    expect(
      parseContextPropertyRegistry({
        version: 1,
        mapId: 'map-one',
        definitions: [
          { name: 'status', type: 'status', options: ['open'], defaultValue: 'closed' },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_default_invalid',
      detail: 'status',
    });
    expect(
      parseContextPropertyRegistry({
        version: 1,
        mapId: 'map-one',
        definitions: [
          { name: 'status', type: 'status', options: ['open'] },
          { name: 'STATUS', type: 'status', options: ['closed'] },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_definition_duplicate',
      detail: 'STATUS',
    });
    expect(
      parseContextPropertyRegistry({
        version: 1,
        mapId: 'map-one',
        definitions: [{ name: 'unsafe', type: 'text', arbitrary: true }],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_definition_invalid',
      detail: 'unsafe',
    });
    expect(
      parseContextPropertyRegistry({
        version: 1,
        mapId: 'map-one',
        definitions: [{ name: '__proto__', type: 'text' }],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_definition_invalid',
      detail: '__proto__',
    });
    expect(
      parseContextPropertyRegistry({
        version: 1,
        mapId: 'map-one',
        definitions: [{ name: 'toString', type: 'text', defaultValue: 'safe' }],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_definition_invalid',
      detail: 'toString',
    });
  });

  it('parses a bounded human-readable non-executable YAML frontmatter subset', () => {
    const parsed = parseContextNoteProperties({
      registry: registry(),
      markdown: `---
title: "Windows Installer Audit"
platforms:
  - Windows
  - Linux
risk_score: 9.5
release_blocker: true
review_date: 2026-07-15
reviewed_at: 2026-07-15T17:30:00Z
tags: [security, "release gate"]
parent_note: "[[Release Plan]]"
source_url: https://example.com/audit
status: open
severity: high
owners: [VibeSpace, Security]
artifact_path: app/src-tauri/tauri.conf.json
agent: agent-security
entity: entity-installer
---
# Audit
The body stays ordinary Markdown.
`,
      applyDefaults: true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.properties).toEqual({
      title: 'Windows Installer Audit',
      summary: 'Untriaged',
      platforms: ['Windows', 'Linux'],
      risk_score: 9.5,
      release_blocker: true,
      review_date: '2026-07-15',
      reviewed_at: '2026-07-15T17:30:00Z',
      tags: ['security', 'release gate'],
      parent_note: '[[Release Plan]]',
      source_url: 'https://example.com/audit',
      status: 'open',
      severity: 'high',
      owners: ['VibeSpace', 'Security'],
      artifact_path: 'app/src-tauri/tauri.conf.json',
      agent: 'agent-security',
      entity: 'entity-installer',
    });
    expect(parsed.value.body).toBe('# Audit\nThe body stays ordinary Markdown.\n');
    expect(Object.isFrozen(parsed.value.properties)).toBe(true);
    expect(Object.isFrozen(parsed.value.properties.platforms)).toBe(true);
  });

  it('rejects executable YAML features, duplicate or unknown keys, and invalid typed values', () => {
    const mapRegistry = registry();
    for (const [markdown, reason, detail] of [
      ['---\ntitle: &shared Audit\n---\n', 'frontmatter_yaml_unsafe', 'title'],
      ['---\ntitle: !run calc.exe\n---\n', 'frontmatter_yaml_unsafe', 'title'],
      ['---\ntitle: Audit\ntitle: Again\n---\n', 'frontmatter_property_duplicate', 'title'],
      ['---\nunknown: value\n---\n', 'frontmatter_property_unknown', 'unknown'],
      ['---\ntitle:\n  nested: object\n---\n', 'frontmatter_yaml_unsupported', 'title'],
      [
        '---\ntitle: Audit\nsource_url: javascript:alert(1)\n---\n',
        'frontmatter_property_invalid',
        'source_url',
      ],
      [
        '---\ntitle: Audit\nartifact_path: ../../private.txt\n---\n',
        'frontmatter_property_invalid',
        'artifact_path',
      ],
      [
        '---\ntitle: Audit\nreview_date: 2026-02-30\n---\n',
        'frontmatter_property_invalid',
        'review_date',
      ],
      [
        '---\ntitle: Audit\nreviewed_at: 2026-02-30T17:30:00Z\n---\n',
        'frontmatter_property_invalid',
        'reviewed_at',
      ],
      [
        '---\ntitle: Audit\nartifact_path: safe%00.txt\n---\n',
        'frontmatter_property_invalid',
        'artifact_path',
      ],
      ['---\ntitle: Audit\nstatus: pending\n---\n', 'frontmatter_property_invalid', 'status'],
    ] as const) {
      expect(parseContextNoteProperties({ registry: mapRegistry, markdown })).toEqual({
        ok: false,
        reason,
        detail,
      });
    }
  });

  it('creates explicit preview-only note and bulk edit plans with defaults and map-wide rename', () => {
    const mapRegistry = registry();
    const original = `---
title: First
severity: high
---
# First
Body one.
`;
    const second = '# Second\nBody two.\n';
    const plan = planContextPropertyEdits({
      registry: mapRegistry,
      documents: [
        { noteId: 'note-one', markdown: original },
        { noteId: 'note-two', markdown: second },
      ],
      edits: [
        {
          noteIds: ['note-one', 'note-two'],
          set: { status: 'closed', release_blocker: false, severity: 'low' },
          applyDefaults: true,
        },
      ],
      rename: { from: 'severity', to: 'risk_level' },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value).toMatchObject({
      version: 1,
      requiresExplicitApply: true,
      documents: [
        { noteId: 'note-one', changed: true },
        { noteId: 'note-two', changed: true },
      ],
    });
    expect(plan.value.documents[0]!.previewMarkdown).toContain('risk_level: low');
    expect(plan.value.documents[0]!.previewMarkdown).not.toContain('severity:');
    expect(plan.value.documents[1]!.previewMarkdown).toContain('summary: Untriaged');
    expect(plan.value.documents[1]!.previewMarkdown).toContain('# Second\nBody two.');
    expect(original).toContain('severity: high');
    expect(Object.isFrozen(plan.value.documents)).toBe(true);
  });

  it('keeps generated properties read-only and out of Markdown unless explicitly requested', () => {
    const derived = buildContextDerivedProperties({
      sourceKind: 'github_repository',
      sourcePath: 'app/src/main.tsx',
      githubRepository: 'Cookie774-GameDev/VibeSpace',
      branch: 'feature/context',
      sha: 'a'.repeat(40),
      language: 'TypeScript',
      lastIndexedAt: 1_752_600_000_000,
      linkCount: 12,
      backlinkCount: 7,
      testRelationship: 'covered',
      freshness: 'fresh',
    });
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(Object.keys(derived.value)).toEqual([
      'source_kind',
      'source_path',
      'github_repository',
      'branch',
      'sha',
      'language',
      'last_indexed',
      'link_count',
      'backlink_count',
      'test_relationship',
      'freshness',
    ]);

    const defaultPlan = planContextPropertyEdits({
      registry: registry(),
      documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
      edits: [],
      derivedProperties: derived.value,
    });
    expect(defaultPlan.ok).toBe(true);
    if (!defaultPlan.ok) return;
    expect(defaultPlan.value.documents[0]!.previewMarkdown).toBe('# Note\n');

    const explicitPlan = planContextPropertyEdits({
      registry: registry(),
      documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
      edits: [],
      derivedProperties: derived.value,
      includeDerivedProperties: true,
    });
    expect(explicitPlan.ok).toBe(true);
    if (!explicitPlan.ok) return;
    expect(explicitPlan.value.documents[0]!.previewMarkdown).toContain(
      'github_repository: Cookie774-GameDev/VibeSpace',
    );
    expect(explicitPlan.value.documents[0]!.previewMarkdown).toContain('link_count: 12');
    expect(
      parseContextNoteProperties({
        registry: registry(),
        markdown: explicitPlan.value.documents[0]!.previewMarkdown,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        properties: {
          github_repository: 'Cookie774-GameDev/VibeSpace',
          link_count: 12,
        },
      },
    });

    expect(
      planContextPropertyEdits({
        registry: registry(),
        documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
        edits: [{ noteIds: ['note-one'], set: { link_count: 99 } }],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_edit_generated_forbidden',
      detail: 'link_count',
    });
    expect(
      planContextPropertyEdits({
        registry: registry(),
        documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
        edits: [],
        derivedProperties: {
          ...derived.value,
          github_repository: 'javascript:alert(1)',
        },
        includeDerivedProperties: true,
      }),
    ).toEqual({
      ok: false,
      reason: 'property_edit_input_invalid',
    });
  });

  it('preserves CRLF Markdown bodies when producing an explicit property preview', () => {
    const plan = planContextPropertyEdits({
      registry: registry(),
      documents: [
        {
          noteId: 'note-crlf',
          markdown: '---\r\ntitle: Note\r\n---\r\n# Note\r\nBody\r\n',
        },
      ],
      edits: [{ noteIds: ['note-crlf'], set: { status: 'closed' } }],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const preview = plan.value.documents[0]!.previewMarkdown;
    expect(preview).toContain('status: closed\r\n---\r\n# Note\r\nBody\r\n');
    expect(preview.replace(/\r\n/gu, '')).not.toContain('\n');
  });

  it('preserves frontmatter comments and leaves notes without the renamed property byte-identical', () => {
    const withProperty = `---
title: First
# retain this operator note
severity: high
---
# First
`;
    const unrelated = `---
title: Second
# retain unrelated formatting
---
# Second
`;
    const plan = planContextPropertyEdits({
      registry: registry(),
      documents: [
        { noteId: 'note-one', markdown: withProperty },
        { noteId: 'note-two', markdown: unrelated },
      ],
      edits: [],
      rename: { from: 'severity', to: 'risk_level' },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.documents[0]!.previewMarkdown).toContain('# retain this operator note');
    expect(plan.value.documents[0]!.previewMarkdown).toContain('risk_level: high');
    expect(plan.value.documents[1]).toEqual({
      noteId: 'note-two',
      changed: false,
      previewMarkdown: unrelated,
    });
  });

  it('rejects oversized edit surfaces before traversing attacker-controlled property sets', () => {
    const oversizedSet = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`property_${index}`, 'value']),
    );
    expect(
      planContextPropertyEdits({
        registry: registry(),
        documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
        edits: [{ noteIds: ['note-one'], set: oversizedSet }],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_edit_input_invalid',
    });
    expect(
      planContextPropertyEdits({
        registry: registry(),
        documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
        edits: [
          {
            noteIds: ['note-one'],
            set: { title: undefined as never },
          },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_edit_value_invalid',
      detail: 'title',
    });
    const oversizedList = new Proxy(Array<string>(129).fill('value'), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          throw new Error('oversized list entries must not be traversed');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(
      planContextPropertyEdits({
        registry: registry(),
        documents: [{ noteId: 'note-one', markdown: '# Note\n' }],
        edits: [
          {
            noteIds: ['note-one'],
            set: { platforms: oversizedList },
          },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: 'property_edit_value_invalid',
      detail: 'platforms',
    });
  });

  it('rejects aggregate bulk-preview byte amplification before serializing every document', () => {
    const largeDefinitions = Array.from({ length: 256 }, (_, index) => ({
      name: `property_${index}`,
      type: 'text' as const,
    }));
    const largeRegistry = parseContextPropertyRegistry({
      version: 1,
      mapId: 'map-large',
      definitions: largeDefinitions,
    });
    expect(largeRegistry.ok).toBe(true);
    if (!largeRegistry.ok) return;
    const noteIds = Array.from({ length: 17 }, (_, index) => `note-${index}`);
    const set = Object.fromEntries(largeDefinitions.map(({ name }) => [name, 'x'.repeat(4_096)]));

    const plan = planContextPropertyEdits({
      registry: largeRegistry.value,
      documents: noteIds.map((noteId) => ({ noteId, markdown: '# Note\n' })),
      edits: [{ noteIds, set }],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe('property_edit_input_too_large');

    const sharedLargeMarkdown = 'x'.repeat(1_000_000);
    const unchangedPlan = planContextPropertyEdits({
      registry: registry(),
      documents: Array.from({ length: 17 }, (_, index) => ({
        noteId: `note-unchanged-${index}`,
        markdown: sharedLargeMarkdown,
      })),
      edits: [],
    });
    expect(unchangedPlan.ok).toBe(false);
    if (unchangedPlan.ok) return;
    expect(unchangedPlan.reason).toBe('property_edit_input_too_large');
  });

  it('reports usage counts and warns before incompatible registry type changes', () => {
    const analysis = analyzeContextPropertyRegistryChange({
      registry: registry(),
      propertyName: 'risk_score',
      nextType: 'text',
      documents: [
        { noteId: 'note-one', markdown: '---\ntitle: One\nrisk_score: 5\n---\n' },
        { noteId: 'note-two', markdown: '---\ntitle: Two\nrisk_score: 8\n---\n' },
        { noteId: 'note-three', markdown: '---\ntitle: Three\n---\n' },
      ],
    });
    expect(analysis).toEqual({
      ok: true,
      value: {
        propertyName: 'risk_score',
        currentType: 'number',
        nextType: 'text',
        usageCount: 2,
        compatible: false,
        warning: 'incompatible_type_change',
      },
    });

    expect(
      analyzeContextPropertyRegistryChange({
        registry: registry(),
        propertyName: 'status',
        nextType: 'status',
        documents: [],
      }),
    ).toMatchObject({
      ok: true,
      value: { usageCount: 0, compatible: true },
    });
  });
});
