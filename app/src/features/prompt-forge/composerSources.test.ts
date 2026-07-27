import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';
import {
  buildPromptForgeAttachmentSnapshots,
  collectPromptForgeComposerSources,
} from './composerSources';

describe('Prompt Forge Composer sources', () => {
  it('collects explicit files, scoped terminal output, recent chat, skills, plugins, and agents', async () => {
    const readFile = vi.fn(async (path: string) => ({
      ok: true as const,
      path,
      content: 'export const theme = "cyan";',
    }));
    const messages = [
      {
        id: 'message-1',
        chat_id: 'chat-1',
        role: 'user',
        parts: [{ kind: 'text', text: 'Match the current VibeSpace theme.' }],
        created_at: 80,
        updated_at: 81,
      },
    ] as Message[];
    const sources = await collectPromptForgeComposerSources(
      {
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        files: ['C:\\workspace\\app\\src\\theme.ts'],
        terminals: [{ sessionId: 'session-1', projectId: 'project-1', label: 'Dev server' }],
        terminalSessions: {
          'session-1': {
            sessionId: 'session-1',
            projectId: 'project-1',
            agentSlug: null,
            command: 'npm run dev',
            text: 'Local server ready on port 4173.',
            lastWriteAt: 90,
            bytesSeen: 32,
          },
        },
        messages,
        plugins: [
          {
            id: 'github',
            label: 'GitHub',
            description: 'Connected repository tools.',
            verified: true,
          },
        ],
        skills: [
          {
            id: 'frontend-design',
            label: 'Frontend design',
            description: 'Intentional interface design guidance.',
            verified: true,
          },
        ],
        agents: [
          {
            id: 'jarvis',
            label: 'Jarvis',
            description: 'Primary VibeSpace assistant.',
            verified: true,
          },
        ],
        now: 100,
        readFile,
      },
      new AbortController().signal,
    );

    expect(readFile).toHaveBeenCalledWith('C:\\workspace\\app\\src\\theme.ts', 12_000, {
      root: 'C:\\workspace',
      strictProjectBoundary: true,
    });
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'project_file', verified: true, explicit: true }),
        expect.objectContaining({
          kind: 'terminal',
          content: expect.stringContaining('Transcript availability: captured'),
        }),
        expect.objectContaining({ kind: 'chat', content: 'Match the current VibeSpace theme.' }),
        expect.objectContaining({ kind: 'plugin', label: 'GitHub' }),
        expect.objectContaining({ kind: 'skill', label: 'Frontend design' }),
        expect.objectContaining({ kind: 'agent', label: 'Jarvis' }),
      ]),
    );
    expect(sources.find((source) => source.kind === 'terminal')?.content).toContain(
      'Local server ready on port 4173.',
    );
  });

  it('collects bounded active agents and only relevant connected capabilities, tools, and schedules', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        draft:
          'Have Athena use GitHub and repo.search with my release workflow, then account for the launch schedule.',
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        activeAgents: [
          {
            id: 'athena',
            label: 'Athena',
            description: 'Active research agent. Status: thinking. Capabilities: research.',
            verified: true,
            observedAt: 98,
          },
          {
            id: 'vulcan',
            label: 'Vulcan',
            description: 'Active unrelated accounting agent. Status: thinking.',
            verified: true,
            observedAt: 98,
          },
        ],
        connectedPlugins: [
          {
            id: 'github',
            label: 'GitHub',
            description: 'Connected repository and pull request tools.',
            verified: true,
            observedAt: 97,
          },
          {
            id: 'gmail',
            label: 'Gmail',
            description: 'Connected mailbox tools.',
            verified: true,
            observedAt: 97,
          },
        ],
        mcpTools: [
          {
            id: 'repository.repo.search',
            label: 'repo.search',
            description: 'Healthy external MCP repository search tool.',
            verified: true,
            observedAt: 96,
          },
          {
            id: 'database.db.migrate',
            label: 'db.migrate',
            description: 'Healthy external MCP database migration tool.',
            verified: true,
            observedAt: 96,
          },
        ],
        appActions: [
          {
            id: 'github.pull-request.read',
            label: 'Read pull request',
            description: 'Read GitHub pull request metadata. Risk: read-only.',
            verified: true,
            observedAt: 95,
          },
          {
            id: 'calendar.event.create',
            label: 'Create calendar event',
            description: 'Create a calendar event.',
            verified: true,
            observedAt: 95,
          },
        ],
        customTools: [
          {
            id: 'release-workflow',
            label: 'Release workflow',
            description: 'Run the saved release verification workflow.',
            verified: true,
            observedAt: 94,
          },
          {
            id: 'invoice-export',
            label: 'Invoice export',
            description: 'Export monthly invoices.',
            verified: true,
            observedAt: 94,
          },
        ],
        tasks: [
          {
            id: 'launch',
            title: 'Launch schedule',
            status: 'open',
            priority: 'high',
            projectId: 'project-1',
            scheduledFor: 120,
            updatedAt: 93,
          },
          {
            id: 'other-project',
            title: 'Launch schedule for another project',
            status: 'open',
            priority: 'high',
            projectId: 'project-2',
            scheduledFor: 120,
            updatedAt: 93,
          },
          {
            id: 'invoice',
            title: 'Review invoices',
            status: 'open',
            priority: 'normal',
            projectId: 'project-1',
            updatedAt: 92,
          },
        ],
        now: 100,
      },
      new AbortController().signal,
    );

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'agent', label: 'Athena', explicit: false }),
        expect.objectContaining({ kind: 'plugin', label: 'GitHub', explicit: false }),
        expect.objectContaining({ kind: 'mcp', label: 'repo.search', explicit: false }),
        expect.objectContaining({ kind: 'action', label: 'Read pull request', explicit: false }),
        expect.objectContaining({ kind: 'tool', label: 'Release workflow', explicit: false }),
        expect.objectContaining({ kind: 'schedule', label: 'Launch schedule', explicit: false }),
      ]),
    );
    expect(sources.some((source) => source.label === 'Gmail')).toBe(false);
    expect(sources.some((source) => source.label === 'Vulcan')).toBe(false);
    expect(sources.some((source) => source.label === 'db.migrate')).toBe(false);
    expect(sources.some((source) => source.label === 'Create calendar event')).toBe(false);
    expect(sources.some((source) => source.label === 'Invoice export')).toBe(false);
    expect(sources.some((source) => source.id.includes('other-project'))).toBe(false);
    expect(sources.some((source) => source.label === 'Review invoices')).toBe(false);
  });

  it('admits catalog sources for explicit category intent without treating ordinary prose as intent', async () => {
    const base = {
      accountId: 'account-a',
      projectId: 'project-1',
      projectRoot: 'C:\\workspace',
      chatId: 'chat-1',
      files: [],
      terminals: [],
      terminalSessions: {},
      messages: [],
      plugins: [],
      skills: [],
      agents: [],
      connectedPlugins: [
        {
          id: 'github',
          label: 'GitHub',
          description: 'Connected repository tools.',
          verified: true,
        },
      ],
      mcpTools: [
        {
          id: 'repository.repo.search',
          label: 'repo.search',
          description: 'Healthy external MCP repository search tool.',
          verified: true,
        },
      ],
      appActions: [
        {
          id: 'file.search',
          label: 'Search files',
          description: 'Search the app file index.',
          verified: true,
        },
      ],
      customTools: [
        {
          id: 'release-workflow',
          label: 'Release workflow',
          description: 'Saved release workflow.',
          verified: true,
        },
      ],
      tasks: [
        {
          id: 'launch',
          title: 'Launch release',
          status: 'open',
          priority: 'high',
          projectId: 'project-1',
          updatedAt: 90,
        },
      ],
      now: 100,
    } as const;
    const ordinary = await collectPromptForgeComposerSources(
      { ...base, draft: 'Improve this sentence with a clear action verb.' },
      new AbortController().signal,
    );
    expect(ordinary).toEqual([]);

    const explicit = await collectPromptForgeComposerSources(
      {
        ...base,
        draft:
          'List the connected plugins, external MCP tools, available app actions, custom tools, and current tasks.',
      },
      new AbortController().signal,
    );
    expect(new Set(explicit.map((source) => source.kind))).toEqual(
      new Set(['plugin', 'mcp', 'action', 'tool', 'task']),
    );
  });

  it('does not admit another project task when no project is active', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: null,
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        draft: 'List the current tasks.',
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        tasks: [
          {
            id: 'workspace-task',
            title: 'Workspace task',
            status: 'open',
            priority: 'normal',
            projectId: null,
            updatedAt: 90,
          },
          {
            id: 'other-project-task',
            title: 'Other project task',
            status: 'open',
            priority: 'normal',
            projectId: 'project-b',
            updatedAt: 91,
          },
        ],
        now: 100,
      },
      new AbortController().signal,
    );

    expect(sources).toEqual([expect.objectContaining({ kind: 'task', label: 'Workspace task' })]);
    expect(sources.some((source) => source.label === 'Other project task')).toBe(false);
  });

  it('collects bounded current chat, project, relevant profile, and relevant activity context', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        draft:
          'Rewrite this in my concise communication style and account for the latest failed build status.',
        chat: {
          title: 'VibeSpace launch',
          mode: 'code',
          interactionMode: 'ask',
          observedAt: 96,
        },
        project: {
          id: 'project-1',
          name: 'VibeSpace',
          root: 'C:\\workspace',
          systemPromptContext: 'Use strict TypeScript and keep the implementation local-first.',
          noContextMode: false,
          observedAt: 95,
        },
        profile: {
          accountId: 'account-a',
          markdown:
            '## Communication Style\n\nPrefer concise answers with explicit evidence.\n\n## Home Address\n\nPRIVATE_HOME_ADDRESS\n\n## Personal Notes\n\nPRIVATE_UNRELATED_PROFILE_SECTION',
          source: 'manual',
          observedAt: 94,
        },
        activity: [
          {
            id: 'activity-1',
            kind: 'tool',
            status: 'error',
            title: 'Build failed',
            subtitle: 'Typecheck',
            detail: 'TypeScript reported one invalid property.',
            diff: 'DO_NOT_INCLUDE_RAW_DIFF',
            ts: 93,
          },
          {
            id: 'activity-2',
            kind: 'file',
            status: 'done',
            title: 'Updated unrelated invoice',
            ts: 92,
          },
        ],
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'chat',
          label: 'Current chat',
          content: expect.stringContaining('VibeSpace launch'),
        }),
        expect.objectContaining({
          kind: 'project',
          label: 'Current project',
          content: expect.stringContaining('Use strict TypeScript'),
        }),
        expect.objectContaining({
          kind: 'profile',
          label: 'Relevant All About Me preferences',
          content: expect.stringContaining('Prefer concise answers'),
        }),
        expect.objectContaining({
          kind: 'activity',
          label: 'Build failed',
          content: expect.stringContaining('Status: error'),
        }),
      ]),
    );
    expect(sources.some((source) => source.label === 'Updated unrelated invoice')).toBe(false);
    const combined = sources.map((source) => source.content).join('\n');
    expect(combined).not.toContain('DO_NOT_INCLUDE_RAW_DIFF');
    expect(combined).not.toContain('PRIVATE_HOME_ADDRESS');
    expect(combined).not.toContain('PRIVATE_UNRELATED_PROFILE_SECTION');
  });

  it('fails closed for cross-account profile context and disabled project instructions', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        draft: 'Rewrite this in my personal style.',
        project: {
          id: 'project-1',
          name: 'VibeSpace',
          root: 'C:\\workspace',
          systemPromptContext: 'RESTRICTED_PROJECT_PROMPT',
          noContextMode: true,
          observedAt: 95,
        },
        profile: {
          accountId: 'account-b',
          markdown: 'CROSS_ACCOUNT_PROFILE',
          source: 'manual',
          observedAt: 94,
        },
        activity: [
          {
            id: 'activity-unrelated',
            kind: 'tool',
            status: 'error',
            title: 'Database migration failed',
            detail: 'UNRELATED_ACTIVITY_DETAIL',
            ts: 93,
          },
        ],
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );

    const combined = sources.map((source) => source.content).join('\n');
    expect(sources).toEqual([
      expect.objectContaining({
        kind: 'project',
        content: expect.stringContaining('Context instructions: disabled'),
      }),
    ]);
    expect(combined).not.toContain('RESTRICTED_PROJECT_PROMPT');
    expect(combined).not.toContain('CROSS_ACCOUNT_PROFILE');
    expect(combined).not.toContain('UNRELATED_ACTIVITY_DETAIL');
  });

  it('does not disclose a same-account profile without direct profile relevance', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: null,
        projectRoot: '',
        chatId: 'chat-1',
        draft: 'Explain why the build failed.',
        profile: {
          accountId: 'account-a',
          markdown: 'PRIVATE_PROFILE_WITH_UNRELATED_PREFERENCES',
          source: 'manual',
          observedAt: 94,
        },
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );

    expect(sources).toEqual([]);

    const directlyRelevant = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: null,
        projectRoot: '',
        chatId: 'chat-1',
        draft: 'Make this concise.',
        profile: {
          accountId: 'account-a',
          markdown:
            '## Communication Style\n\nPrefer concise answers.\n\n## Personal Notes\n\nPRIVATE_UNRELATED_PROFILE_SECTION',
          source: 'manual',
          observedAt: 94,
        },
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );
    expect(directlyRelevant).toEqual([
      expect.objectContaining({
        kind: 'profile',
        content: expect.stringContaining('Prefer concise answers'),
      }),
    ]);
    expect(directlyRelevant[0]?.content).not.toContain('PRIVATE_UNRELATED_PROFILE_SECTION');

    const preferredAddress = await collectPromptForgeComposerSources(
      {
        accountId: 'account-a',
        projectId: null,
        projectRoot: '',
        chatId: 'chat-1',
        draft: 'Write this like me.',
        profile: {
          accountId: 'account-a',
          markdown:
            '## How should Jarvis address you\n\nCall me Viper.\n\n## Home Address\n\nPRIVATE_HOME_ADDRESS',
          source: 'manual',
          observedAt: 94,
        },
        files: [],
        terminals: [],
        terminalSessions: {},
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );
    expect(preferredAddress).toEqual([
      expect.objectContaining({
        kind: 'profile',
        content: expect.stringContaining('Call me Viper.'),
      }),
    ]);
    expect(preferredAddress[0]?.content).not.toContain('PRIVATE_HOME_ADDRESS');
  });

  it('requires explicit activity intent or event overlap', async () => {
    const activity = [
      {
        id: 'activity-1',
        kind: 'tool',
        status: 'done',
        title: 'Unrelated database migration',
        detail: 'Updated a schema.',
        ts: 90,
      },
    ];
    const baseInput = {
      projectId: 'project-1',
      projectRoot: 'C:\\workspace',
      chatId: 'chat-1',
      activity,
      files: [],
      terminals: [],
      terminalSessions: {},
      messages: [],
      plugins: [],
      skills: [],
      agents: [],
      now: 100,
    };
    const sources = await collectPromptForgeComposerSources(
      {
        ...baseInput,
        draft: 'Summarize the recent changes made to this paragraph.',
      },
      new AbortController().signal,
    );
    expect(sources).toEqual([]);

    const explicitActivity = await collectPromptForgeComposerSources(
      {
        ...baseInput,
        draft: 'Summarize recent JARVIS activity.',
      },
      new AbortController().signal,
    );
    expect(explicitActivity).toEqual([
      expect.objectContaining({
        kind: 'activity',
        label: 'Unrelated database migration',
        whySelected: 'The draft requested recent activity.',
      }),
    ]);
  });

  it('reports canonical terminal execution status separately from transcript availability', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        files: [],
        terminals: [
          { sessionId: 'running', projectId: 'project-1' },
          { sessionId: 'exited', projectId: 'project-1' },
          { sessionId: 'failed', projectId: 'project-1' },
        ],
        terminalStates: [
          {
            sessionId: 'running',
            projectId: 'project-1',
            status: 'running',
            observedAt: 90,
          },
          {
            sessionId: 'exited',
            projectId: 'project-1',
            status: 'exited',
            exitCode: 0,
            observedAt: 90,
          },
          {
            sessionId: 'failed',
            projectId: 'project-1',
            status: 'exited',
            exitCode: 2,
            observedAt: 90,
          },
        ],
        terminalSessions: {
          running: {
            sessionId: 'running',
            projectId: 'project-1',
            agentSlug: null,
            command: 'npm run dev',
            text: 'Ready.',
            lastWriteAt: 90,
            bytesSeen: 6,
          },
          exited: {
            sessionId: 'exited',
            projectId: 'project-1',
            agentSlug: null,
            command: 'npm test',
            text: 'Passed.',
            lastWriteAt: 90,
            bytesSeen: 7,
          },
          failed: {
            sessionId: 'failed',
            projectId: 'project-1',
            agentSlug: null,
            command: 'npm test',
            text: 'Failed.',
            lastWriteAt: 90,
            bytesSeen: 7,
          },
        },
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );

    expect(sources.map((source) => source.content)).toEqual([
      expect.stringContaining('Execution status: running'),
      expect.stringContaining('Execution status: exited'),
      expect.stringContaining('Execution status: failed (exit code 2)'),
    ]);
    expect(
      sources.every((source) => source.content.includes('Transcript availability: captured')),
    ).toBe(true);
  });

  it('preserves the newest terminal output when the transcript reaches the source budget', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        files: [],
        terminals: [{ sessionId: 'session-large', projectId: 'project-1' }],
        terminalSessions: {
          'session-large': {
            sessionId: 'session-large',
            projectId: 'project-1',
            agentSlug: null,
            command: 'npm test',
            text: `${'x'.repeat(12_000)}LATEST_TERMINAL_OUTPUT`,
            lastWriteAt: 90,
            bytesSeen: 12_022,
          },
        },
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
      },
      new AbortController().signal,
    );

    expect(sources).toHaveLength(1);
    expect(sources[0]?.content).toContain('LATEST_TERMINAL_OUTPUT');
    expect(sources[0]?.content.length).toBeLessThanOrEqual(12_000);
  });

  it('marks unreadable or cross-project evidence unverified and obeys cancellation', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        files: ['C:\\workspace\\missing.ts'],
        terminals: [{ sessionId: 'session-2', projectId: 'project-2' }],
        terminalSessions: {
          'session-2': {
            sessionId: 'session-2',
            projectId: 'project-2',
            agentSlug: null,
            command: 'npm test',
            text: 'CROSS_PROJECT_TERMINAL_SECRET',
            lastWriteAt: 90,
            bytesSeen: 29,
          },
        },
        messages: [],
        plugins: [],
        skills: [],
        agents: [],
        now: 100,
        readFile: async (path) => ({
          ok: false,
          path,
          error: { code: 'not_found' },
        }),
      },
      new AbortController().signal,
    );
    expect(sources).toEqual([
      expect.objectContaining({ kind: 'project_file', verified: false }),
      expect.objectContaining({
        kind: 'terminal',
        verified: false,
        content: expect.stringContaining('cross-project and excluded'),
      }),
    ]);
    expect(sources.map((source) => source.content).join('\n')).not.toContain(
      'CROSS_PROJECT_TERMINAL_SECRET',
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      collectPromptForgeComposerSources(
        {
          projectId: null,
          projectRoot: '',
          chatId: 'chat-1',
          files: [],
          terminals: [],
          terminalSessions: {},
          messages: [],
          plugins: [],
          skills: [],
          agents: [],
          now: 100,
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('creates stable bounded snapshots for every Composer attachment type', () => {
    const first = buildPromptForgeAttachmentSnapshots({
      files: ['C:\\workspace\\SPEC.md'],
      images: [{ id: 'image-1', label: 'reference.png', reference: 'image://image-1' }],
      terminals: [{ sessionId: 'session-1', label: 'Build pane' }],
      plugins: [{ id: 'github', label: 'GitHub' }],
      contexts: [{ id: 'node-1', label: 'Architecture', reference: 'context://map-1/node-1' }],
      skills: [{ id: 'frontend-design', label: 'Frontend design' }],
      agents: [{ id: 'jarvis', label: 'Jarvis' }],
    });
    const second = buildPromptForgeAttachmentSnapshots({
      files: ['C:\\workspace\\SPEC.md'],
      images: [{ id: 'image-1', label: 'reference.png', reference: 'image://image-1' }],
      terminals: [{ sessionId: 'session-1', label: 'Build pane' }],
      plugins: [{ id: 'github', label: 'GitHub' }],
      contexts: [{ id: 'node-1', label: 'Architecture', reference: 'context://map-1/node-1' }],
      skills: [{ id: 'frontend-design', label: 'Frontend design' }],
      agents: [{ id: 'jarvis', label: 'Jarvis' }],
    });
    expect(first).toEqual(second);
    expect(first.map((item) => item.kind)).toEqual([
      'file',
      'image',
      'terminal',
      'plugin',
      'context_map',
      'skill',
      'agent',
    ]);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
  });
});
