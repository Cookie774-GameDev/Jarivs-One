import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionBlockCard } from './QuestionBlockCard';
import type { Part } from '@/types/chat';

const repo = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  messageRepo: repo,
}));

const blockPart: Extract<Part, { kind: 'question_block' }> = {
  kind: 'question_block',
  block: {
    id: 'qb_1',
    title: 'Clarify scope',
    description: 'Answer these before Jarvis continues.',
    status: 'pending',
    questions: [
      {
        id: 'q1',
        prompt: 'Which areas should Jarvis touch?',
        type: 'multi',
        required: true,
        options: [
          { id: 'chat', label: 'Chat UI' },
          { id: 'runtime', label: 'Runtime' },
        ],
      },
      {
        id: 'q2',
        prompt: 'Anything else?',
        type: 'text',
        required: false,
        placeholder: 'Add detail',
      },
    ],
  },
};

describe('QuestionBlockCard', () => {
  beforeEach(() => {
    repo.getById.mockReset();
    repo.update.mockReset();
    repo.create.mockReset();
    window.sessionStorage.clear();
    window.dispatchEvent = vi.fn();
    repo.getById.mockResolvedValue({
      id: 'msg_1',
      chat_id: 'chat_1',
      role: 'assistant',
      parts: [blockPart],
    });
    repo.update.mockResolvedValue({});
    repo.create.mockResolvedValue({});
  });

  it('shows one question at a time with a real progress label', () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    // Compact badge form: "1 / 2" (still means question 1 of 2).
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText(/Which areas should Jarvis touch/i)).toBeTruthy();
    expect(screen.queryByText(/Anything else/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Next/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Back/i })).toBeNull();
  });

  it('does not auto-advance multi-select choices before Next', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Chat UI/i }));

    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('validates the current required question before moving on', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    expect(await screen.findByText(/Please answer this question/i)).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('supports Next and Back navigation while keeping answers', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Chat UI/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    expect(await screen.findByText('2 / 2')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Add detail/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    expect(await screen.findByText('1 / 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Chat UI/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('persists answers, creates a question_answer message, and dispatches structured context', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Chat UI/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Add detail/i), {
      target: { value: 'Keep it in chat only.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      chat_id: 'chat_1',
      role: 'user',
      parts: expect.arrayContaining([
        expect.objectContaining({ kind: 'text' }),
        expect.objectContaining({ kind: 'question_answer', blockId: 'qb_1' }),
      ]),
    }));
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'jarvis:send',
      detail: expect.objectContaining({
        chatId: 'chat_1',
        structuredContext: expect.objectContaining({ kind: 'question_answers' }),
      }),
    }));
  });

  it('restores in-progress draft answers after remount', async () => {
    const first = render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);
    fireEvent.click(screen.getByRole('button', { name: /Chat UI/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Add detail/i), {
      target: { value: 'Draft answer in progress' },
    });
    first.unmount();

    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect((screen.getByPlaceholderText(/Add detail/i) as HTMLTextAreaElement).value).toBe('Draft answer in progress');

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByRole('button', { name: /Chat UI/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('cancels without sending anything to Jarvis', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    const updated = repo.update.mock.calls[0]?.[1] as { parts: Array<{ kind: string; block?: { status: string } }> };
    expect(updated.parts.find((p) => p.kind === 'question_block')?.block?.status).toBe('cancelled');
    expect(repo.create).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('marks optional blocks skipped and dispatches skipped context', async () => {
    const optionalPart: Extract<Part, { kind: 'question_block' }> = {
      ...blockPart,
      block: {
        ...blockPart.block,
        questions: [{ ...blockPart.block.questions[0], required: false, allowSkip: true }],
      },
    };
    repo.getById.mockResolvedValue({
      id: 'msg_1',
      chat_id: 'chat_1',
      role: 'assistant',
      parts: [optionalPart],
    });

    render(<QuestionBlockCard part={optionalPart} messageId={'msg_1' as never} chatId="chat_1" />);
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }));

    await waitFor(() => expect(repo.update).toHaveBeenCalledTimes(1));
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'jarvis:send',
      detail: expect.objectContaining({
        structuredContext: expect.objectContaining({
          payload: expect.objectContaining({ skipped: true }),
        }),
      }),
    }));
  });

  it('shows a single-question card without wizard chrome', () => {
    const singlePart: Extract<Part, { kind: 'question_block' }> = {
      ...blockPart,
      block: {
        ...blockPart.block,
        questions: [blockPart.block.questions[1]],
      },
    };

    render(<QuestionBlockCard part={singlePart} messageId={'msg_1' as never} chatId="chat_1" />);

    expect(screen.queryByText(/Question 1 of 1/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Next/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeTruthy();
  });
});
