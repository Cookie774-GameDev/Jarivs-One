import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPromptForgeJob, transitionPromptForgeJob } from './contracts';
import { PromptForgeRecovery } from './PromptForgeRecovery';

function interruptedJob() {
  const initial = createPromptForgeJob({
    id: 'forge-recovery-1',
    accountId: 'account-1',
    chatId: 'chat-1',
    projectId: 'project-1',
    originalDraft: 'Restore this draft.',
    originalAttachments: [],
    modelSelection: { mode: 'prefer_local' },
    privacyMode: 'local_only',
    allowPublicResearch: false,
    now: 100,
  });
  const collecting = transitionPromptForgeJob(initial, {
    expectedRevision: 1,
    status: 'collecting_context',
    now: 110,
  });
  return transitionPromptForgeJob(collecting, {
    expectedRevision: 2,
    status: 'failed',
    errorCode: 'interrupted',
    now: 120,
  });
}

describe('Prompt Forge recovery', () => {
  it('offers explicit restore, resume, and discard actions without choosing one automatically', () => {
    const handlers = {
      onRestore: vi.fn(),
      onResume: vi.fn(),
      onDiscard: vi.fn(),
    };
    render(
      <PromptForgeRecovery
        job={interruptedJob()}
        loading={false}
        error={null}
        resumeDisabledReason={null}
        needsContextConfirmation={false}
        compact={false}
        onConfirmContextChange={vi.fn()}
        onReturnFocus={vi.fn()}
        {...handlers}
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(/interrupted prompt forge upgrade/i);
    expect(handlers.onRestore).not.toHaveBeenCalled();
    expect(handlers.onResume).not.toHaveBeenCalled();
    expect(handlers.onDiscard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Restore interrupted draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume interrupted upgrade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard interrupted upgrade' }));
    expect(handlers.onRestore).toHaveBeenCalledOnce();
    expect(handlers.onResume).toHaveBeenCalledOnce();
    expect(handlers.onDiscard).toHaveBeenCalledOnce();
  });

  it('disables recovery actions while work is pending and exposes a safe error', () => {
    render(
      <PromptForgeRecovery
        job={interruptedJob()}
        loading
        error="Prompt Forge could not resume the interrupted upgrade."
        resumeDisabledReason={null}
        needsContextConfirmation={false}
        compact
        onRestore={vi.fn()}
        onResume={vi.fn()}
        onDiscard={vi.fn()}
        onConfirmContextChange={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toMatch(/could not resume/i);
    for (const button of screen.getAllByRole('button')) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
  });

  it('requires explicit current-context confirmation and focuses Resume when confirmed', async () => {
    const onConfirmContextChange = vi.fn();
    const props = {
      job: interruptedJob(),
      loading: false,
      error: null,
      compact: false,
      onRestore: vi.fn(),
      onResume: vi.fn(),
      onDiscard: vi.fn(),
      onConfirmContextChange,
      onReturnFocus: vi.fn(),
    };
    const { rerender } = render(
      <PromptForgeRecovery
        {...props}
        resumeDisabledReason="Reattach the saved items or confirm that this resume may use the current context."
        needsContextConfirmation
      />,
    );

    expect(screen.getByText(/reattach the saved items/i)).toBeTruthy();
    const resume = screen.getByRole('button', { name: 'Resume interrupted upgrade' });
    expect(resume.hasAttribute('disabled')).toBe(true);
    const confirm = screen.getByRole('button', { name: 'Confirm current recovery context' });
    confirm.focus();
    fireEvent.click(confirm);
    expect(onConfirmContextChange).toHaveBeenCalledOnce();
    rerender(
      <PromptForgeRecovery
        {...props}
        resumeDisabledReason={null}
        needsContextConfirmation={false}
      />,
    );
    await waitFor(() => expect(document.activeElement).toBe(resume));
  });

  it('returns focus to the Composer after a successful discard', async () => {
    const onDiscard = vi.fn(async () => true);
    render(
      <>
        <textarea aria-label="Composer prompt" />
        <PromptForgeRecovery
          job={interruptedJob()}
          loading={false}
          error={null}
          resumeDisabledReason={null}
          needsContextConfirmation={false}
          compact={false}
          onRestore={vi.fn()}
          onResume={vi.fn()}
          onDiscard={onDiscard}
          onConfirmContextChange={vi.fn()}
          onReturnFocus={() => screen.getByRole('textbox', { name: 'Composer prompt' }).focus()}
        />
      </>,
    );

    const discard = screen.getByRole('button', { name: 'Discard interrupted upgrade' });
    discard.focus();
    fireEvent.click(discard);

    await waitFor(() => expect(onDiscard).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Composer prompt' })),
    );
  });

  it('focuses Restore when context is confirmed but the persisted model still blocks Resume', async () => {
    const props = {
      job: interruptedJob(),
      loading: false,
      error: null,
      compact: false,
      onRestore: vi.fn(),
      onResume: vi.fn(),
      onDiscard: vi.fn(),
      onConfirmContextChange: vi.fn(),
      onReturnFocus: vi.fn(),
    };
    const modelError = 'The saved Prompt Forge model is not currently available.';
    const { rerender } = render(
      <PromptForgeRecovery {...props} resumeDisabledReason={modelError} needsContextConfirmation />,
    );

    const confirm = screen.getByRole('button', { name: 'Confirm current recovery context' });
    confirm.focus();
    fireEvent.click(confirm);
    rerender(
      <PromptForgeRecovery
        {...props}
        resumeDisabledReason={modelError}
        needsContextConfirmation={false}
      />,
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Restore interrupted draft' }),
      ),
    );
  });
});
