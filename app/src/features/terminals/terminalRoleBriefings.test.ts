import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@/types';

const fsMocks = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@/lib/fs', () => ({
  readTextFile: fsMocks.readTextFile,
  writeTextFile: fsMocks.writeTextFile,
}));

vi.mock('@/lib/db', () => ({
  db: {
    settings: {},
    sync_queue: {},
  },
  projectRepo: {
    getById: vi.fn(async () => undefined),
  },
}));

import {
  clearTerminalRoleBriefings,
  getTerminalRoleBriefing,
  setTerminalRoleBriefing,
} from './terminalRoleBriefings';
import { deliverAgentTerminalContext } from './agentPromptDelivery';
import { useAgentStore } from '@/stores/agents';
import { useTerminalTranscriptStore } from './transcriptStore';

function makeAgent(slug: string, name: string, system_prompt: string): Agent {
  return {
    id: `agent_${slug}`,
    slug,
    name,
    description: '',
    system_prompt,
    model: { provider: 'mock', model: 'mock-default' },
    tools_allowed: ['*'],
    memory_scope: 'project',
    temperature: 0.7,
    max_output_tokens: 4096,
    color_hue: 10,
    capabilities: [],
    builtin: true,
    created_at: 1,
    updated_at: 1,
  } as unknown as Agent;
}

beforeEach(() => {
  window.localStorage.clear();
  fsMocks.readTextFile.mockReset();
  fsMocks.writeTextFile.mockReset();
  useAgentStore.setState({ agents: {}, runStates: {}, verbs: {}, tokens: {} });
  useTerminalTranscriptStore.getState().reset();
});

describe('terminalRoleBriefings store', () => {
  it('stores and retrieves briefings per project and slug', () => {
    setTerminalRoleBriefing('proj_a', 'code-reviewer', 'you are a code reviewer');
    expect(getTerminalRoleBriefing('proj_a', 'code-reviewer')).toBe('you are a code reviewer');
    expect(getTerminalRoleBriefing('proj_b', 'code-reviewer')).toBeNull();
  });

  it('falls back to a global briefing when no project entry exists', () => {
    setTerminalRoleBriefing(null, 'code-agent', 'find vulnerabilities');
    expect(getTerminalRoleBriefing('proj_x', 'code-agent')).toBe('find vulnerabilities');
  });

  it('truncates oversized prompts and ignores empty input', () => {
    setTerminalRoleBriefing(null, 'big', 'x'.repeat(10_000));
    expect(getTerminalRoleBriefing(null, 'big')!.length).toBeLessThanOrEqual(4000);
    setTerminalRoleBriefing(null, '', 'nope');
    setTerminalRoleBriefing(null, 'empty', '   ');
    expect(getTerminalRoleBriefing(null, 'empty')).toBeNull();
  });

  it('survives corrupted storage', () => {
    window.localStorage.setItem('jarvis-terminal-role-briefings-v1', '{corrupt');
    expect(getTerminalRoleBriefing(null, 'anything')).toBeNull();
    setTerminalRoleBriefing(null, 'recovered', 'works again');
    expect(getTerminalRoleBriefing(null, 'recovered')).toBe('works again');
  });

  it('clears per-project entries without touching others', () => {
    setTerminalRoleBriefing('proj_a', 'r1', 'a');
    setTerminalRoleBriefing('proj_b', 'r1', 'b');
    clearTerminalRoleBriefings('proj_a');
    expect(getTerminalRoleBriefing('proj_a', 'r1')).toBeNull();
    expect(getTerminalRoleBriefing('proj_b', 'r1')).toBe('b');
  });
});

describe('role briefing delivery through AGENTS.md', () => {
  const CWD = 'C:\\repo';
  const AGENTS = 'C:\\repo\\AGENTS.md';

  const notFound = (path: string) => ({
    ok: false as const,
    error: { code: 'not_found' as const },
    path,
  });
  const okWrite = (path: string) => ({ ok: true as const, path });

  function writtenContent(path: string): string | undefined {
    const call = [...fsMocks.writeTextFile.mock.calls].reverse().find((c) => c[0] === path);
    return call?.[1] as string | undefined;
  }

  it('appends the orchestrated role prompt to the managed briefing block', async () => {
    useAgentStore
      .getState()
      .registerAgent(makeAgent('code-reviewer', 'Code Reviewer', 'Base reviewer rules.'));
    setTerminalRoleBriefing('proj_ctx', 'code-reviewer', 'you are a code reviewer');
    fsMocks.readTextFile.mockImplementation(async (path: string) => notFound(path));
    fsMocks.writeTextFile.mockImplementation(async (path: string) => okWrite(path));

    const result = await deliverAgentTerminalContext({
      cwd: CWD,
      agentSlug: 'code-reviewer',
      projectId: 'proj_ctx',
    });

    expect(result.ok).toBe(true);
    const agentsMd = writtenContent(AGENTS);
    expect(agentsMd).toContain('Base reviewer rules.');
    expect(agentsMd).toContain('## Assigned task');
    expect(agentsMd).toContain('you are a code reviewer');
  });

  it('delivers the role prompt even for slugs without a registered agent', async () => {
    setTerminalRoleBriefing(null, 'code-agent', 'please find any security vulnerabilities');
    fsMocks.readTextFile.mockImplementation(async (path: string) => notFound(path));
    fsMocks.writeTextFile.mockImplementation(async (path: string) => okWrite(path));

    const result = await deliverAgentTerminalContext({
      cwd: CWD,
      agentSlug: 'code-agent',
      projectId: null,
    });

    expect(result.ok).toBe(true);
    expect(writtenContent(AGENTS)).toContain('please find any security vulnerabilities');
  });

  it('leaves the briefing unchanged when no role prompt is stored', async () => {
    useAgentStore.getState().registerAgent(makeAgent('coder', 'Coder', 'Plain prompt.'));
    fsMocks.readTextFile.mockImplementation(async (path: string) => notFound(path));
    fsMocks.writeTextFile.mockImplementation(async (path: string) => okWrite(path));

    await deliverAgentTerminalContext({ cwd: CWD, agentSlug: 'coder', projectId: null });

    const agentsMd = writtenContent(AGENTS);
    expect(agentsMd).toContain('Plain prompt.');
    expect(agentsMd).not.toContain('## Assigned task');
  });
});
