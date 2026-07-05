import { beforeEach, describe, expect, it } from 'vitest';
import { useAllAboutMeStore } from './store';
import type { AllAboutMeAnswers } from './profile';

const answers: AllAboutMeAnswers = {
  communicationStyle: 'Short, excited, direct.',
  toneExamples: 'Please make it production ready.',
  interests: 'AI agents and music.',
  strongReactions: 'Crashes and placeholders.',
  preferences: ['short-direct'],
  dislikedPatterns: ['generic replies'],
  responseStyle: 'Confident teammate.',
  personalNotes: 'Launch readiness matters.',
};

describe('AllAboutMe store', () => {
  beforeEach(() => {
    useAllAboutMeStore.setState(useAllAboutMeStore.getInitialState(), true);
  });

  it('saves quiz answers with generated markdown', () => {
    useAllAboutMeStore.getState().saveQuizProfile(answers, '# AllAboutMe.md\nProfile');

    const state = useAllAboutMeStore.getState();
    expect(state.quizAnswers?.communicationStyle).toBe('Short, excited, direct.');
    expect(state.markdown).toContain('# AllAboutMe.md');
    expect(state.source).toBe('quiz');
    expect(state.learningEnabled).toBe(true);
  });

  it('tracks user message cadence for learning', () => {
    const store = useAllAboutMeStore.getState();
    store.saveQuizProfile(answers, '# AllAboutMe.md\nProfile');
    for (let i = 0; i < 10; i += 1) store.recordUserMessage();

    expect(useAllAboutMeStore.getState().totalUserMessages).toBe(10);
    expect(useAllAboutMeStore.getState().needsLearningUpdate()).toBe(true);
  });

  it('records a chat-learning revision at the current message count', () => {
    const store = useAllAboutMeStore.getState();
    store.saveQuizProfile(answers, '# AllAboutMe.md\nOld profile');
    for (let i = 0; i < 10; i += 1) store.recordUserMessage();

    store.applyLearningRevision('# AllAboutMe.md\nOld profile\n\nNew repeated pattern.');

    const state = useAllAboutMeStore.getState();
    expect(state.source).toBe('chat-learning');
    expect(state.markdown).toContain('New repeated pattern');
    expect(state.lastUpdatedAtMessageCount).toBe(10);
    expect(state.needsLearningUpdate()).toBe(false);
  });

  it('autosaves unfinished test progress for later', () => {
    useAllAboutMeStore.getState().saveTestDraft({
      selectedModelId: 'google:gemini-2.5-flash',
      mode: 'create',
      questionValues: { displayName: 'Viper', onlinePersonality: 'Bold' },
    });

    const draft = useAllAboutMeStore.getState().testDraft;
    expect(draft?.selectedModelId).toBe('google:gemini-2.5-flash');
    expect(draft?.questionValues.displayName).toBe('Viper');
    expect(draft?.mode).toBe('create');
    expect(typeof draft?.updatedAt).toBe('number');
  });

  it('clears draft progress after a completed profile save', () => {
    useAllAboutMeStore.getState().saveTestDraft({
      selectedModelId: 'google:gemini-2.5-flash',
      mode: 'update',
      questionValues: { displayName: 'Viper' },
    });

    useAllAboutMeStore.getState().saveQuizProfile(answers, '# AllAboutMe.md\nProfile');

    expect(useAllAboutMeStore.getState().testDraft).toBeNull();
  });

  it('requires exact delete confirmation before wiping the profile and draft', () => {
    const store = useAllAboutMeStore.getState();
    store.saveQuizProfile(answers, '# AllAboutMe.md\nProfile');
    store.saveTestDraft({ selectedModelId: 'google:gemini-2.5-flash', mode: 'update', questionValues: { displayName: 'Viper' } });

    expect(store.deleteProfile('Delete')).toBe(false);
    expect(useAllAboutMeStore.getState().markdown).toContain('Profile');

    expect(useAllAboutMeStore.getState().deleteProfile('delete')).toBe(true);
    expect(useAllAboutMeStore.getState().markdown).toBe('');
    expect(useAllAboutMeStore.getState().testDraft).toBeNull();
  });
});
