import { describe, expect, it } from 'vitest';
import { resolveStableEntity } from './entityCommands';

describe('stable entity resolution', () => {
  const entities = [
    { id: 'tool_1', displayName: 'Release Audit' },
    { id: 'tool_2', displayName: 'release audit' },
    { id: 'tool_3', displayName: 'Formatter' },
  ];

  it('prefers exact stable IDs and accepts only unique normalized names', () => {
    expect(resolveStableEntity(entities, 'tool_2')).toEqual({
      status: 'resolved',
      entity: entities[1],
    });
    expect(resolveStableEntity(entities, 'formatter')).toEqual({
      status: 'resolved',
      entity: entities[2],
    });
    expect(resolveStableEntity(entities, 'Release Audit')).toEqual({
      status: 'ambiguous',
      candidateIds: ['tool_1', 'tool_2'],
    });
  });
});
