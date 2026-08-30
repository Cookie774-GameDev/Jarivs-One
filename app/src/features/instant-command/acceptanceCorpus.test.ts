import { describe, expect, it } from 'vitest';
import { INSTANT_COMMAND_ACCEPTANCE_CORPUS } from './acceptanceCorpus';

describe('Instant Command exhaustive acceptance corpus', () => {
  it('contains the required bounded fixture counts across every catalog family', () => {
    expect(INSTANT_COMMAND_ACCEPTANCE_CORPUS.positive.length).toBeGreaterThanOrEqual(300);
    expect(INSTANT_COMMAND_ACCEPTANCE_CORPUS.negative.length).toBeGreaterThanOrEqual(300);
    expect(INSTANT_COMMAND_ACCEPTANCE_CORPUS.ambiguity.length).toBeGreaterThanOrEqual(100);
    expect(INSTANT_COMMAND_ACCEPTANCE_CORPUS.authorization.length).toBeGreaterThanOrEqual(100);
    expect(new Set(INSTANT_COMMAND_ACCEPTANCE_CORPUS.families)).toEqual(
      new Set([
        'navigation',
        'terminal',
        'agent',
        'project',
        'chat',
        'schedule',
        'settings',
        'media',
        'tools',
        'files',
        'tasks',
        'workbench',
        'team',
      ]),
    );
  });

  it('keeps fixture records content-minimal', () => {
    expect(JSON.stringify(INSTANT_COMMAND_ACCEPTANCE_CORPUS)).not.toMatch(
      /api[_ -]?key|bearer\s|password\s*[:=]/iu,
    );
  });
});
