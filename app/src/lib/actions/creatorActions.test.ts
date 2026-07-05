import { describe, expect, it } from 'vitest';
import { getBuiltinAction } from './registry';

describe('creator actions', () => {
  it('registers an approval-gated Make with Jarvis creator launcher', () => {
    const action = getBuiltinAction('creator.start');

    expect(action?.category).toBe('custom');
    expect(action?.destructive).toBe(true);
    expect(action?.params.map((param) => param.key)).toContain('kind');
    expect(action?.exposeToAI).not.toBe(false);
  });
});
