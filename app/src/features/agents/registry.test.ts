import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Agent, AgentId } from '@/types';
import {
  createBuiltinAgentRoster,
  getBuiltinAgentDefinition as getCanonicalBuiltinAgentDefinition,
} from '@/lib/jarvis/builtinAgents';
import { getBuiltinAgentDefinition, getDefaultAgents } from './registry';

describe('agent registry compatibility exports', () => {
  it('aliases the canonical roster factory without defining another roster', () => {
    expect(getDefaultAgents).toBe(createBuiltinAgentRoster);
    expectTypeOf(getDefaultAgents).toEqualTypeOf<
      (input?: { now?: number; newId?: () => AgentId }) => Agent[]
    >();
  });

  it('re-exports the canonical built-in definition accessor', () => {
    expect(getBuiltinAgentDefinition).toBe(getCanonicalBuiltinAgentDefinition);
  });
});
