import { describe, expect, it } from 'vitest';
import {
  CaoControlCommandError,
  parseCaoControlCommand,
  resolveCaoControlTargets,
} from './controlCommand';

const scope = { accountId: 'account-1', workspaceId: 'workspace-1', projectId: 'project-1' };

describe('CAO control command authority', () => {
  it.each([
    'supervise',
    'diagnose',
    'restart',
    'verify',
    'grade',
    'force-check',
    'cancel',
  ] as const)(
    'routes explicit and ordinary-language %s through one canonical envelope',
    (action) => {
      const explicit = parseCaoControlCommand({
        text: `@CAO ${action} chat:chat-1 terminal:term-2`,
      });
      const natural = parseCaoControlCommand({
        text: `Have Jarvis CAO ${action} chat:chat-1 terminal:term-2`,
      });
      expect(explicit).toMatchObject({ action, source: 'natural-language' });
      expect(natural).toEqual(explicit);
    },
  );

  it('gives a confirmed catalog reference the same strict parser', () => {
    const selected = parseCaoControlCommand({
      text: 'diagnose chat:"Release Room"',
      confirmedReferenceKeys: ['cao:jarvis-cao'],
    });
    const typed = parseCaoControlCommand({ text: '@CAO diagnose chat:"Release Room"' });
    expect(selected).toMatchObject({ action: typed?.action, selectors: typed?.selectors });
  });

  it.each([
    '@CAO diagnose',
    '@CAO explain chat:chat-1',
    'Should CAO restart chat:chat-1?',
    'Do not have CAO restart chat:chat-1',
    '@CAO restart all chats',
    '@CAO diagnose chat:../secret',
  ])('rejects implicit, ambiguous, negated, unknown, or unsafe control text: %s', (text) => {
    expect(parseCaoControlCommand({ text })).toBeNull();
  });

  it('resolves exact IDs and unique exact titles only inside the active scope', () => {
    const command = parseCaoControlCommand({
      text: '@CAO verify chat:"Release Room" terminal:term-2',
    })!;
    expect(
      resolveCaoControlTargets({
        command,
        scope,
        candidates: [
          {
            ...scope,
            kind: 'chat',
            targetId: 'chat-1',
            title: 'Release Room',
            revision: 4,
            selected: true,
            locked: false,
          },
          {
            ...scope,
            kind: 'terminal',
            targetId: 'term-2',
            title: 'Shell',
            revision: 9,
            selected: true,
            locked: false,
          },
          {
            ...scope,
            projectId: 'project-other',
            kind: 'chat',
            targetId: 'chat-foreign',
            title: 'Release Room',
            revision: 1,
            selected: true,
            locked: false,
          },
        ],
      }).targets,
    ).toEqual([
      { kind: 'chat', targetId: 'chat-1', revision: 4 },
      { kind: 'terminal', targetId: 'term-2', revision: 9 },
    ]);
  });

  it('fails closed on missing, ambiguous, drifted, unselected, locked, and duplicate targets', () => {
    const command = parseCaoControlCommand({ text: '@CAO diagnose chat:"Same"' })!;
    const candidate = {
      ...scope,
      kind: 'chat' as const,
      targetId: 'chat-1',
      title: 'Same',
      revision: 1,
      selected: true,
      locked: false,
    };
    expect(() => resolveCaoControlTargets({ command, scope, candidates: [] })).toThrow(
      'cao_control_target_missing',
    );
    expect(() =>
      resolveCaoControlTargets({
        command,
        scope,
        candidates: [candidate, { ...candidate, targetId: 'chat-2' }],
      }),
    ).toThrow('cao_control_target_ambiguous');
    for (const changed of [{ selected: false }, { locked: true }]) {
      expect(() =>
        resolveCaoControlTargets({ command, scope, candidates: [{ ...candidate, ...changed }] }),
      ).toThrow(CaoControlCommandError);
    }
    const duplicate = parseCaoControlCommand({ text: '@CAO verify chat:chat-1 chat:chat-1' });
    expect(duplicate).toBeNull();
  });
});
