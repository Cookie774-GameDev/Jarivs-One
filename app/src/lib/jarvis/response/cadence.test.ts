import { describe, expect, it } from 'vitest';
import {
  applyJarvisAddressCadence,
  EMPTY_JARVIS_CADENCE_STATE,
  type JarvisCadenceState,
} from './cadence';

const previousShortAddress: JarvisCadenceState = {
  previousReplyUsedSir: true,
  previousReplyWasShort: true,
};

describe('JARVIS address cadence', () => {
  it('normalizes the address to a maximum of once per reply', () => {
    const result = applyJarvisAddressCadence(
      'Completed, sir. Verification passed, sir.',
      {
        mode: 'action_success',
        moment: 'significant_completion',
      },
      EMPTY_JARVIS_CADENCE_STATE,
    );

    expect(result.text.match(/\bsir\b/gi)).toHaveLength(1);
    expect(result.usedSir).toBe(true);
  });

  it.each([
    ['new_task_acknowledgement', 'acknowledgement'],
    ['significant_completion', 'action_success'],
    ['important_warning', 'warning'],
    ['deliberate_correction', 'direct_answer'],
    ['dry_humor', 'recommendation'],
  ] as const)('prefers the address for %s', (moment, mode) => {
    const result = applyJarvisAddressCadence(
      'The result is ready.',
      { mode, moment },
      EMPTY_JARVIS_CADENCE_STATE,
    );

    expect(result.usedSir).toBe(true);
    expect(result.text.match(/\bsir\b/gi)).toHaveLength(1);
  });

  it('suppresses consecutive short address use except for major warnings and completions', () => {
    const routine = applyJarvisAddressCadence(
      'The command is prepared.',
      {
        mode: 'approval_required',
        moment: 'new_task_acknowledgement',
      },
      previousShortAddress,
    );
    const warning = applyJarvisAddressCadence(
      'The temperature limit is near.',
      { mode: 'warning', moment: 'important_warning' },
      previousShortAddress,
    );
    const completion = applyJarvisAddressCadence(
      'The release build passed.',
      { mode: 'action_success', moment: 'significant_completion' },
      previousShortAddress,
    );

    expect(routine.usedSir).toBe(false);
    expect(warning.usedSir).toBe(true);
    expect(completion.usedSir).toBe(true);
  });

  it.each([
    [{ mode: 'status', moment: 'routine_status' }, 'Routine status is unchanged.'],
    [
      { mode: 'action_running', moment: 'routine_status', repeatedToolStream: true },
      'The tool is still running.',
    ],
    [
      { mode: 'action_failure', moment: 'important_warning', errorBurst: true },
      'The operation failed again.',
    ],
    [{ mode: 'long_form_delivery', moment: 'dry_humor' }, 'The report is attached.'],
    [{ mode: 'sensitive', moment: 'important_warning' }, 'Immediate support is available.'],
  ] as const)('omits the address for excluded cadence context %#', (context, text) => {
    const result = applyJarvisAddressCadence(text, context, EMPTY_JARVIS_CADENCE_STATE);
    expect(result.usedSir).toBe(false);
    expect(result.text).not.toMatch(/\bsir\b/i);
  });

  it('returns only frozen content-free cadence state', () => {
    const result = applyJarvisAddressCadence(
      'The result is ready.',
      { mode: 'action_success', moment: 'significant_completion' },
      EMPTY_JARVIS_CADENCE_STATE,
    );

    expect(result.state).toEqual({
      previousReplyUsedSir: true,
      previousReplyWasShort: true,
    });
    expect(Object.keys(result.state)).toEqual(['previousReplyUsedSir', 'previousReplyWasShort']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
  });
});
