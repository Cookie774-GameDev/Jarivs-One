import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPromptForgeJob, transitionPromptForgeJob } from './contracts';
import { PromptForgeReview, buildPromptForgeDiff } from './PromptForgeReview';

function readyJob() {
  const initial = createPromptForgeJob({
    id: 'forge-review-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    projectId: 'project-1',
    originalDraft: 'Build a runner game.',
    originalAttachments: [],
    modelSelection: { mode: 'prefer_local' },
    privacyMode: 'local_only',
    allowPublicResearch: false,
    now: 100,
  });
  const generating = transitionPromptForgeJob(initial, {
    expectedRevision: 1,
    status: 'collecting_context',
    now: 101,
  });
  const readyToGenerate = transitionPromptForgeJob(generating, {
    expectedRevision: 2,
    status: 'generating',
    selectedSourceIds: ['source-1'],
    retrievedSources: [
      {
        id: 'source-1',
        kind: 'project_file',
        label: 'Theme tokens',
        reference: 'app/src/index.css',
        observedAt: 90,
        whySelected: 'Matches the visual request.',
      },
    ],
    resolvedModel: {
      providerId: 'ollama',
      modelId: 'qwen3:8b',
      label: 'Qwen 3 8B',
      connectionId: 'ollama-local',
      connectionMode: 'local',
      local: true,
      billingClass: 'local_free',
    },
    now: 102,
  });
  const validating = transitionPromptForgeJob(readyToGenerate, {
    expectedRevision: 3,
    status: 'validating',
    generatedDraft: 'Build a polished, accessible endless runner game.',
    usage: {
      inputTokens: 120,
      outputTokens: 40,
      costUsd: 0,
      finishReason: 'stop',
      startedAt: 103,
      completedAt: 104,
    },
    now: 104,
  });
  return transitionPromptForgeJob(validating, {
    expectedRevision: 4,
    status: 'ready',
    generatedDraft: 'Build a polished, accessible endless runner game.',
    validation: { passed: true, missingCount: 0, checkedAt: 105 },
    now: 105,
  });
}

describe('Prompt Forge review', () => {
  it('shows upgraded, original, changes, and cited sources without replacing automatically', () => {
    const onReplace = vi.fn();
    render(
      <PromptForgeReview
        open
        job={readyJob()}
        upgradedDraft="Build a polished, accessible endless runner game."
        onUpgradedDraftChange={vi.fn()}
        excludedSourceIds={[]}
        onExcludeSource={vi.fn()}
        onReplace={onReplace}
        onInsertBelow={vi.fn()}
        onCopy={vi.fn()}
        onRegenerate={vi.fn()}
        onRegenerateWithInstructions={vi.fn()}
        onSendUpgraded={vi.fn(async () => true)}
        onUndo={vi.fn()}
        canUndo={false}
        onClose={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /prompt forge review/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Upgraded' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByDisplayValue(/polished, accessible/)).toBeTruthy();
    expect(onReplace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Original' }));
    expect(screen.getByText('Build a runner game.')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    expect(screen.getByText('polished, accessible endless')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    expect(screen.getByText('app/src/index.css')).toBeTruthy();
    expect(screen.getByText('Matches the visual request.')).toBeTruthy();
  });

  it('keeps replacement, insertion, copy, edit, exclusion, regeneration, sending, undo, and close explicit', async () => {
    const handlers = {
      onUpgradedDraftChange: vi.fn(),
      onExcludeSource: vi.fn(),
      onReplace: vi.fn(),
      onInsertBelow: vi.fn(),
      onCopy: vi.fn(),
      onRegenerate: vi.fn(),
      onRegenerateWithInstructions: vi.fn(),
      onSendUpgraded: vi.fn(async () => true),
      onUndo: vi.fn(),
      onClose: vi.fn(),
      onReturnFocus: vi.fn(),
    };
    render(
      <PromptForgeReview
        open
        job={readyJob()}
        upgradedDraft="Build a polished, accessible endless runner game."
        excludedSourceIds={[]}
        canUndo
        {...handlers}
      />,
    );

    fireEvent.change(screen.getByLabelText('Edit upgraded prompt'), {
      target: { value: 'Edited upgraded prompt.' },
    });
    expect(handlers.onUpgradedDraftChange).toHaveBeenCalledWith('Edited upgraded prompt.');

    fireEvent.click(screen.getByRole('button', { name: 'Replace original' }));
    expect(handlers.onReplace).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Insert below original' }));
    expect(handlers.onInsertBelow).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Copy upgraded prompt' }));
    expect(handlers.onCopy).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Undo last replacement' }));
    expect(handlers.onUndo).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Theme tokens' }));
    expect(handlers.onExcludeSource).toHaveBeenCalledWith('source-1');

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(handlers.onRegenerate).toHaveBeenCalledOnce();
    expect(handlers.onReturnFocus).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate with instructions' }));
    fireEvent.change(screen.getByLabelText('Regeneration instructions'), {
      target: { value: 'Keep it shorter.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply regeneration instructions' }));
    expect(handlers.onRegenerateWithInstructions).toHaveBeenCalledWith('Keep it shorter.');
    expect(handlers.onReturnFocus).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Send upgraded prompt' }));
    await waitFor(() => expect(handlers.onSendUpgraded).toHaveBeenCalledOnce());
    expect(handlers.onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and keep original' }));
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });

  it('builds a readable replacement diff while preserving common context', () => {
    expect(buildPromptForgeDiff('Build a runner game.', 'Build a polished runner game.')).toEqual([
      { kind: 'same', text: 'Build a ' },
      { kind: 'added', text: 'polished ' },
      { kind: 'same', text: 'runner game.' },
    ]);
  });

  it('keeps the reviewed draft open when approved dispatch fails', async () => {
    const onClose = vi.fn();
    render(
      <PromptForgeReview
        open
        job={readyJob()}
        upgradedDraft="Build a polished, accessible endless runner game."
        onUpgradedDraftChange={vi.fn()}
        excludedSourceIds={[]}
        onExcludeSource={vi.fn()}
        onReplace={vi.fn()}
        onInsertBelow={vi.fn()}
        onCopy={vi.fn()}
        onRegenerate={vi.fn()}
        onRegenerateWithInstructions={vi.fn()}
        onSendUpgraded={vi.fn(async () => false)}
        onUndo={vi.fn()}
        canUndo={false}
        onClose={onClose}
        onReturnFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send upgraded prompt' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Send upgraded prompt' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(/polished, accessible/)).toBeTruthy();
  });
});
