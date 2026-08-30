import { describe, expect, it } from 'vitest';
import {
  CAO_LEARNER_IDENTITY,
  CAO_NATIVE_IDENTITY,
  assertCaoLearnerExecutionIdentity,
  bootstrapCaoLearning,
  classifyCaoLearningIntent,
  projectCaoPublicStatus,
} from './bootstrap';

describe('CAO bootstrap authority', () => {
  it('freezes one native identity and one fixed Codex learner route', () => {
    expect(CAO_NATIVE_IDENTITY).toMatchObject({
      id: 'jarvis-cao',
      name: 'Jarvis CAO',
      skillId: 'jarvis-cao',
      mention: '@CAO',
      aliases: ['@Jarvis CAO'],
    });
    expect(CAO_LEARNER_IDENTITY).toEqual({
      providerId: 'openai',
      connectionId: 'openai-codex',
      modelId: 'gpt-5.6-terra',
      reasoningEffort: 'high',
    });
    expect(Object.isFrozen(CAO_NATIVE_IDENTITY)).toBe(true);
    expect(Object.isFrozen(CAO_NATIVE_IDENTITY.aliases)).toBe(true);
    expect(Object.isFrozen(CAO_LEARNER_IDENTITY)).toBe(true);
  });

  it.each([
    ['Have CAO learn our release checklist.', 'our release checklist.'],
    ['Jarvis CAO, study the native crash reports', 'the native crash reports'],
    ['@CAO review terminal cancellation behavior', 'terminal cancellation behavior'],
    ['@Jarvis CAO analyze the failed acceptance packet', 'the failed acceptance packet'],
  ])('accepts an unambiguous action request: %s', (text, objective) => {
    expect(classifyCaoLearningIntent({ text })).toMatchObject({ objective });
  });

  it.each([
    'What is CAO?',
    'Should CAO learn the release checklist?',
    'Maybe CAO could study the incident.',
    'Do not have CAO learn this.',
    'CAO is learning about terminals.',
    'Have CAO learn.',
  ])('rejects ambiguous, descriptive, negated, or incomplete text: %s', (text) => {
    expect(classifyCaoLearningIntent({ text })).toBeNull();
  });

  it('routes a selected catalog entity and typed natural language through the same bootstrap', () => {
    const selected = bootstrapCaoLearning({
      text: 'Learn the release checklist',
      confirmedReferenceKeys: ['cao:jarvis-cao'],
    });
    const natural = bootstrapCaoLearning({ text: 'Have CAO learn the release checklist' });

    expect(selected).not.toBeNull();
    expect(natural).not.toBeNull();
    expect(selected).toMatchObject({
      nativeIdentity: CAO_NATIVE_IDENTITY,
      requestedIdentity: CAO_LEARNER_IDENTITY,
      skillIds: ['jarvis-cao'],
    });
    expect(natural).toMatchObject({
      nativeIdentity: CAO_NATIVE_IDENTITY,
      requestedIdentity: CAO_LEARNER_IDENTITY,
      skillIds: ['jarvis-cao'],
    });
  });

  it('requires exact requested-vs-observed learner identity and never substitutes a fallback', () => {
    expect(
      assertCaoLearnerExecutionIdentity({
        requested: CAO_LEARNER_IDENTITY,
        observed: {
          providerId: 'openai',
          connectionId: 'openai-codex',
          modelId: 'gpt-5.6-terra',
          reasoningEffort: 'high',
        },
      }),
    ).toBe(CAO_LEARNER_IDENTITY);

    expect(() =>
      assertCaoLearnerExecutionIdentity({
        requested: CAO_LEARNER_IDENTITY,
        observed: {
          providerId: 'opencode',
          connectionId: 'opencode-cli',
          modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
          reasoningEffort: 'high',
        },
      }),
    ).toThrow('cao_learner_execution_identity_mismatch');
    expect(() =>
      assertCaoLearnerExecutionIdentity({
        requested: {
          ...CAO_LEARNER_IDENTITY,
          modelId: 'gpt-5.6-sol',
        },
        observed: CAO_LEARNER_IDENTITY,
      }),
    ).toThrow('cao_learner_requested_identity_invalid');
  });

  it('projects compact public status without the objective or hidden reasoning fields', () => {
    const decision = bootstrapCaoLearning({ text: 'Have CAO learn private incident details' });
    expect(decision).not.toBeNull();

    const status = projectCaoPublicStatus(decision!);
    expect(status).toEqual({ identity: 'Jarvis CAO', status: 'queued' });
    expect(JSON.stringify(status)).not.toMatch(/private incident|objective|reasoning|prompt/iu);
  });
});
