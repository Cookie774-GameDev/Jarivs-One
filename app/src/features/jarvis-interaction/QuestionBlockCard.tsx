import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, HelpCircle } from 'lucide-react';
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

interface QuestionDraft {
  selected: Record<string, string[]>;
  text: Record<string, string>;
  activeIndex: number;
}

const EMPTY_DRAFT: QuestionDraft = { selected: {}, text: {}, activeIndex: 0 };

function draftKeyFor(chatId: string | undefined, blockId: string): string {
  return `jarvis-question-draft:${chatId ?? 'chat'}:${blockId}`;
}

/**
 * In-progress answers survive navigating away and back (session-scoped).
 * Corrupted or missing drafts fall back to a clean state.
 */
function readDraft(key: string): QuestionDraft {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<QuestionDraft> | null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_DRAFT;
    return {
      selected: parsed.selected && typeof parsed.selected === 'object' ? parsed.selected as Record<string, string[]> : {},
      text: parsed.text && typeof parsed.text === 'object' ? parsed.text as Record<string, string> : {},
      activeIndex: typeof parsed.activeIndex === 'number' && Number.isFinite(parsed.activeIndex) ? parsed.activeIndex : 0,
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(key: string, draft: QuestionDraft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Session storage full or unavailable - drafts are best-effort only.
  }
}

function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore - nothing to recover.
  }
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
  const draftKey = draftKeyFor(chatId, block.id);
  const initialDraft = useMemo(() => readDraft(draftKey), [draftKey]);
  const [selectedByQuestion, setSelectedByQuestion] = useState<Record<string, string[]>>(initialDraft.selected);
  const [textByQuestion, setTextByQuestion] = useState<Record<string, string>>(initialDraft.text);
  const total = block.questions.length;
  const [activeIndex, setActiveIndex] = useState(() => Math.min(Math.max(initialDraft.activeIndex, 0), Math.max(total - 1, 0)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPending = block.status === 'pending';
  const isWizard = total > 1;
  const activeQuestion = block.questions[activeIndex];
  const isLast = activeIndex >= total - 1;

  useEffect(() => {
    if (!isPending) return;
    writeDraft(draftKey, { selected: selectedByQuestion, text: textByQuestion, activeIndex });
  }, [draftKey, selectedByQuestion, textByQuestion, activeIndex, isPending]);

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

  const questionAnswered = (question: JarvisQuestion, answers: JarvisQuestionAnswer[]): boolean => {
    const answer = answers.find((item) => item.questionId === question.id);
    return Boolean((answer?.selectedOptionIds?.length ?? 0) > 0 || answer?.text?.trim());
  };

  const firstMissingRequired = (answers: JarvisQuestionAnswer[]): number => block.questions.findIndex(
    (question) => question.required && !questionAnswered(question, answers),
  );

  const persistBlockStatus = async (
    answers: JarvisQuestionAnswer[],
    status: 'answered' | 'skipped' | 'cancelled',
  ) => {
    if (!messageId) return;
    const message = await messageRepo.getById(messageId);
    if (!message) return;
    await messageRepo.update(messageId, {
      parts: message.parts.map((messagePart) => (
        messagePart.kind === 'question_block' && messagePart.block.id === block.id
          ? { kind: 'question_block', block: { ...messagePart.block, answers, status } }
          : messagePart
      )),
    });
  };

  const persistAndSend = async (answers: JarvisQuestionAnswer[], status: 'answered' | 'skipped') => {
    if (!messageId || !chatId) return;
    setBusy(true);
    await persistBlockStatus(answers, status);
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
    clearDraft(draftKey);
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

  const handleNext = () => {
    if (busy || !isPending || !activeQuestion) return;
    const answers = collectAnswers(false);
    if (activeQuestion.required && !questionAnswered(activeQuestion, answers)) {
      setError('Please answer this question before continuing.');
      return;
    }
    setError(null);
    setActiveIndex((index) => Math.min(index + 1, total - 1));
  };

  const handleBack = () => {
    if (busy || !isPending) return;
    setError(null);
    setActiveIndex((index) => Math.max(index - 1, 0));
  };

  const handleContinue = async () => {
    if (busy || !isPending) return;
    const answers = collectAnswers(false);
    const missingIndex = firstMissingRequired(answers);
    if (missingIndex !== -1) {
      setActiveIndex(missingIndex);
      setError('Please answer the required questions before continuing.');
      return;
    }
    await persistAndSend(answers, 'answered');
  };

  const handleSkip = async () => {
    if (busy || !isPending) return;
    clearDraft(draftKey);
    await persistAndSend(collectAnswers(true), 'skipped');
  };

  const handleCancel = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    clearDraft(draftKey);
    await persistBlockStatus(collectAnswers(true), 'cancelled');
    setBusy(false);
  };

  const handleTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    if (isWizard && !isLast) void handleNext();
    else void handleContinue();
  };

  const renderQuestion = (question: JarvisQuestion, index: number) => {
    const selected = selectedByQuestion[question.id] ?? [];
    return (
      <div key={question.id} className="rounded-lg border border-border/80 bg-background/60 p-3">
        <div className="mb-2 text-secondary font-medium text-foreground">
          {isWizard ? question.prompt : `${index + 1}. ${question.prompt}`}
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
          onKeyDown={handleTextKeyDown}
          onChange={(event) => {
            setError(null);
            setTextByQuestion((current) => ({ ...current, [question.id]: event.target.value }));
          }}
        />
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 p-3 shadow-[0_0_20px_-16px_hsl(var(--accent-cyan))]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
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
        {isWizard && isPending && (
          <span className="shrink-0 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-2 py-0.5 text-metadata text-muted-foreground">
            Question {activeIndex + 1} of {total}
          </span>
        )}
      </div>

      {isWizard && isPending && (
        <div className="mb-3 flex gap-1" aria-hidden>
          {block.questions.map((question, index) => (
            <span
              key={question.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                index < activeIndex
                  ? 'bg-accent-cyan/70'
                  : index === activeIndex
                    ? 'bg-accent-cyan/45'
                    : 'bg-border',
              )}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {isPending && isWizard && activeQuestion
          ? renderQuestion(activeQuestion, activeIndex)
          : block.questions.map((question, index) => renderQuestion(question, index))}
      </div>

      {error && <p className="mt-2 text-secondary text-destructive">{error}</p>}
      {!isPending && (
        <p className="mt-2 text-secondary text-muted-foreground">
          {block.status === 'skipped' ? 'Skipped.' : block.status === 'cancelled' ? 'Cancelled.' : 'Answered.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isWizard && activeIndex > 0 && (
          <Button type="button" size="sm" variant="ghost" disabled={busy || !isPending} onClick={handleBack}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>
        )}
        {isWizard && !isLast ? (
          <Button type="button" size="sm" variant="accent" disabled={busy || !isPending} onClick={handleNext}>
            Next
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="button" size="sm" variant="accent" disabled={busy || !isPending} onClick={handleContinue}>
            Continue
          </Button>
        )}
        {canSkip && (
          <Button type="button" size="sm" variant="ghost" disabled={busy || !isPending} onClick={handleSkip}>
            Skip
          </Button>
        )}
        {isPending && (
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
