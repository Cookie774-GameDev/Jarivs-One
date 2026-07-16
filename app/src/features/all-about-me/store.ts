import { create } from 'zustand';
import {
  ALL_ABOUT_ME_UPDATE_INTERVAL,
  buildAllAboutMeMarkdown,
  type AllAboutMeAnswers,
} from './profile';
import { sanitizeAllAboutMeMarkdown } from './allAboutMeSecurity';

export type AllAboutMeSource = 'empty' | 'quiz' | 'chat-learning' | 'manual';
export type AllAboutMeTestMode = 'create' | 'update';

export interface AllAboutMeTestDraft {
  selectedModelId: string;
  mode: AllAboutMeTestMode;
  questionValues: Record<string, string>;
  updatedAt: number;
}

interface AllAboutMeState {
  accountScope: string;
  markdown: string;
  quizAnswers: AllAboutMeAnswers | null;
  testDraft: AllAboutMeTestDraft | null;
  source: AllAboutMeSource;
  updatedAt: number | null;
  totalUserMessages: number;
  lastUpdatedAtMessageCount: number;
  learningEnabled: boolean;

  saveQuizProfile: (answers: AllAboutMeAnswers, markdown?: string) => void;
  saveTestDraft: (draft: Omit<AllAboutMeTestDraft, 'updatedAt'>) => void;
  clearTestDraft: () => void;
  setMarkdown: (markdown: string) => void;
  recordUserMessage: () => void;
  needsLearningUpdate: () => boolean;
  applyLearningRevision: (markdown: string) => void;
  setLearningEnabled: (enabled: boolean) => void;
  deleteProfile: (confirmation: string) => boolean;
  resetProfile: () => void;
  setAccountScope: (accountId: string) => void;
}

const emptyState = {
  accountScope: '',
  markdown: '',
  quizAnswers: null,
  testDraft: null,
  source: 'empty' as AllAboutMeSource,
  updatedAt: null,
  totalUserMessages: 0,
  lastUpdatedAtMessageCount: 0,
  learningEnabled: true,
};

export const useAllAboutMeStore = create<AllAboutMeState>()(
    (set, get) => ({
      ...emptyState,

      saveQuizProfile: (answers, markdown) => {
        const nextMarkdown = sanitizeAllAboutMeMarkdown(markdown?.trim() || buildAllAboutMeMarkdown(answers));
        set({
          quizAnswers: answers,
          markdown: nextMarkdown,
          source: 'quiz',
          updatedAt: Date.now(),
          learningEnabled: true,
          lastUpdatedAtMessageCount: get().totalUserMessages,
          testDraft: null,
        });
      },

      saveTestDraft: (draft) =>
        set({
          testDraft: {
            ...draft,
            updatedAt: Date.now(),
          },
        }),

      clearTestDraft: () => set({ testDraft: null }),

      setMarkdown: (markdown) =>
        set({
          markdown: sanitizeAllAboutMeMarkdown(markdown),
          source: sanitizeAllAboutMeMarkdown(markdown) ? 'manual' : 'empty',
          updatedAt: sanitizeAllAboutMeMarkdown(markdown) ? Date.now() : null,
        }),

      recordUserMessage: () =>
        set((state) => ({ totalUserMessages: state.totalUserMessages + 1 })),

      // All About Me is an intentional stable profile. Automatic interaction
      // preferences belong exclusively to the account-scoped learning.md
      // store, so the legacy runtime cadence is declined at its existing gate.
      needsLearningUpdate: () => false,

      // The runtime may still call this for an explicit user-requested profile
      // refresh. Automatic calls are prevented by needsLearningUpdate().
      applyLearningRevision: (markdown) => {
        const next = sanitizeAllAboutMeMarkdown(markdown);
        if (!next) return;
        set((state) => ({
          markdown: next,
          source: 'chat-learning',
          updatedAt: Date.now(),
          lastUpdatedAtMessageCount: state.totalUserMessages,
        }));
      },

      setLearningEnabled: (enabled) => set({ learningEnabled: enabled }),

      deleteProfile: (confirmation) => {
        if (confirmation !== 'delete') return false;
        set({ ...emptyState, accountScope: get().accountScope });
        return true;
      },

      resetProfile: () => set({ ...emptyState, accountScope: get().accountScope }),
      setAccountScope: (rawAccountId) => {
        const accountScope = rawAccountId.trim() || 'local-unassigned';
        if (accountScope === get().accountScope) return;
        set({ ...emptyState, accountScope });
      },
    }),
);

export { ALL_ABOUT_ME_UPDATE_INTERVAL };
