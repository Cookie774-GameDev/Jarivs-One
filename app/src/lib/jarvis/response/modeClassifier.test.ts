import { describe, expect, it } from 'vitest';
import type { JarvisRequestEnvelope, JarvisRunStatus } from '@/lib/jarvis/contracts';
import { classifyJarvisResponseMode, type JarvisVerifiedFacts } from './modeClassifier';

function request(userText = 'Please do the work.'): Readonly<JarvisRequestEnvelope> {
  return { userText, interactionMode: 'agent' } as Readonly<JarvisRequestEnvelope>;
}

function facts(status?: JarvisRunStatus): JarvisVerifiedFacts {
  return {
    ...(status
      ? { executionState: { status, verifiedBy: 'journal' as const, lastEventSeq: 2 } }
      : {}),
    modelState: 'authenticated',
    plugins: [],
    mcps: [],
  };
}

describe('classifyJarvisResponseMode', () => {
  it.each([
    ['awaiting_approval', 'approval_required'],
    ['running', 'action_running'],
    ['completed', 'action_success'],
    ['partial', 'action_partial'],
    ['failed', 'action_failure'],
    ['cancelled', 'status'],
    ['timed_out', 'warning'],
  ] as const)('maps verified %s truth to %s', (status, mode) => {
    expect(classifyJarvisResponseMode(request(), facts(status))).toBe(mode);
  });

  it('makes unavailable models warnings and never silently switches', () => {
    expect(classifyJarvisResponseMode(request(), { ...facts(), modelState: 'unavailable' })).toBe(
      'warning',
    );
  });

  it.each([
    ['queued', 'action_running'],
    ['running', 'action_running'],
    ['completed', 'action_success'],
    ['failed', 'action_failure'],
    ['cancelled', 'status'],
    ['timed_out', 'action_failure'],
  ] as const)('maps verified terminal %s truth to %s', (terminalState, mode) => {
    expect(classifyJarvisResponseMode(request(), { ...facts(), terminalState })).toBe(mode);
  });

  it('treats a degraded model connection as a warning', () => {
    expect(classifyJarvisResponseMode(request(), { ...facts(), modelState: 'degraded' })).toBe(
      'warning',
    );
  });

  it('never promotes provider-only terminal state to verified success', () => {
    expect(
      classifyJarvisResponseMode(request(), {
        ...facts(),
        executionState: { status: 'completed', verifiedBy: 'provider', lastEventSeq: 0 },
      }),
    ).toBe('warning');
  });

  it.each([
    ['Hi', 'acknowledgement'],
    ['What changed?', 'direct_answer'],
    ['Which approach do you recommend?', 'recommendation'],
    ['Write a detailed report with sections and citations.', 'long_form_delivery'],
    ['I need help after a self-harm crisis.', 'sensitive'],
  ] as const)('classifies %s as %s when no lifecycle fact dominates', (text, mode) => {
    expect(classifyJarvisResponseMode(request(text), facts())).toBe(mode);
  });

  it.each([
    'acknowledgement',
    'direct_answer',
    'status',
    'warning',
    'approval_required',
    'action_running',
    'action_success',
    'action_partial',
    'action_failure',
    'clarification',
    'recommendation',
    'long_form_delivery',
    'sensitive',
  ] as const)('honors the %s request hint when no verified fact overrides it', (mode) => {
    expect(
      classifyJarvisResponseMode(
        { ...request('Handle this request.'), responseModeHint: mode },
        facts(),
      ),
    ).toBe(mode);
  });
});
