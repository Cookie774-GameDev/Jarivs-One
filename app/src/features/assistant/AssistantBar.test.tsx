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

    fireEvent.change(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
      target: { value: 'open codex' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
      target: { value: 'Codex, audit' },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
      target: { value: input },
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
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
    const input = screen.getByRole('combobox', { name: 'Jarvis Assistant command' });
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

  it('discovers catalog commands locally and selects an accessible capability-gated suggestion', () => {
    const onOpenChange = vi.fn();
    render(<AssistantBar open onOpenChange={onOpenChange} />);
    const input = screen.getByRole('combobox', { name: 'Jarvis Assistant command' });

    fireEvent.change(input, { target: { value: 'connect terminals' } });

    expect(screen.getByRole('listbox', { name: 'Instant Command suggestions' })).toBeTruthy();
    expect(screen.getByText(/approval · capability-gated/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Use suggestion: connect terminals one and two as a team',
      }),
    );
    expect((input as HTMLInputElement).value).toBe('connect terminals one and two as a team');
    expect(mocks.executeIntent).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('navigates suggestions with combobox semantics and selects without executing', () => {
    render(<AssistantBar open onOpenChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Jarvis Assistant command' });
    fireEvent.change(input, { target: { value: 'connect terminals' } });
    const listbox = screen.getByRole('listbox', { name: 'Instant Command suggestions' });

    expect(input.getAttribute('aria-controls')).toBe(listbox.id);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('instant-command-option-team-connect');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((input as HTMLInputElement).value).toBe('connect terminals one and two as a team');
    expect(mocks.submitInstantCommand).not.toHaveBeenCalled();
    expect(mocks.executeIntent).not.toHaveBeenCalled();
  });

  it('selects an exact credential-free provider focus through accessible /connect typeahead', () => {
    render(<AssistantBar open onOpenChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Jarvis Assistant command' });
    fireEvent.change(input, { target: { value: '/connect openr' } });

    const option = screen.getByRole('option');
    expect(option.id).toBe('instant-command-option-connections-open');
    expect(
      screen.getByRole('button', { name: 'Use suggestion: /connect openrouter' }),
    ).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((input as HTMLInputElement).value).toBe('/connect openrouter');
    expect(mocks.submitInstantCommand).not.toHaveBeenCalled();
    expect(localStorage.getItem('jarvis-assistant-recent')).toBeNull();
  });

  it('supports bounded Home, End, Escape, and typing recovery without dispatch', () => {
    render(<AssistantBar open onOpenChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Jarvis Assistant command' });
    fireEvent.change(input, { target: { value: 'open' } });
    const selectableOptions = screen
      .getAllByRole('option')
      .filter((option) => !(option.querySelector('button') as HTMLButtonElement).disabled);
    expect(selectableOptions.length).toBeGreaterThan(1);
    expect(screen.getByRole('status').textContent).toMatch(/suggestions available/i);

    fireEvent.keyDown(input, { key: 'End' });
    expect(input.getAttribute('aria-activedescendant')).toBe(selectableOptions.at(-1)?.id);
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input.getAttribute('aria-activedescendant')).toBe(selectableOptions[0]?.id);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('open');
    expect(mocks.submitInstantCommand).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'open t' } });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('does not activate or select a blocked catalog suggestion', async () => {
    render(<AssistantBar open onOpenChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Jarvis Assistant command' });
    fireEvent.change(input, { target: { value: 'rename terminal' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((input as HTMLInputElement).value).toBe('rename terminal');
    await waitFor(() => expect(mocks.submitInstantCommand).toHaveBeenCalledOnce());
  });

  it('previews the canonical catalog action, bounded target, safety, and capability before execution', () => {
    const command = {
      kind: 'catalog',
      id: 'team.message',
      family: 'team',
      authority: 'terminal-peer-fabric',
      safety: 'approval',
      slots: { remainder: 'alpha release audit' },
    };
    mocks.classifyInstantCommandInput.mockReturnValue({ status: 'matched', command });
    render(<AssistantBar open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Jarvis Assistant command' }), {
      target: { value: 'tell team alpha release audit' },
    });

    expect(screen.getByText(/team message/i)).toBeTruthy();
    expect(screen.getByText(/alpha release audit/i)).toBeTruthy();
    expect(screen.getByText(/Approval required before execution/i)).toBeTruthy();
    expect(screen.getByText(/Bundled Terminal Peer Fabric capability required/i)).toBeTruthy();
    expect(mocks.submitInstantCommand).not.toHaveBeenCalled();
    expect(mocks.executeIntent).not.toHaveBeenCalled();
  });
});
