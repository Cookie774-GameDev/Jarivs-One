import { describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_CONTEXT_TEMPLATES,
  CONTEXT_TEMPLATE_VARIABLES,
  applyContextTemplateOperation,
  createContextTemplateLibrary,
  exportContextTemplate,
  renderContextTemplate,
  type ContextTemplateVariables,
} from './contextTemplates';

const variables: ContextTemplateVariables = {
  title: 'Worker cancellation fix',
  date: '2026-07-26',
  time: '00:05',
  project: 'VibeSpace',
  context_map: 'Shared Intelligence Kernel',
  active_file: 'app/src/features/context/contextTemplates.ts',
  github_repository: 'owner/vibespace',
  github_branch: 'codex/context',
  github_sha: 'abc1234',
  active_agent: 'JARVIS',
  active_terminal: 'terminal-1',
};

describe('Context templates', () => {
  it('ships all thirteen substantive frozen templates', () => {
    expect(BUILTIN_CONTEXT_TEMPLATES.map(({ id }) => id)).toEqual([
      'feature-specification',
      'bug-report',
      'security-finding',
      'architecture-decision-record',
      'release-checklist',
      'research-note',
      'meeting-note',
      'terminal-investigation',
      'github-pr-review',
      'model-comparison',
      'prompt-forge-goal',
      'daily-development-log',
      'canvas-planning-note',
    ]);
    expect(BUILTIN_CONTEXT_TEMPLATES.every(({ body }) => body.length > 100)).toBe(true);
    expect(BUILTIN_CONTEXT_TEMPLATES.every(({ body }) => body.includes('# '))).toBe(true);
    expect(Object.isFrozen(BUILTIN_CONTEXT_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(BUILTIN_CONTEXT_TEMPLATES[0])).toBe(true);
  });

  it('supports exactly the eleven approved safe variables', () => {
    expect(CONTEXT_TEMPLATE_VARIABLES).toEqual([
      'title',
      'date',
      'time',
      'project',
      'context_map',
      'active_file',
      'github_repository',
      'github_branch',
      'github_sha',
      'active_agent',
      'active_terminal',
    ]);
  });

  it('renders approved variables once into immutable non-executable text', () => {
    const rendered = renderContextTemplate(
      '# {{title}}\n\n{{project}} · {{date}} {{time}}\n\n{{active_file}}',
      variables,
    );
    expect(rendered).toEqual({
      content:
        '# Worker cancellation fix\n\nVibeSpace · 2026-07-26 00:05\n\napp/src/features/context/contextTemplates.ts',
      usedVariables: ['title', 'project', 'date', 'time', 'active_file'],
      executable: false,
    });
    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.usedVariables)).toBe(true);

    const nonRecursive = renderContextTemplate('{{title}}', {
      ...variables,
      title: '{{github_sha}}',
    });
    expect(nonRecursive.content).toBe('{{github_sha}}');
    expect(nonRecursive.usedVariables).toEqual(['title']);
  });

  it('rejects unknown variables, expressions, missing values, controls, and oversized input', () => {
    for (const body of [
      '{{unknown}}',
      '{{ constructor }}',
      '{{title.toUpperCase()}}',
      '{{#if title}}yes{{/if}}',
      '${process.env.SECRET}',
    ]) {
      expect(() => renderContextTemplate(body, variables)).toThrow(/template|variable/i);
    }
    expect(() =>
      renderContextTemplate('{{title}} {{active_agent}}', {
        ...variables,
        active_agent: undefined,
      }),
    ).toThrow(/active_agent/i);
    expect(() =>
      renderContextTemplate('{{title}}', { ...variables, title: 'bad\u0000text' }),
    ).toThrow(/title/i);
    expect(() => renderContextTemplate('x'.repeat(100_001), variables)).toThrow(/body/i);
  });

  it('creates an account-scoped immutable library with no default side effects', () => {
    const library = createContextTemplateLibrary('account-1');
    expect(library).toMatchObject({
      version: 1,
      accountId: 'account-1',
      userTemplates: [],
      defaults: {},
    });
    expect(Object.isFrozen(library)).toBe(true);
    expect(Object.isFrozen(library.userTemplates)).toBe(true);
    expect(Object.isFrozen(library.defaults)).toBe(true);
  });

  it('creates, edits, renames, duplicates, archives, and defaults user templates', () => {
    let library = createContextTemplateLibrary('account-1');
    library = applyContextTemplateOperation(library, {
      kind: 'create',
      id: 'template-1',
      name: 'Release evidence',
      description: 'Capture release proof.',
      body: '# {{title}}\n\n## Evidence\n\n- ',
      now: 10,
    });
    expect(library.userTemplates[0]).toMatchObject({
      id: 'template-1',
      accountId: 'account-1',
      name: 'Release evidence',
      status: 'active',
      origin: 'user',
      createdAt: 10,
      updatedAt: 10,
    });

    library = applyContextTemplateOperation(library, {
      kind: 'edit',
      templateId: 'template-1',
      description: 'Capture verified release proof.',
      body: '# {{title}}\n\n## Verified evidence\n\n- ',
      now: 20,
    });
    library = applyContextTemplateOperation(library, {
      kind: 'rename',
      templateId: 'template-1',
      name: 'Verified release evidence',
      now: 30,
    });
    library = applyContextTemplateOperation(library, {
      kind: 'duplicate',
      templateId: 'template-1',
      id: 'template-2',
      name: 'Verified release evidence copy',
      now: 40,
    });
    library = applyContextTemplateOperation(library, {
      kind: 'set_default',
      slot: 'standard',
      templateId: 'template-2',
      now: 50,
    });
    expect(library.defaults).toEqual({ standard: 'template-2' });
    expect(library.userTemplates[1]).toMatchObject({
      id: 'template-2',
      name: 'Verified release evidence copy',
      createdAt: 40,
      updatedAt: 40,
    });

    library = applyContextTemplateOperation(library, {
      kind: 'archive',
      templateId: 'template-2',
      now: 60,
    });
    expect(library.userTemplates[1]?.status).toBe('archived');
    expect(library.defaults).toEqual({});
  });

  it('can set a shipped template as the daily default and clear it', () => {
    let library = createContextTemplateLibrary('account-1');
    library = applyContextTemplateOperation(library, {
      kind: 'set_default',
      slot: 'daily',
      templateId: 'daily-development-log',
      now: 10,
    });
    expect(library.defaults).toEqual({ daily: 'daily-development-log' });
    library = applyContextTemplateOperation(library, {
      kind: 'set_default',
      slot: 'daily',
      templateId: null,
      now: 20,
    });
    expect(library.defaults).toEqual({});
  });

  it('exports active templates as safe non-executable Markdown artifacts', () => {
    const exported = exportContextTemplate(
      createContextTemplateLibrary('account-1'),
      'github-pr-review',
    );
    expect(exported).toMatchObject({
      fileName: 'github-pr-review.md',
      mimeType: 'text/markdown',
      executable: false,
    });
    expect(exported.content).toContain('# GitHub PR Review');
    expect(Object.isFrozen(exported)).toBe(true);
  });

  it('fails closed on cross-account records, duplicate IDs/names, built-in mutation, and archived export', () => {
    const base = createContextTemplateLibrary('account-1');
    const scoped = applyContextTemplateOperation(base, {
      kind: 'create',
      id: 'scoped-template',
      name: 'Scoped example',
      description: 'Account-scoped example.',
      body: '# Scoped example',
      now: 1,
    });
    expect(() =>
      applyContextTemplateOperation(
        { ...scoped, accountId: 'account-2' },
        {
          kind: 'rename',
          templateId: 'scoped-template',
          name: 'Foreign rename',
          now: 2,
        },
      ),
    ).toThrow(/library|account/i);
    expect(() =>
      applyContextTemplateOperation(base, {
        kind: 'edit',
        templateId: 'bug-report',
        description: 'mutate builtin',
        body: '# changed',
        now: 1,
      }),
    ).toThrow(/built-in|user template/i);

    let library = applyContextTemplateOperation(base, {
      kind: 'create',
      id: 'template-1',
      name: 'Example',
      description: 'Example.',
      body: '# Example',
      now: 1,
    });
    expect(() =>
      applyContextTemplateOperation(library, {
        kind: 'create',
        id: 'template-1',
        name: 'Other',
        description: 'Other.',
        body: '# Other',
        now: 2,
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      applyContextTemplateOperation(library, {
        kind: 'create',
        id: 'template-2',
        name: 'example',
        description: 'Other.',
        body: '# Other',
        now: 2,
      }),
    ).toThrow(/duplicate/i);

    library = applyContextTemplateOperation(library, {
      kind: 'archive',
      templateId: 'template-1',
      now: 2,
    });
    expect(() => exportContextTemplate(library, 'template-1')).toThrow(/archived/i);

    expect(() =>
      applyContextTemplateOperation(
        {
          ...base,
          userTemplates: [
            {
              id: 'different-id',
              accountId: 'account-1',
              name: 'Bug Report',
              description: 'Ambiguous built-in collision.',
              body: '# Ambiguous',
              origin: 'user',
              status: 'active',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        { kind: 'set_default', slot: 'standard', templateId: null, now: 2 },
      ),
    ).toThrow(/duplicate/i);
  });

  it('rejects stale default decisions and duplicates that predate their source', () => {
    let library = createContextTemplateLibrary('account-1');
    library = applyContextTemplateOperation(library, {
      kind: 'set_default',
      slot: 'daily',
      templateId: 'daily-development-log',
      now: 100,
    });
    expect(() =>
      applyContextTemplateOperation(library, {
        kind: 'set_default',
        slot: 'daily',
        templateId: null,
        now: 99,
      }),
    ).toThrow(/operation time/i);

    library = applyContextTemplateOperation(createContextTemplateLibrary('account-1'), {
      kind: 'create',
      id: 'source-template',
      name: 'Source template',
      description: 'Current source.',
      body: '# Current source',
      now: 100,
    });
    expect(() =>
      applyContextTemplateOperation(library, {
        kind: 'duplicate',
        templateId: 'source-template',
        id: 'stale-copy',
        name: 'Stale copy',
        now: 99,
      }),
    ).toThrow(/operation time/i);
  });

  it('rejects oversized expansion before materializing the rendered string', () => {
    const replace = vi.spyOn(String.prototype, 'replace');
    let thrown: unknown;
    try {
      try {
        renderContextTemplate('{{title}}'.repeat(10_000), {
          title: 'x'.repeat(4_096),
        });
      } catch (error) {
        thrown = error;
      }
      const templateExpansionCalls = replace.mock.calls.filter(
        ([pattern]) => pattern instanceof RegExp && pattern.source === '\\{\\{([^{}]*)\\}\\}',
      ).length;
      expect(templateExpansionCalls).toBe(0);
    } finally {
      replace.mockRestore();
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/rendered body/i);
  });

  it('validates every supplied variable before cloning or rendering', () => {
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const replace = vi.spyOn(String.prototype, 'replace');
    let thrown: unknown;
    try {
      try {
        renderContextTemplate('{{title}}', {
          title: 'Valid title',
          active_agent: 'x'.repeat(100_000),
        });
      } catch (error) {
        thrown = error;
      }
      expect(clone).not.toHaveBeenCalled();
      const templateExpansionCalls = replace.mock.calls.filter(
        ([pattern]) => pattern instanceof RegExp && pattern.source === '\\{\\{([^{}]*)\\}\\}',
      ).length;
      expect(templateExpansionCalls).toBe(0);
    } finally {
      clone.mockRestore();
      replace.mockRestore();
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/active_agent/i);

    expect(() =>
      renderContextTemplate('{{title}}', {
        title: 'Valid title',
        active_agent: '',
      }),
    ).toThrow(/active_agent/i);
    expect(() =>
      renderContextTemplate('{{title}}', {
        title: 'Valid title',
        active_agent: 'bad\u0000agent',
      }),
    ).toThrow(/active_agent/i);
    expect(() =>
      renderContextTemplate('{{title}}', {
        title: 'x'.repeat(100_000),
      }),
    ).toThrow(/title/i);
  });

  it('rejects accessor, symbol, proxy, and decorated-array boundary values without invoking getters', () => {
    let getterCalls = 0;
    const operation = {
      kind: 'create' as const,
      id: 'template-1',
      name: 'Boundary example',
      get description() {
        getterCalls += 1;
        return 'Must not execute.';
      },
      body: '# Boundary',
      now: 1,
    };
    expect(() =>
      applyContextTemplateOperation(createContextTemplateLibrary('account-1'), operation),
    ).toThrow(/operation/i);
    expect(getterCalls).toBe(0);

    const symbolicVariables = { ...variables } as ContextTemplateVariables & Record<symbol, string>;
    symbolicVariables[Symbol('hidden')] = 'opaque';
    expect(() => renderContextTemplate('{{title}}', symbolicVariables)).toThrow(/variables/i);

    expect(() => renderContextTemplate('{{title}}', new Proxy(variables, {}))).toThrow(
      /variables/i,
    );

    const userTemplates: unknown[] & { extra?: string } = [];
    userTemplates.extra = 'not a template';
    expect(() =>
      applyContextTemplateOperation(
        {
          version: 1,
          accountId: 'account-1',
          updatedAt: 0,
          userTemplates: userTemplates as never,
          defaults: {},
        },
        { kind: 'set_default', slot: 'daily', templateId: null, now: 1 },
      ),
    ).toThrow(/library/i);
  });
});
