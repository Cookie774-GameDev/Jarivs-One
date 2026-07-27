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
          content: 'Local server ready on port 4173.',
        }),
        expect.objectContaining({ kind: 'chat', content: 'Match the current VibeSpace theme.' }),
        expect.objectContaining({ kind: 'plugin', label: 'GitHub' }),
        expect.objectContaining({ kind: 'skill', label: 'Frontend design' }),
        expect.objectContaining({ kind: 'agent', label: 'Jarvis' }),
      ]),
    );
  });

  it('marks unreadable or cross-project evidence unverified and obeys cancellation', async () => {
    const sources = await collectPromptForgeComposerSources(
      {
        projectId: 'project-1',
        projectRoot: 'C:\\workspace',
        chatId: 'chat-1',
        files: ['C:\\workspace\\missing.ts'],
        terminals: [{ sessionId: 'session-2', projectId: 'project-2' }],
        terminalSessions: {},
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
      expect.objectContaining({ kind: 'terminal', verified: false }),
    ]);

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
