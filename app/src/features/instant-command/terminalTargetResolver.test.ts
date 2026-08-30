import { describe, expect, it } from 'vitest';
import type { LiveTerminalTarget } from './types';
import { resolveTerminalTarget } from './terminalTargetResolver';

const processIdentity = {
  projectId: 'project-a',
  processInstanceId: 'process-a',
  pid: 4242,
  processStartedAt: 1_723_456_789_000,
  runtimeGeneration: 'runtime-a',
} as const;

const targets: LiveTerminalTarget[] = [
  {
    sessionId: 'tty-1',
    paneId: 'pane-1',
    projectId: 'project-a',
    ordinal: 1,
    label: 'Claude',
    provider: 'claude',
    processIdentity: { ...processIdentity, processInstanceId: 'process-1' },
  },
  {
    sessionId: 'tty-2',
    paneId: 'pane-2',
    projectId: 'project-a',
    ordinal: 2,
    label: 'Codex Review',
    provider: 'codex',
    processIdentity: { ...processIdentity, processInstanceId: 'process-2' },
  },
  {
    sessionId: 'tty-3',
    paneId: 'pane-3',
    projectId: 'project-a',
    ordinal: 3,
    label: 'Codex Build',
    provider: 'codex',
    processIdentity: { ...processIdentity, processInstanceId: 'process-3' },
  },
];

describe('resolveTerminalTarget', () => {
  it('resolves exact session, exact pane, and visual ordinal in precedence order', () => {
    expect(resolveTerminalTarget({ sessionId: 'tty-2' }, targets)).toMatchObject({
      kind: 'one',
      target: targets[1],
    });
    expect(resolveTerminalTarget({ paneId: 'pane-1' }, targets)).toMatchObject({
      kind: 'one',
      target: targets[0],
    });
    expect(resolveTerminalTarget({ ordinal: 3 }, targets)).toMatchObject({
      kind: 'one',
      target: targets[2],
    });
  });

  it('fails closed for ambiguous singular selectors but resolves explicit broadcasts', () => {
    expect(resolveTerminalTarget({ provider: 'codex', scope: 'one' }, targets)).toEqual({
      kind: 'ambiguous',
    });
    expect(resolveTerminalTarget({ provider: 'codex', scope: 'all' }, targets)).toMatchObject({
      kind: 'many',
      targets: [targets[1], targets[2]],
    });
  });

  it('does not choose a missing or non-unique partial label', () => {
    expect(resolveTerminalTarget({ label: 'missing' }, targets)).toEqual({ kind: 'missing' });
    expect(resolveTerminalTarget({ label: 'Codex' }, targets)).toEqual({ kind: 'ambiguous' });
  });
});
