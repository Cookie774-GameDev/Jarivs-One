import { beforeEach, describe, expect, it } from 'vitest';
import { parseOrchestrationRoles } from './registry';
import { resolveAction } from './runner';
import { inferFallbackActionProposals } from './fallbackActions';
import { useTerminalCommandQueue } from '@/features/terminals/terminalCommandQueue';
import {
  clearTerminalRoleBriefings,
  getTerminalRoleBriefing,
} from '@/features/terminals/terminalRoleBriefings';

const EXAMPLE_PHRASE =
  'Close all terminals in project, open 10 new terminals, open Claude code in each one, ' +
  'and then put five as a code agent and another five as a code reviewer agent. ' +
  'For the five code reviewer agents, type this prompt: you are a code reviewer. ' +
  'For the code agents, type this prompt: please find any security vulnerabilities.';

describe('parseOrchestrationRoles', () => {
  it('accepts a valid two-group payload', () => {
    const result = parseOrchestrationRoles(
      JSON.stringify([
        { count: 5, agentSlug: 'code-agent', prompt: 'please find any security vulnerabilities' },
        { count: 5, agentSlug: 'code-reviewer', prompt: 'you are a code reviewer' },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0]).toMatchObject({ count: 5, agentSlug: 'code-agent' });
    }
  });

  it('fails closed on malformed payloads', () => {
    expect(parseOrchestrationRoles(undefined).ok).toBe(false);
    expect(parseOrchestrationRoles('not json').ok).toBe(false);
    expect(parseOrchestrationRoles('[]').ok).toBe(false);
    expect(parseOrchestrationRoles(JSON.stringify([{ count: 0, agentSlug: 'x' }])).ok).toBe(false);
    expect(parseOrchestrationRoles(JSON.stringify([{ count: 2 }])).ok).toBe(false);
  });

  it('rejects plans exceeding the 10-pane cap', () => {
    const result = parseOrchestrationRoles(
      JSON.stringify([
        { count: 6, agentSlug: 'a' },
        { count: 6, agentSlug: 'b' },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('maximum is 10');
  });

  it('sanitizes agent slugs', () => {
    const result = parseOrchestrationRoles(
      JSON.stringify([{ count: 1, agentSlug: '  Code Reviewer!! ' }]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.groups[0]!.agentSlug).toBe('code-reviewer');
  });
});

describe('terminal.orchestrate action', () => {
  beforeEach(() => {
    useTerminalCommandQueue.getState().clear();
    clearTerminalRoleBriefings();
  });

  it('queues close-all, opens role panes, and stores role briefings on approval', async () => {
    const action = resolveAction('terminal.orchestrate');
    expect(action).toBeTruthy();

    const result = await action!.run(
      {
        closeExisting: true,
        command: 'claude',
        rolesJson: JSON.stringify([
          { count: 5, agentSlug: 'code-agent', prompt: 'please find any security vulnerabilities' },
          { count: 5, agentSlug: 'code-reviewer', prompt: 'you are a code reviewer' },
        ]),
      },
      { source: 'ai' },
    );

    expect(result.ok).toBe(true);
    const summary = result.ok ? result.summary ?? '' : '';
    expect(summary).toContain('Closing all existing project terminals');
    expect(summary).toContain('Opening 10 terminal panes');
    expect(summary).toContain('AGENTS.md');
    expect(summary).toContain('claude');

    const queue = useTerminalCommandQueue.getState().queue;
    expect(queue[0]).toMatchObject({ kind: 'close', count: 10 });
    const shells = queue.filter((item) => item.kind === 'shell');
    expect(shells).toHaveLength(10);
    expect(shells.filter((item) => item.kind === 'shell' && item.agentSlug === 'code-agent')).toHaveLength(5);
    expect(shells.filter((item) => item.kind === 'shell' && item.agentSlug === 'code-reviewer')).toHaveLength(5);
    for (const shell of shells) {
      if (shell.kind === 'shell') expect(shell.command).toBe('claude');
    }

    // Role prompts are stored for AGENTS.md delivery, never queued as shell text.
    expect(getTerminalRoleBriefing(null, 'code-agent')).toBe('please find any security vulnerabilities');
    expect(getTerminalRoleBriefing(null, 'code-reviewer')).toBe('you are a code reviewer');
    const typedPrompts = shells.some(
      (item) => item.kind === 'shell' && /code reviewer|security vulnerabilities/i.test(item.command),
    );
    expect(typedPrompts).toBe(false);
  });

  it('does nothing when the roles payload is invalid (decline-equivalent safety)', async () => {
    const action = resolveAction('terminal.orchestrate');
    const result = await action!.run({ rolesJson: 'garbage' }, { source: 'ai' });
    expect(result.ok).toBe(false);
    expect(useTerminalCommandQueue.getState().queue).toHaveLength(0);
  });

  it('rejects shell metacharacters in the command', async () => {
    const action = resolveAction('terminal.orchestrate');
    const result = await action!.run(
      { command: 'claude; rm -rf /', rolesJson: JSON.stringify([{ count: 1, agentSlug: 'a' }]) },
      { source: 'ai' },
    );
    expect(result.ok).toBe(false);
    expect(useTerminalCommandQueue.getState().queue).toHaveLength(0);
  });

  it('is a single destructive approval-gated action', () => {
    const action = resolveAction('terminal.orchestrate');
    expect(action?.destructive).toBe(true);
  });
});

describe('fallback detection of the full orchestration example', () => {
  it('turns the required example phrase into one terminal.orchestrate proposal', () => {
    const proposals = inferFallbackActionProposals(EXAMPLE_PHRASE, '');

    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    expect(p.action_id).toBe('terminal.orchestrate');
    expect(p.params.closeExisting).toBe(true);
    expect(p.params.command).toBe('claude');

    const roles = JSON.parse(String(p.params.rolesJson)) as Array<{
      count: number;
      agentSlug: string;
      prompt?: string;
    }>;
    expect(roles).toHaveLength(2);
    const codeAgent = roles.find((role) => role.agentSlug === 'code');
    const reviewer = roles.find((role) => role.agentSlug === 'code-reviewer');
    expect(codeAgent).toBeTruthy();
    expect(reviewer).toBeTruthy();
    expect(codeAgent!.count).toBe(5);
    expect(reviewer!.count).toBe(5);
    expect(codeAgent!.prompt).toContain('security vulnerabilities');
    expect(reviewer!.prompt).toContain('code reviewer');
  });

  it('stays quiet for ambiguous role counts that disagree with the open count', () => {
    const proposals = inferFallbackActionProposals(
      'open 10 new terminals and put three as a code agent and another four as a reviewer agent',
      '',
    );
    expect(proposals.some((p) => p.action_id === 'terminal.orchestrate')).toBe(false);
  });
});
