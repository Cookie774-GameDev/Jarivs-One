import * as React from 'react';
import { AlertTriangle, Brain, Check, FileText, PauseCircle, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { generateAllAboutMeMarkdown, type AllAboutMeCompletion } from '@/features/all-about-me/ai';
import {
  completeAllAboutMePrompt,
  getAllAboutMeModelOptions,
  type AllAboutMeModelOption,
} from '@/features/all-about-me/completion';
import { useAllAboutMeStore } from '@/features/all-about-me/store';
import {
  ALL_ABOUT_ME_FILE_LOCATION,
  ALL_ABOUT_ME_TEST_QUESTIONS,
  type AllAboutMeAnswers,
  type AllAboutMeQuestionAnswer,
} from '@/features/all-about-me/profile';
import type { AllAboutMeTestMode } from '@/features/all-about-me/store';

interface AllAboutMeProps {
  completePrompt?: AllAboutMeCompletion;
  modelOptions?: AllAboutMeModelOption[];
}

const DEFAULT_ANSWERS: AllAboutMeAnswers = {
  communicationStyle: '',
  toneExamples: '',
  interests: '',
  strongReactions: '',
  preferences: ['short-direct', 'production-focused'],
  dislikedPatterns: ['placeholder-copy', 'walls-of-text'],
  responseStyle: '',
  personalNotes: '',
};

function initialQuestionValues(answers: AllAboutMeAnswers | null): Record<string, string> {
  const values: Record<string, string> = {};
  for (const question of ALL_ABOUT_ME_TEST_QUESTIONS) {
    const saved = answers?.quizResponses?.find((response) => response.questionId === question.id);
    values[question.id] = saved?.answer ?? '';
  }
  return values;
}

function answersFromQuestionValues(
  values: Record<string, string>,
  selectedModel: AllAboutMeModelOption,
): AllAboutMeAnswers {
  const responses: AllAboutMeQuestionAnswer[] = ALL_ABOUT_ME_TEST_QUESTIONS.map((question) => ({
    questionId: question.id,
    prompt: question.prompt,
    kind: question.kind,
    answer: values[question.id]?.trim() ?? '',
  }));
  const byId = (id: string) => values[id]?.trim() ?? '';
  return {
    ...DEFAULT_ANSWERS,
    communicationStyle: [
      byId('displayName') && `Call the user: ${byId('displayName')}`,
      byId('lockedInAddress') && `When locked in: ${byId('lockedInAddress')}`,
      byId('personalityWords') && `Vibe words: ${byId('personalityWords')}`,
      byId('toneExamples'),
      byId('signatureWords') && `Common words/slang: ${byId('signatureWords')}`,
    ].filter(Boolean).join('\n'),
    toneExamples: byId('toneExamples'),
    interests: [byId('currentFocus'), byId('biggestGoals'), byId('interests'), byId('attentionTopics'), byId('favoriteProjects')].filter(Boolean).join('\n'),
    strongReactions: [byId('strongReactions'), byId('energyLoss'), byId('hatedVibes'), byId('dealbreakers'), byId('neverJoke')].filter(Boolean).join('\n'),
    responseStyle: [
      byId('answerLength'),
      byId('energyLevel'),
      byId('directness'),
      byId('writeAsUserCleanup'),
      byId('humorSafety'),
      byId('youtubeReplyStyle'),
    ].filter(Boolean).join('\n'),
    personalNotes: [byId('motivation'), byId('perfectJarvis'), byId('privacyBoundaries')].filter(Boolean).join('\n'),
    preferences: [
      byId('answerLength'),
      byId('energyLevel'),
      byId('writingCleanliness'),
      byId('proofLevel'),
      byId('buildPace'),
      byId('codingPriority'),
      byId('tradeoffs'),
    ].filter(Boolean),
    dislikedPatterns: [byId('avoidPhrases'), byId('correctionStyle'), byId('cheapAppSignals'), byId('dealbreakers')].filter(Boolean),
    selectedModel: `${selectedModel.provider}/${selectedModel.model}`,
    quizResponses: responses,
  };
}

function QuestionField({
  index,
  questionId,
  prompt,
  value,
  onChange,
}: {
  index: number;
  questionId: string;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`all-about-me-${questionId}`}>{index + 1}. {prompt}</Label>
      <Textarea
        id={`all-about-me-${questionId}`}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Quick answer..."
        className="min-h-[74px]"
      />
    </div>
  );
}

function ModelChoiceCard({
  option,
  selected,
  onSelect,
}: {
  option: AllAboutMeModelOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={[
        'relative flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-all',
        selected
          ? 'border-accent-copper/70 bg-accent-copper/10 shadow-[0_0_22px_hsl(var(--accent-copper)/0.12)]'
          : 'border-border bg-background/40 hover:border-accent-cyan/50',
      ].join(' ')}
    >
      <input
        type="radio"
        name="all-about-me-model"
        aria-label={option.label}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel">
        {selected ? <Check className="h-4 w-4 text-accent-copper" /> : <Sparkles className="h-4 w-4 text-muted-foreground" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{option.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{option.provider}/{option.model}</span>
      </span>
    </label>
  );
}

export function AllAboutMe({
  completePrompt = completeAllAboutMePrompt,
  modelOptions,
}: AllAboutMeProps) {
  const markdown = useAllAboutMeStore((state) => state.markdown);
  const quizAnswers = useAllAboutMeStore((state) => state.quizAnswers);
  const testDraft = useAllAboutMeStore((state) => state.testDraft);
  const updatedAt = useAllAboutMeStore((state) => state.updatedAt);
  const totalUserMessages = useAllAboutMeStore((state) => state.totalUserMessages);
  const lastUpdatedAtMessageCount = useAllAboutMeStore((state) => state.lastUpdatedAtMessageCount);
  const saveQuizProfile = useAllAboutMeStore((state) => state.saveQuizProfile);
  const saveTestDraft = useAllAboutMeStore((state) => state.saveTestDraft);
  const clearTestDraft = useAllAboutMeStore((state) => state.clearTestDraft);
  const setLearningEnabled = useAllAboutMeStore((state) => state.setLearningEnabled);
  const deleteProfile = useAllAboutMeStore((state) => state.deleteProfile);
  const availableModels = React.useMemo(
    () => modelOptions ?? getAllAboutMeModelOptions(),
    [modelOptions],
  );
  const [selectedModelId, setSelectedModelId] = React.useState(() => testDraft?.selectedModelId ?? availableModels[0]?.id ?? '');
  const [testMode, setTestMode] = React.useState<AllAboutMeTestMode>(() => testDraft?.mode ?? 'create');
  const [testOpen, setTestOpen] = React.useState(false);
  const [questionValues, setQuestionValues] = React.useState<Record<string, string>>(() =>
    testDraft?.questionValues ?? initialQuestionValues(quizAnswers),
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState('');

  React.useEffect(() => {
    const selectedExists = availableModels.some((option) => option.id === selectedModelId);
    if ((!selectedModelId || !selectedExists) && availableModels[0]) {
      setSelectedModelId(availableModels[0].id);
    }
  }, [availableModels, selectedModelId]);

  React.useEffect(() => {
    const onRetake = () => openTest('update');
    window.addEventListener('jarvis:allaboutme:retake', onRetake);
    return () => window.removeEventListener('jarvis:allaboutme:retake', onRetake);
  }, [quizAnswers, testDraft]);

  const selectedModel = availableModels.find((option) => option.id === selectedModelId) ?? null;
  const writtenQuestions = ALL_ABOUT_ME_TEST_QUESTIONS.filter((question) => question.kind === 'written');
  const canGenerate = Boolean(selectedModel) && writtenQuestions.every((question) => (
    questionValues[question.id]?.trim().length
  ));
  const currentQuestion = ALL_ABOUT_ME_TEST_QUESTIONS[currentQuestionIndex] ?? ALL_ABOUT_ME_TEST_QUESTIONS[0]!;
  const answeredCount = ALL_ABOUT_ME_TEST_QUESTIONS.filter((question) => (questionValues[question.id] ?? '').trim()).length;

  function firstUnansweredIndex(values: Record<string, string>): number {
    const index = ALL_ABOUT_ME_TEST_QUESTIONS.findIndex((question) => !(values[question.id] ?? '').trim());
    return index === -1 ? 0 : index;
  }

  function persistDraft(nextValues = questionValues, nextMode = testMode, nextModelId = selectedModelId) {
    saveTestDraft({
      selectedModelId: nextModelId,
      mode: nextMode,
      questionValues: nextValues,
    });
  }

  function openTest(mode: AllAboutMeTestMode) {
    const nextValues = testDraft?.mode === mode ? testDraft.questionValues : initialQuestionValues(quizAnswers);
    setTestMode(mode);
    setQuestionValues(nextValues);
    setCurrentQuestionIndex(firstUnansweredIndex(nextValues));
    setSelectedModelId(testDraft?.selectedModelId ?? availableModels[0]?.id ?? '');
    setTestOpen(true);
  }

  function updateQuestionValue(questionId: string, value: string) {
    setQuestionValues((prev) => {
      const next = { ...prev, [questionId]: value };
      return next;
    });
  }

  function pauseTest() {
    persistDraft();
    setTestOpen(false);
    toast.info('AllAboutMe test saved', 'Progress is autosaved. Resume it any time.');
  }

  async function generateProfile() {
    if (!selectedModel) {
      toast.warning('Pick a real AI model first', 'AllAboutMe.md needs a configured model, not mock/demo.');
      return;
    }
    if (!canGenerate) {
      toast.warning('Finish the key questions first', 'Jarvis needs enough signal to build a useful profile.');
      return;
    }
    setGenerating(true);
    try {
      const answers = answersFromQuestionValues(questionValues, selectedModel);
      const complete = completePrompt === completeAllAboutMePrompt
        ? (prompt: string) => completeAllAboutMePrompt(prompt, selectedModel)
        : completePrompt;
      const nextMarkdown = await generateAllAboutMeMarkdown(
        answers,
        complete,
        testMode === 'update' ? markdown : undefined,
      );
      saveQuizProfile(answers, nextMarkdown);
      clearTestDraft();
      setTestOpen(false);
      toast.success('AllAboutMe.md generated', `Saved at ${ALL_ABOUT_ME_FILE_LOCATION}.`);
    } finally {
      setGenerating(false);
    }
  }

  const updateDistance = Math.max(0, 10 - (totalUserMessages - lastUpdatedAtMessageCount));
  const noRealModels = availableModels.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-accent-cyan" />
          <h2 className="text-page-title text-foreground">All About Me</h2>
        </div>
        <p className="mt-1 max-w-2xl text-secondary text-muted-foreground">
          Build `AllAboutMe.md`, a private personality profile Jarvis uses to match your
          tone, preferences, interests, reaction patterns, and writing style across chat.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-metadata text-sage">
            {markdown ? 'Profile active' : 'Quiz not finished'}
          </Badge>
          <Badge variant="outline" className="text-metadata">
            Learns every 10 user messages
          </Badge>
          {updatedAt ? (
            <Badge variant="outline" className="text-metadata">
              Updated {new Date(updatedAt).toLocaleString()}
            </Badge>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent-copper" />
              60-question test
            </CardTitle>
            <CardDescription>
              Pick one real AI model in the popup, pause any time, and save progress automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-background/40 p-4 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-ui-strong text-foreground">Popup test page</div>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    A separate 60-question test opens in a focused popup, autosaves unfinished progress,
                    and uses one real AI model from the dropdown for grading.
                  </p>
                </div>
                <Badge variant="outline" className="text-metadata">
                  {availableModels.length} real model{availableModels.length === 1 ? '' : 's'}
                </Badge>
              </div>
              {noRealModels ? (
                <div className="mt-4 rounded-md border border-dashed border-border bg-panel/60 p-3 text-sm text-muted-foreground">
                  Connect a real AI model in Settings → Providers or download a local model before taking the test.
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={noRealModels}
                  onClick={() => openTest('create')}
                  className="shadow-[0_0_24px_hsl(var(--accent-copper)/0.24),inset_0_1px_0_hsl(var(--foreground)/0.08)] hover:shadow-[0_0_34px_hsl(var(--accent-copper)/0.34),inset_0_1px_0_hsl(var(--foreground)/0.12)]"
                >
                  <Brain className="h-3.5 w-3.5" />
                  Take the test
                </Button>
                {testDraft ? (
                  <Button type="button" variant="secondary" onClick={() => openTest(testDraft.mode)}>
                    <PauseCircle className="h-3.5 w-3.5" />
                    Resume saved test
                  </Button>
                ) : null}
                {markdown ? (
                  <Button type="button" variant="ghost" onClick={() => openTest('update')}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retake to update scores
                  </Button>
                ) : null}
              </div>
            </div>

            {markdown ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div className="flex-1">
                    <div className="text-ui-strong text-foreground">Danger zone</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Delete the entire profile only when you want a true fresh retake.
                    </p>
                    {!deleteArmed ? (
                      <Button type="button" variant="ghost" className="mt-3 text-destructive" onClick={() => setDeleteArmed(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete AllAboutMe.md
                      </Button>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="all-about-me-delete-confirm">Type delete to confirm</Label>
                          <input
                            id="all-about-me-delete-confirm"
                            value={deleteConfirmation}
                            onChange={(event) => setDeleteConfirmation(event.currentTarget.value)}
                            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={deleteConfirmation !== 'delete'}
                          onClick={() => {
                            if (deleteProfile(deleteConfirmation)) {
                              setDeleteConfirmation('');
                              setDeleteArmed(false);
                              toast.success('AllAboutMe.md deleted', 'You can now take a completely fresh test.');
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent-cyan" />
              AllAboutMe.md
            </CardTitle>
            <CardDescription>
              Jarvis reads this as bounded context and improves it from chat patterns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
              <div>
                <div className="text-ui-strong text-foreground">Chat learning</div>
                <p className="text-metadata text-muted-foreground">
                  {markdown
                    ? updateDistance === 0
                      ? 'After every 10 user messages, Jarvis can learn on the next turn and writes a visible AllAboutMe.md activity row.'
                      : `After every 10 user messages, Jarvis updates AllAboutMe.md. ${updateDistance} message${updateDistance === 1 ? '' : 's'} until the next check.`
                    : 'After every 10 user messages, Jarvis can update AllAboutMe.md once the quiz creates a profile.'}
                </p>
              </div>
              <Switch
                aria-label="AllAboutMe chat learning is always on"
                checked
                disabled
                onCheckedChange={setLearningEnabled}
              />
            </div>
            {markdown ? (
              <div className="rounded-md border border-border bg-background/40 p-3">
                <div className="text-ui-strong text-foreground">File location</div>
                <p className="mt-1 font-mono text-xs text-accent-cyan">{ALL_ABOUT_ME_FILE_LOCATION}</p>
              </div>
            ) : null}

            {markdown ? (
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-black/20 p-4 text-xs leading-5 text-foreground">
                {markdown}
              </pre>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-background/40 p-5 text-secondary text-muted-foreground">
                Finish the quiz to generate the first profile. Jarvis will use that document to
                match your tone and keep improving it after every 10 user messages.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog
        open={testOpen}
        onOpenChange={(open) => {
          if (!open && testOpen) persistDraft();
          setTestOpen(open);
        }}
      >
        <DialogContent hideClose className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
          <div className="border-b border-border bg-panel/95 px-5 py-4">
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle>All About Me Test</DialogTitle>
                  <DialogDescription>
                    {testMode === 'update'
                      ? 'Retake mode updates the existing AllAboutMe.md with newer scores and answers.'
                      : 'Create mode builds the first detailed AllAboutMe.md profile.'}
                  </DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={pauseTest} aria-label="Close and save test">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label htmlFor="all-about-me-model-select">AI model for grading</Label>
                <select
                  id="all-about-me-model-select"
                  aria-label="AI model for grading"
                  value={selectedModelId}
                  onChange={(event) => {
                    setSelectedModelId(event.currentTarget.value);
                    persistDraft(questionValues, testMode, event.currentTarget.value);
                  }}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  {availableModels.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} - {option.provider}/{option.model}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-accent-copper">Progress</div>
                <div className="mt-1 text-sm text-foreground">
                  {answeredCount}/{ALL_ABOUT_ME_TEST_QUESTIONS.length} answered
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-background/35 p-5 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className="text-metadata">
                  Question {currentQuestionIndex + 1} of {ALL_ABOUT_ME_TEST_QUESTIONS.length}
                </Badge>
                <span className="text-xs text-accent-copper">You are flying through this.</span>
              </div>
              {currentQuestion.kind === 'written' ? (
                <QuestionField
                  key={currentQuestion.id}
                  index={currentQuestionIndex}
                  questionId={currentQuestion.id}
                  prompt={currentQuestion.prompt}
                  value={questionValues[currentQuestion.id] ?? ''}
                  onChange={(value) => updateQuestionValue(currentQuestion.id, value)}
                />
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    {currentQuestionIndex + 1}. {currentQuestion.prompt}
                  </div>
                  <div className="grid gap-2">
                    {(currentQuestion.options ?? []).map((option) => {
                      const selected = questionValues[currentQuestion.id] === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => updateQuestionValue(currentQuestion.id, option)}
                          className={[
                            'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                            selected
                              ? 'border-accent-copper/70 bg-accent-copper/10 text-foreground'
                              : 'border-border bg-background/40 text-muted-foreground hover:text-foreground',
                          ].join(' ')}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-panel/95 px-5 py-4">
            <p className="text-xs text-muted-foreground">
              Closing this popup autosaves. Pause saves instantly so you can complete it later.
            </p>
            <div className="flex flex-wrap gap-2">
              {markdown ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    persistDraft();
                    setTestOpen(false);
                    setDeleteArmed(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete AllAboutMe.md
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={pauseTest}>
                <PauseCircle className="h-3.5 w-3.5" />
                Pause and save
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
              >
                Back
              </Button>
              {currentQuestionIndex < ALL_ABOUT_ME_TEST_QUESTIONS.length - 1 ? (
                <Button
                  type="button"
                  onClick={() => setCurrentQuestionIndex((index) => Math.min(ALL_ABOUT_ME_TEST_QUESTIONS.length - 1, index + 1))}
                >
                  Next
                </Button>
              ) : (
                <Button type="button" onClick={generateProfile} disabled={generating || !canGenerate}>
                  {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate AllAboutMe.md
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
