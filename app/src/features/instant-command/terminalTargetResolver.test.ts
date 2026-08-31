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

  it.each([
    { sessionId: 'tty-1', paneId: 'pane-1' },
    { ordinal: 1, label: 'Claude' },
    { scope: 'invalid' },
    { ordinal: 0 },
    { ordinal: Number.NaN },
    { label: 'bad\nlabel' },
    { provider: 'x'.repeat(257) },
  ])('fails closed on mixed or malformed selector shapes', (selector) => {
    expect(resolveTerminalTarget(selector as never, targets)).toEqual({ kind: 'missing' });
  });

  it('fails closed when any target row is malformed or stable identities are duplicated', () => {
    expect(
      resolveTerminalTarget({ ordinal: 2 }, [
        { ...targets[0]!, sessionId: '' },
        ...targets,
      ] as LiveTerminalTarget[]),
    ).toEqual({ kind: 'missing' });
    expect(
      resolveTerminalTarget({ ordinal: 2 }, [
        targets[0]!,
        { ...targets[1]!, sessionId: 'tty-1' },
        targets[2]!,
      ]),
    ).toEqual({ kind: 'missing' });
    expect(
      resolveTerminalTarget({ ordinal: 2 }, [
        targets[0]!,
        { ...targets[1]!, paneId: 'pane-1' },
        targets[2]!,
      ]),
    ).toEqual({ kind: 'missing' });
  });

  it('rejects an unbounded target registry', () => {
    const unbounded = Array.from({ length: 1_025 }, (_, index) => ({
      ...targets[0]!,
      sessionId: `tty-${index}`,
      paneId: `pane-${index}`,
      ordinal: index + 1,
      processIdentity: {
        ...targets[0]!.processIdentity,
        processInstanceId: `process-${index}`,
      },
    }));
    expect(resolveTerminalTarget({ ordinal: 1 }, unbounded)).toEqual({ kind: 'missing' });
  });

  it('returns frozen target snapshots that cannot drift with the source registry', () => {
    const source = targets.map((target) => ({
      ...target,
      processIdentity: { ...target.processIdentity },
    }));
    const one = resolveTerminalTarget({ sessionId: 'tty-1' }, source);
    const many = resolveTerminalTarget({ provider: 'codex', scope: 'all' }, source);

    expect(one).toMatchObject({ kind: 'one', target: { sessionId: 'tty-1' } });
    expect(Object.isFrozen(one)).toBe(true);
    expect(one.kind === 'one' && Object.isFrozen(one.target)).toBe(true);
    expect(one.kind === 'one' && Object.isFrozen(one.target.processIdentity)).toBe(true);
    expect(Object.isFrozen(many)).toBe(true);
    expect(many.kind === 'many' && Object.isFrozen(many.targets)).toBe(true);

    source[0]!.label = 'Changed later';
    expect(one.kind === 'one' && one.target.label).toBe('Claude');
  });
});
