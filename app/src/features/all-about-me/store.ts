import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import {
  ALL_ABOUT_ME_UPDATE_INTERVAL,
  buildAllAboutMeMarkdown,
  shouldUpdateAllAboutMe,
  type AllAboutMeAnswers,
} from './profile';

export type AllAboutMeSource = 'empty' | 'quiz' | 'chat-learning' | 'manual';
export type AllAboutMeTestMode = 'create' | 'update';

export interface AllAboutMeTestDraft {
  selectedModelId: string;
  mode: AllAboutMeTestMode;
  questionValues: Record<string, string>;
  updatedAt: number;
}

interface AllAboutMeState {
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
}

const emptyState = {
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
  persist(
    (set, get) => ({
      ...emptyState,

      saveQuizProfile: (answers, markdown) => {
        const nextMarkdown = markdown?.trim() || buildAllAboutMeMarkdown(answers);
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
          markdown: markdown.trim(),
          source: markdown.trim() ? 'manual' : 'empty',
          updatedAt: markdown.trim() ? Date.now() : null,
        }),

      recordUserMessage: () =>
        set((state) => ({ totalUserMessages: state.totalUserMessages + 1 })),

      needsLearningUpdate: () => {
        const state = get();
        return Boolean(
          state.learningEnabled &&
            state.markdown.trim() &&
            shouldUpdateAllAboutMe({
              totalUserMessages: state.totalUserMessages,
              lastUpdatedAtMessageCount: state.lastUpdatedAtMessageCount,
            }),
        );
      },

      applyLearningRevision: (markdown) => {
        const next = markdown.trim();
        if (!next) return;
        set((state) => ({
          markdown: next,
          source: 'chat-learning',
          updatedAt: Date.now(),
          lastUpdatedAtMessageCount: state.totalUserMessages,
        }));
      },

      setLearningEnabled: () => set({ learningEnabled: true }),

      deleteProfile: (confirmation) => {
        if (confirmation !== 'delete') return false;
        set({ ...emptyState });
        return true;
      },

      resetProfile: () => set({ ...emptyState }),
    }),
    {
      name: 'jarvis-all-about-me',
      storage: createJSONStorage(() => safeLocalStorage),
      version: 1,
      partialize: (state) => ({
        markdown: state.markdown,
        quizAnswers: state.quizAnswers,
        testDraft: state.testDraft,
        source: state.source,
        updatedAt: state.updatedAt,
        totalUserMessages: state.totalUserMessages,
        lastUpdatedAtMessageCount: state.lastUpdatedAtMessageCount,
        learningEnabled: state.learningEnabled,
      }),
    },
  ),
);

export { ALL_ABOUT_ME_UPDATE_INTERVAL };
