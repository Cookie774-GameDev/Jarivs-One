import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantBar } from './AssistantBar';

const mocks = vi.hoisted(() => ({
  classifyInstantCommandInput: vi.fn(),
  parseInstantCommand: vi.fn(),
  executeInstantCommand: vi.fn(),
  submitInstantCommand: vi.fn(),
  parseAssistantInput: vi.fn(() => ({ kind: 'unknown', raw: '' })),
  executeIntent: vi.fn(),
}));

vi.mock('@/features/instant-command', () => ({
  classifyInstantCommandInput: mocks.classifyInstantCommandInput,
  parseInstantCommand: mocks.parseInstantCommand,
  executeInstantCommand: mocks.executeInstantCommand,
  InstantCommandEntryBoundary: class {
    submit = mocks.submitInstantCommand;
  },
}));
vi.mock('./parse', () => ({ parseAssistantInput: mocks.parseAssistantInput }));
vi.mock('./execute', () => ({ executeIntent: mocks.executeIntent }));

describe('AssistantBar instant fast lane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.parseInstantCommand.mockReturnValue(null);
    mocks.classifyInstantCommandInput.mockReturnValue({ status: 'unmatched' });
    mocks.executeInstantCommand.mockResolvedValue({
      ok: true,
      code: 'queued',
      message: 'Queued command.',
    });
    mocks.executeIntent.mockResolvedValue({ ok: true, message: 'Legacy command.' });
    mocks.submitInstantCommand.mockImplementation(async (input: { source: string }) => {
      const classification = mocks.classifyInstantCommandInput(input.source);
      if (classification.status === 'rejected') {
        return { kind: 'rejected', reason: classification.reason };
      }
      if (classification.status === 'unmatched') return { kind: 'unmatched' };
      const result = await mocks.executeInstantCommand(classification.command);
      return {
        kind: 'command',
        receipt: {
          commandId: 'test.command',
          correlationId: 'test-correlation',
          status: result.ok ? (result.code === 'queued' ? 'queued' : 'completed') : 'rejected',
          acceptedAtMs: 1,
          targetIds: [],
        },
      };
    });
  });

  it('executes an instant command before legacy fallback', async () => {
    const command = { kind: 'open-agent-cli', provider: 'codex', count: 1 };
    mocks.parseInstantCommand.mockImplementation((input: string) =>
      input === 'open codex' ? command : null,
    );
    mocks.classifyInstantCommandInput.mockImplementation((input: string) =>
      input === 'open codex' ? { status: 'matched', command } : { status: 'unmatched' },
    );
    const onOpenChange = vi.fn();
    render(<AssistantBar open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Jarvis Assistant command' }), {
      target: { value: 'open codex' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Jarvis Assistant command' }), {
      key: 'Enter',
    });

    await waitFor(() => expect(mocks.executeInstantCommand).toHaveBeenCalledWith(command));
    expect(mocks.submitInstantCommand).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'open codex', trigger: 'typed' }),
    );
    expect(mocks.executeIntent).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and preserves a recognized failed command in recents', async () => {
    const command = { kind: 'agent-message', target: { provider: 'codex' }, payload: 'audit' };
    mocks.parseInstantCommand.mockImplementation((input: string) =>
      input === 'Codex, audit' ? command : null,
    );
    mocks.classifyInstantCommandInput.mockImplementation((input: string) =>
      input === 'Codex, audit' ? { status: 'matched', command } : { status: 'unmatched' },
    );
    mocks.executeInstantCommand.mockResolvedValue({
      ok: false,
      code: 'target_missing',
      message: 'No matching terminal.',
    });
    const onOpenChange = vi.fn();
    render(<AssistantBar open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Jarvis Assistant command' }), {
      target: { value: 'Codex, audit' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Jarvis Assistant command' }), {
      key: 'Enter',
    });

    await waitFor(() => expect(mocks.executeInstantCommand).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(JSON.parse(localStorage.getItem('jarvis-assistant-recent') ?? '[]')).toEqual([
      'Codex, audit',
    ]);
  });

  it.each([
    ['missing payload', 'tell codex to '],
    ['oversized payload', `tell codex to ${'x'.repeat(32_769)}`],
    ['control-bearing payload', 'tell codex to hello\u0000world'],
    ['invalid ordinal', 'message terminal 0: run npm test'],
    ['invalid count', 'open 11 terminals'],
  ])('never delegates rejected instant syntax to legacy execution: %s', async (_case, input) => {
    mocks.classifyInstantCommandInput.mockReturnValue({
      status: 'rejected',
      reason: 'Invalid Instant Command.',
    });
    const onOpenChange = vi.fn();
    render(<AssistantBar open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Jarvis Assistant command' }), {
      target: { value: input },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Jarvis Assistant command' }), {
      key: 'Enter',
    });

    await waitFor(() => expect(mocks.classifyInstantCommandInput).toHaveBeenCalledWith(input));
    expect(mocks.executeInstantCommand).not.toHaveBeenCalled();
    expect(mocks.executeIntent).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('serializes duplicate Enter events while one command is in flight', async () => {
    const command = { kind: 'open-agent-cli', provider: 'codex', count: 1 };
    mocks.classifyInstantCommandInput.mockReturnValue({ status: 'matched', command });
    let resolveExecution!: (result: { ok: boolean; code: string; message: string }) => void;
    mocks.executeInstantCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveExecution = resolve;
      }),
    );
    const onOpenChange = vi.fn();
    render(<AssistantBar open onOpenChange={onOpenChange} />);
    const input = screen.getByRole('textbox', { name: 'Jarvis Assistant command' });
    fireEvent.change(input, { target: { value: 'open codex' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.executeInstantCommand).toHaveBeenCalledOnce();

    resolveExecution({ ok: true, code: 'queued', message: 'Queued command.' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    mocks.executeInstantCommand.mockResolvedValue({
      ok: true,
      code: 'queued',
      message: 'Queued command.',
    });
    fireEvent.change(input, { target: { value: 'open codex' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mocks.executeInstantCommand).toHaveBeenCalledTimes(2));
  });
});
