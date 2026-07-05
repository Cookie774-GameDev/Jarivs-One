import { useMemo, useState } from 'react';
import { Check, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messageRepo } from '@/lib/db/repositories';
import type { MessageId, Part } from '@/types';
import type { JarvisQuestion, JarvisQuestionAnswer } from './types';

type QuestionBlockPart = Extract<Part, { kind: 'question_block' }>;

export interface QuestionBlockCardProps {
  part: QuestionBlockPart;
  messageId?: MessageId;
  chatId?: string;
}

function answerLabel(question: JarvisQuestion, answer: JarvisQuestionAnswer): string {
  if (answer.skipped) return `${question.prompt}: skipped`;
  const choiceLabels = (answer.selectedOptionIds ?? [])
    .map((id) => question.options?.find((option) => option.id === id)?.label ?? id)
    .filter(Boolean);
  const text = answer.text?.trim();
  return `${question.prompt}: ${[...choiceLabels, text].filter(Boolean).join(', ') || 'answered'}`;
}

function buildAnswerSummary(questions: JarvisQuestion[], answers: JarvisQuestionAnswer[]): string {
  return answers.map((answer) => {
    const question = questions.find((item) => item.id === answer.questionId);
    return question ? answerLabel(question, answer) : `${answer.questionId}: answered`;
  }).join('\n');
}

export function QuestionBlockCard({ part, messageId, chatId }: QuestionBlockCardProps) {
  const { block } = part;
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>({});
  const [textByQuestion, setTextByQuestion] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSkip = useMemo(
    () => block.questions.every((question) => !question.required || question.allowSkip),
    [block.questions],
  );

  const collectAnswers = (skipped = false): JarvisQuestionAnswer[] => block.questions.map((question) => ({
    questionId: question.id,
    selectedOptionIds: skipped ? [] : selectedByQuestion[question.id] ?? [],
    text: skipped ? '' : (textByQuestion[question.id] ?? '').trim(),
    skipped,
  }));

  const hasRequiredAnswers = (answers: JarvisQuestionAnswer[]): boolean => block.questions.every((question) => {
    if (!question.required) return true;
    const answer = answers.find((item) => item.questionId === question.id);
    return Boolean((answer?.selectedOptionIds?.length ?? 0) > 0 || answer?.text?.trim());
  });

  const persistAndSend = async (answers: JarvisQuestionAnswer[], status: 'answered' | 'skipped') => {
    if (!messageId || !chatId) return;
    setBusy(true);
    const message = await messageRepo.getById(messageId);
    if (message) {
      await messageRepo.update(messageId, {
        parts: message.parts.map((messagePart) => (
          messagePart.kind === 'question_block' && messagePart.block.id === block.id
            ? { kind: 'question_block', block: { ...messagePart.block, answers, status } }
            : messagePart
        )),
      });
    }
    await messageRepo.create({
      chat_id: chatId as never,
      role: 'user',
      parts: [
        { kind: 'text', text: status === 'skipped' ? `Skipped: ${block.title ?? 'Jarvis questions'}` : buildAnswerSummary(block.questions, answers) },
        { kind: 'question_answer', blockId: block.id, answers },
      ],
    });
    window.dispatchEvent(new CustomEvent('jarvis:send', {
      detail: {
        chatId,
        text: status === 'skipped'
          ? `Skipped Jarvis question block ${block.id}.`
          : buildAnswerSummary(block.questions, answers),
        structuredContext: {
          kind: 'question_answers',
          sourceMessageId: messageId,
          payload: {
            blockId: block.id,
            answers,
            skipped: status === 'skipped',
          },
        },
      },
    }));
    setBusy(false);
  };

  const toggleChoice = (question: JarvisQuestion, optionId: string) => {
    setError(null);
    setSelectedByQuestion((current) => {
      const selected = current[question.id] ?? [];
      if (question.type === 'single') return { ...current, [question.id]: [optionId] };
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      return { ...current, [question.id]: next };
    });
  };

  const handleContinue = async () => {
    if (busy || block.status !== 'pending') return;
    const answers = collectAnswers(false);
    if (!hasRequiredAnswers(answers)) {
      setError('Please answer the required questions before continuing.');
      return;
    }
    await persistAndSend(answers, 'answered');
  };

  const handleSkip = async () => {
    if (busy || block.status !== 'pending') return;
    await persistAndSend(collectAnswers(true), 'skipped');
  };

  return (
    <section className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 p-3 shadow-[0_0_20px_-16px_hsl(var(--accent-cyan))]">
      <div className="mb-3 flex items-start gap-2">
        <div className="rounded-full border border-accent-cyan/40 bg-accent-cyan/10 p-1">
          <HelpCircle className="h-3.5 w-3.5 text-accent-cyan" />
        </div>
        <div>
          <div className="text-ui-strong text-foreground">{block.title ?? 'Jarvis needs a quick answer'}</div>
          {block.description && (
            <p className="text-secondary text-muted-foreground">{block.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {block.questions.map((question, index) => {
          const selected = selectedByQuestion[question.id] ?? [];
          return (
            <div key={question.id} className="rounded-lg border border-border/80 bg-background/60 p-3">
              <div className="mb-2 text-secondary font-medium text-foreground">
                {index + 1}. {question.prompt}
                {question.required && <span className="ml-1 text-accent-copper">*</span>}
              </div>
              {question.options?.length ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {question.options.map((option) => {
                    const active = selected.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-secondary transition',
                          active
                            ? 'border-accent-cyan/70 bg-accent-cyan/15 text-foreground'
                            : 'border-border bg-elevated text-muted-foreground hover:text-foreground',
                        )}
                        aria-pressed={active}
                        onClick={() => toggleChoice(question, option.id)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {active && <Check className="h-3 w-3" />}
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <textarea
                className="min-h-16 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-secondary text-foreground outline-none focus:border-accent-cyan"
                placeholder={question.placeholder ?? 'Write your answer or add an “Other” response'}
                value={textByQuestion[question.id] ?? ''}
                onChange={(event) => {
                  setError(null);
                  setTextByQuestion((current) => ({ ...current, [question.id]: event.target.value }));
                }}
              />
            </div>
          );
        })}
      </div>

      {error && <p className="mt-2 text-secondary text-destructive">{error}</p>}
      {block.status !== 'pending' && (
        <p className="mt-2 text-secondary text-muted-foreground">
          {block.status === 'skipped' ? 'Skipped.' : 'Answered.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="accent" disabled={busy || block.status !== 'pending'} onClick={handleContinue}>
          Continue
        </Button>
        {canSkip && (
          <Button type="button" size="sm" variant="ghost" disabled={busy || block.status !== 'pending'} onClick={handleSkip}>
            Skip
          </Button>
        )}
      </div>
    </section>
  );
}
