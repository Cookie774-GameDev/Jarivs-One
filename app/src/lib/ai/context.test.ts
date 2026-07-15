import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  readTextFileSample: vi.fn(),
  listDirectory: vi.fn(),
  writeTextFile: vi.fn(),
  getStoredProjectRoot: vi.fn(),
  getJarvisProjectsDir: vi.fn(),
  loadCoordinationSummary: vi.fn(),
  loadJarvisCoordinationSnapshot: vi.fn(),
  summarizeJarvisChatCoordination: vi.fn(),
}));

vi.mock('@/lib/fs', () => ({
  readTextFileSample: fsMocks.readTextFileSample,
  listDirectory: fsMocks.listDirectory,
  writeTextFile: fsMocks.writeTextFile,
}));

vi.mock('@/lib/db', () => ({
  projectRepo: { getById: vi.fn() },
}));

vi.mock('@/features/files/projectFiles', () => ({
  getStoredProjectRoot: fsMocks.getStoredProjectRoot,
  getJarvisProjectsDir: fsMocks.getJarvisProjectsDir,
}));

vi.mock('@/features/terminals/agentCoordinationClient', () => ({
  loadCoordinationSummary: fsMocks.loadCoordinationSummary,
}));

vi.mock('@/features/jarvis-interaction/coordination', () => ({
  loadJarvisCoordinationSnapshot: fsMocks.loadJarvisCoordinationSnapshot,
  summarizeJarvisChatCoordination: fsMocks.summarizeJarvisChatCoordination,
}));

import { useTerminalTranscriptStore } from '@/features/terminals/transcriptStore';
import {
  getExplicitFilesBlock,
  getExplicitTerminalBlock,
  getJarvisCoordinationContextBlock,
  extractExplicitDestination,
  formatResolvedJarvisContext,
  rememberConversationDestination,
  resolveJarvisContext,
} from './context';

describe('AI explicit file context safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalTranscriptStore.getState().reset();
    fsMocks.getStoredProjectRoot.mockReturnValue('');
    fsMocks.getJarvisProjectsDir.mockResolvedValue('C:\\Jarvis\\Projects');
    fsMocks.loadCoordinationSummary.mockResolvedValue('');
    fsMocks.loadJarvisCoordinationSnapshot.mockResolvedValue({
      version: 1,
      projectRoot: '',
      generatedAt: '',
      agents: [],
      locks: [],
      events: [],
    });
    fsMocks.summarizeJarvisChatCoordination.mockReturnValue('');
  });

  it('remembers a conversation folder and prefers a newer active project', async () => {
    rememberConversationDestination('chat_1', 'Put future files here:\nC:\\Users\\viper\\projects\\FarmLife');
    expect(extractExplicitDestination('Use `C:\\Users\\viper\\projects\\FarmLife`')).toBe(
      'C:\\Users\\viper\\projects\\FarmLife',
    );
    const remembered = await resolveJarvisContext({
      projectId: null,
      chatId: 'chat_1',
      currentText: 'Create a roadmap file.',
    });
    expect(remembered.preferredDestination).toBe('C:\\Users\\viper\\projects\\FarmLife');

    fsMocks.getStoredProjectRoot.mockReturnValue('C:\\Users\\viper\\projects\\NewProject');
    const active = await resolveJarvisContext({
      projectId: 'project_new' as never,
      chatId: 'chat_1',
      currentText: 'Create a roadmap file.',
    });
    expect(active.preferredDestination).toBe('C:\\Users\\viper\\projects\\NewProject');
    expect(formatResolvedJarvisContext(active)).toContain('Preferred new-file destination');
  });

  it('samples attached text files instead of reading them in full', async () => {
    fsMocks.readTextFileSample.mockResolvedValue({
      ok: true,
      path: 'C:\\repo\\large.log',
      content: 'a'.repeat(20_000),
    });

    const block = await getExplicitFilesBlock(['C:\\repo\\large.log']);

    expect(fsMocks.readTextFileSample).toHaveBeenCalledWith('C:\\repo\\large.log', 64 * 1024, { root: undefined });
    expect(block).toContain('C:\\repo\\large.log (truncated)');
    expect(block.length).toBeLessThan(18_000);
  });

  it('adds media attachments as metadata without reading binary bytes', async () => {
    const block = await getExplicitFilesBlock([
      'C:\\repo\\assets\\hero.png',
      'C:\\repo\\clips\\demo.mp4',
    ]);

    expect(fsMocks.readTextFileSample).not.toHaveBeenCalled();
    expect(block).toContain('Media file metadata only (image).');
    expect(block).toContain('Media file metadata only (video).');
    expect(block).toContain('Binary bytes were not read into the prompt.');
  });

  it('frames attached terminal transcripts as evidence instead of completion guesses', () => {
    const store = useTerminalTranscriptStore.getState();
    store.registerSession('pty_done', {
      paneId: 'pane_terminal',
      projectId: 'project_a',
      agentSlug: 'coder',
      command: 'opencode',
    });
    store.appendOutput('pty_done', 'Running tests...\nAll tests passed\n');
    store.setCurrentInput('pty_done', 'npm run build');

    const block = getExplicitTerminalBlock([{
      sessionId: 'pty_done',
      paneId: 'pane_terminal',
      label: 'opencode',
      agentSlug: 'coder',
    }]);

    expect(block).toContain('Treat the transcript as evidence, not proof of completion.');
    expect(block).toContain('Never say you lack authorization');
    expect(block).toContain('only say yes when the visible output clearly shows completion');
    expect(block).toContain('current_input="npm run build"');
    expect(block).toContain('All tests passed');
  });

  it('builds bounded Jarvis coordination context from the stored project root', async () => {
    fsMocks.getStoredProjectRoot.mockReturnValue('C:\\repo');
    fsMocks.loadCoordinationSummary.mockResolvedValue(
      `## Coordination Summary\n${'agent status '.repeat(500)}`,
    );

    const block = await getJarvisCoordinationContextBlock('project_a' as never);

    expect(fsMocks.loadCoordinationSummary).toHaveBeenCalledWith('C:\\repo');
    expect(fsMocks.loadJarvisCoordinationSnapshot).toHaveBeenCalledWith('C:\\repo');
    expect(block).toContain('Jarvis chat coordination awareness');
    expect(block).toContain('Coordination Summary');
    expect(block).toContain('coordination summary truncated');
    expect(block.length).toBeLessThan(3_700);
  });

  it('merges chat multitask coordination into the same context block for all chats', async () => {
    fsMocks.getStoredProjectRoot.mockReturnValue('C:\\repo');
    fsMocks.loadCoordinationSummary.mockResolvedValue('## Terminal agents\n- builder idle');
    fsMocks.loadJarvisCoordinationSnapshot.mockResolvedValue({
      version: 1,
      projectRoot: 'C:\\repo',
      generatedAt: '2026-06-24T12:00:00.000Z',
      agents: [{ agentId: 'ja_1', name: 'Multitask A', status: 'thinking' }],
      locks: [],
      events: [],
    });
    fsMocks.summarizeJarvisChatCoordination.mockReturnValue(
      '## Chat multitask / subagent coordination\n- Multitask A [thinking]',
    );

    const block = await getJarvisCoordinationContextBlock('project_a' as never);

    expect(block).toContain('Terminal agents');
    expect(block).toContain('Chat multitask / subagent coordination');
    expect(block).toContain('Multitask A');
    expect(block).toContain('all chats');
  });
});
