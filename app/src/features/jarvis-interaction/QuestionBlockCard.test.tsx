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

  it('does not auto-advance multi-select choices before Continue', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Chat UI/i }));

    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('validates required answers before continuing', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText(/Please answer the required questions/i)).toBeTruthy();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('persists answers, creates a question_answer message, and dispatches structured context', async () => {
    render(<QuestionBlockCard part={blockPart} messageId={'msg_1' as never} chatId="chat_1" />);

    fireEvent.click(screen.getByRole('button', { name: /Chat UI/i }));
    fireEvent.change(screen.getByPlaceholderText(/Add detail/i), {
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
});
