import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import { ALL_ABOUT_ME_TEST_QUESTIONS } from '@/features/all-about-me/profile';
import { AllAboutMe } from './AllAboutMe';

describe('AllAboutMe settings section', () => {
  beforeEach(() => {
    useAllAboutMeStore.setState(useAllAboutMeStore.getInitialState(), true);
  });

  it('generates and previews AllAboutMe.md from the quiz', async () => {
    const completePrompt = vi.fn(async () => '# AllAboutMe.md\n\n## Communication Style\n\nShort and intense.');
    render(
      <AllAboutMe
        completePrompt={completePrompt}
        modelOptions={[{ id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', model: 'gemini-2.5-flash' }]}
      />,
    );

    expect(screen.queryByLabelText(/1\. What name or nickname/i)).toBeNull();
    const takeButton = screen.getByRole('button', { name: /Take the test/i });
    expect(takeButton.className).toContain('shadow');
    fireEvent.click(takeButton);

    expect(screen.getByRole('dialog', { name: /All About Me Test/i })).toBeTruthy();
    expect(screen.getByText(/Question 1 of 60/i)).toBeTruthy();
    expect(screen.getByText(/You are flying through this/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/AI model for grading/i), {
      target: { value: 'google:gemini-2.5-flash' },
    });

    for (let index = 0; index < ALL_ABOUT_ME_TEST_QUESTIONS.length; index += 1) {
      const question = ALL_ABOUT_ME_TEST_QUESTIONS[index]!;
      expect(screen.getByText(new RegExp(`Question ${index + 1} of 60`, 'i'))).toBeTruthy();
      if (question.kind === 'written') {
        fireEvent.change(screen.getByRole('textbox'), {
          target: { value: 'Short, direct, high-energy and production ready.' },
        });
      } else {
        const firstOption = question.options![0]!;
        expect(screen.getByRole('button', { name: firstOption }).getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(screen.getByRole('button', { name: firstOption }));
      }
      if (index < ALL_ABOUT_ME_TEST_QUESTIONS.length - 1) {
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      }
    }

    fireEvent.click(screen.getByRole('button', { name: /Generate AllAboutMe.md/i }));

    await waitFor(() => expect(completePrompt).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Short and intense/i)).toBeTruthy();
    expect(useAllAboutMeStore.getState().markdown).toContain('# AllAboutMe.md');
    expect(screen.getByText(/VibeSpace Profile Vault\/AllAboutMe.md/i)).toBeTruthy();
  }, 60_000);

  it('blocks the test when no real AI model is available', () => {
    render(<AllAboutMe completePrompt={vi.fn()} modelOptions={[]} />);

    expect(screen.getByRole('button', { name: /Take the test/i })).toHaveProperty('disabled', true);
    expect(screen.getByText(/Connect a real AI model/i)).toBeTruthy();
  });

  it('replaces a stale saved grading model with the first connected model', async () => {
    useAllAboutMeStore.getState().saveTestDraft({
      selectedModelId: 'google:legacy-manual-model',
      mode: 'create',
      questionValues: {},
    });
    render(
      <AllAboutMe
        completePrompt={vi.fn()}
        modelOptions={[{ id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', model: 'gemini-2.5-flash' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Resume saved test/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/AI model for grading/i)).toHaveProperty('value', 'google:gemini-2.5-flash'),
    );
    expect(screen.queryByRole('option', { name: /legacy-manual-model/i })).toBeNull();
  });

  it('keeps chat learning transparently locked on', () => {
    render(<AllAboutMe completePrompt={vi.fn()} modelOptions={[]} />);

    const learningSwitch = screen.getByLabelText(/AllAboutMe chat learning is always on/i);
    expect(learningSwitch).toHaveProperty('disabled', true);
    expect(learningSwitch.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText(/After every 10 user messages/i).length).toBeGreaterThan(0);
  });

  it('autosaves progress when the popup is paused and resumes later', () => {
    render(
      <AllAboutMe
        completePrompt={vi.fn()}
        modelOptions={[{ id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', model: 'gemini-2.5-flash' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Take the test/i }));
    fireEvent.change(screen.getByLabelText(/1\. What name or nickname/i), {
      target: { value: 'Viper' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Pause and save/i }));

    expect(useAllAboutMeStore.getState().testDraft?.questionValues.displayName).toBe('Viper');
    expect(screen.queryByRole('dialog', { name: /All About Me Test/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Resume saved test/i }));
    expect(screen.getByText(/Question 2 of 60/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByLabelText(/1\. What name or nickname/i)).toHaveProperty('value', 'Viper');
  });

  it('opens retake mode as an update and supports destructive delete confirmation', () => {
    useAllAboutMeStore.getState().saveQuizProfile(
      {
        communicationStyle: 'Old style',
        toneExamples: '',
        interests: '',
        strongReactions: '',
        preferences: [],
        dislikedPatterns: [],
        responseStyle: '',
        personalNotes: '',
      },
      '# AllAboutMe.md\nOld profile',
    );
    render(
      <AllAboutMe
        completePrompt={vi.fn()}
        modelOptions={[{ id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', model: 'gemini-2.5-flash' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Retake to update scores/i }));
    expect(screen.getByText(/updates the existing AllAboutMe.md/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Delete AllAboutMe.md/i }));
    fireEvent.change(screen.getByLabelText(/Type delete to confirm/i), { target: { value: 'Delete' } });
    expect(screen.getByRole('button', { name: /^Delete$/i })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText(/Type delete to confirm/i), { target: { value: 'delete' } });
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    expect(useAllAboutMeStore.getState().markdown).toBe('');
  });
});
