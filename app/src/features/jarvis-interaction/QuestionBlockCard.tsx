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
      <div
        key={question.id}
        className="min-w-0 rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm"
        data-testid="question-block-step"
      >
        <div className="mb-3 text-[13.5px] font-medium leading-snug text-foreground break-words">
          {isWizard ? question.prompt : `${index + 1}. ${question.prompt}`}
          {question.required && (
            <span className="ml-1 font-semibold text-accent-copper" aria-hidden>
              *
            </span>
          )}
        </div>
        {question.options?.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {question.options.map((option) => {
              const active = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm leading-snug transition',
                    active
                      ? 'border-accent-copper/70 bg-accent-copper/15 text-foreground'
                      : 'border-border bg-elevated text-muted-foreground hover:border-accent-copper/40 hover:text-foreground',
                  )}
                  aria-pressed={active}
                  onClick={() => toggleChoice(question, option.id)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent-copper" />}
                    <span className="break-words">{option.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        <textarea
          className="min-h-[7.5rem] w-full resize-y rounded-xl border border-border/80 bg-paper-soft/40 px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/75 focus:border-accent-copper/70 focus:bg-background focus:ring-2 focus:ring-accent-copper/20"
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
    <section
      className="w-full min-w-0 max-w-full space-y-4 rounded-2xl border border-accent-copper/35 bg-gradient-to-b from-accent-copper/10 via-background/40 to-background/20 p-4 shadow-[0_12px_40px_-28px_hsl(var(--accent-copper))]"
      data-testid="question-block-card"
    >
      {/* Header stacks on the Inspector column so title + badge never crush. */}
      <header className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-xl border border-accent-copper/40 bg-accent-copper/15 p-2 shadow-sm">
            <HelpCircle className="h-4 w-4 text-accent-copper" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight text-foreground break-words">
                {block.title ?? 'Jarvis needs a quick answer'}
              </h3>
              {isWizard && isPending && (
                <span
                  className="w-fit shrink-0 rounded-full border border-accent-copper/40 bg-accent-copper/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-copper"
                  aria-label={`Question ${activeIndex + 1} of ${total}`}
                >
                  {activeIndex + 1} / {total}
                </span>
              )}
            </div>
            {block.description ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground break-words">
                {block.description}
              </p>
            ) : null}
          </div>
        </div>

        {isWizard && isPending && (
          <div className="flex items-center gap-2" aria-hidden>
            {block.questions.map((question, index) => (
              <span
                key={question.id}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all duration-300',
                  index < activeIndex
                    ? 'bg-accent-copper'
                    : index === activeIndex
                      ? 'bg-accent-copper/55 shadow-[0_0_10px_hsl(var(--accent-copper)/0.35)]'
                      : 'bg-border/80',
                )}
              />
            ))}
          </div>
        )}
      </header>

      <div className="flex min-w-0 flex-col gap-3">
        {isPending && isWizard && activeQuestion
          ? renderQuestion(activeQuestion, activeIndex)
          : block.questions.map((question, index) => renderQuestion(question, index))}
      </div>

      {error && (
        <p className="text-sm leading-snug text-destructive break-words" role="alert">
          {error}
        </p>
      )}
      {!isPending && (
        <p className="text-sm text-muted-foreground">
          {block.status === 'skipped' ? 'Skipped.' : block.status === 'cancelled' ? 'Cancelled.' : 'Answered.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
