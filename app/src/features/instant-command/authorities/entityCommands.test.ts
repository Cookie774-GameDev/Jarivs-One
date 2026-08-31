import { describe, expect, it } from 'vitest';
import { resolveStableEntity } from './entityCommands';

describe('stable entity resolution', () => {
  const entities = [
    { id: 'tool_1', displayName: 'Release Audit' },
    { id: 'tool_2', displayName: 'release audit' },
    { id: 'tool_3', displayName: 'Formatter' },
  ];

  it('prefers exact stable IDs and accepts only unique normalized names', () => {
    const byId = resolveStableEntity(entities, 'tool_2');
    expect(byId).toEqual({
      status: 'resolved',
      entity: entities[1],
    });
    expect(Object.isFrozen(byId)).toBe(true);
    expect(Object.isFrozen(byId.status === 'resolved' ? byId.entity : undefined)).toBe(true);
    expect(byId.status === 'resolved' ? byId.entity : undefined).not.toBe(entities[1]);
    expect(resolveStableEntity(entities, 'formatter')).toEqual({
      status: 'resolved',
      entity: entities[2],
    });
    expect(resolveStableEntity(entities, 'Release Audit')).toEqual({
      status: 'ambiguous',
      candidateIds: ['tool_1', 'tool_2'],
    });
  });

  it('fails closed instead of choosing the first duplicate stable ID', () => {
    const resolution = resolveStableEntity(
      [
        { id: 'tool_1', displayName: 'First' },
        { id: 'tool_1', displayName: 'Replacement' },
      ],
      'tool_1',
    );

    expect(resolution).toEqual({ status: 'ambiguous', candidateIds: ['tool_1'] });
    expect(
      Object.isFrozen(resolution.status === 'ambiguous' ? resolution.candidateIds : undefined),
    ).toBe(true);
  });

  it('sorts and deduplicates ambiguous candidate IDs deterministically', () => {
    expect(
      resolveStableEntity(
        [
          { id: 'tool_z', displayName: 'Same' },
          { id: 'tool_a', displayName: 'same' },
          { id: 'tool_z', displayName: 'SAME' },
        ],
        'same',
      ),
    ).toEqual({ status: 'ambiguous', candidateIds: ['tool_a', 'tool_z'] });
  });

  it.each([42 as unknown as string, '', 'tool_1\nprivate', 'x'.repeat(257)])(
    'fails closed for malformed or unbounded selectors: %j',
    (selector) => {
      expect(resolveStableEntity(entities, selector)).toEqual({ status: 'missing' });
    },
  );

  it('ignores malformed registry rows and rejects an unbounded registry snapshot', () => {
    expect(
      resolveStableEntity(
        [
          { id: 'bad/id', displayName: 'Unsafe path' },
          { id: 'tool_ok', displayName: 'x'.repeat(257) },
        ],
        'Unsafe path',
      ),
    ).toEqual({ status: 'missing' });
    expect(
      resolveStableEntity(
        Array.from({ length: 4_097 }, (_, index) => ({
          id: `tool_${index}`,
          displayName: `Tool ${index}`,
        })),
        'tool_1',
      ),
    ).toEqual({ status: 'missing' });
  });
});
