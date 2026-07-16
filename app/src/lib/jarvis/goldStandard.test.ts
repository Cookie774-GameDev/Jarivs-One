import { describe, expect, it } from 'vitest';

import fixtures from '../../../../tests/jarvis/gold-standard-prompts.json';
import { getBuiltinActions } from '@/lib/actions/registry';

import { evaluateGoldStandardFixtures, validateGoldStandardFixtures } from './goldStandard';

describe('Jarvis gold-standard prompt suite', () => {
  it('contains complete, unique, versioned coverage beyond the required twenty prompts', () => {
    expect(fixtures.version).toBe(1);
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(30);
    expect(validateGoldStandardFixtures(fixtures)).toEqual([]);
  });

  it('selects only registered actions and meets deterministic conversation targets', () => {
    const report = evaluateGoldStandardFixtures(fixtures, new Set(getBuiltinActions().map((action) => action.id)));
    expect(report.unregisteredActions).toEqual([]);
    expect(report.benignRefusalRate).toBe(0);
    expect(report.duplicateActionRate).toBe(0);
    expect(report.averageConversationalSentences).toBeLessThan(3);
    expect(report.outputs.filter((output) => !output.pass)).toEqual([]);
  });

  it('fails when the interpreter does not match a fixture expectation', () => {
    const mismatched = {
      version: 1,
      cases: [{
        ...fixtures.cases[0],
        id: 'intent-mismatch-proof',
        expectedIntent: 'terminal-work',
        expectedAction: 'terminal.create',
        expectedPermission: 'approval-required',
      }],
    };

    const report = evaluateGoldStandardFixtures(mismatched, new Set(getBuiltinActions().map((action) => action.id)));
    expect(report.outputs[0]?.pass).toBe(false);
    expect(report.outputs[0]?.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/intent/i),
      expect.stringMatching(/action/i),
      expect.stringMatching(/permission/i),
    ]));
  });
});
