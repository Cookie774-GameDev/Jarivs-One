import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import type { TerminalRef } from '../terminalRefs';

export const FASTER_AGENTS_MAX_TARGETS = 10;
export const FASTER_AGENTS_MAX_PHRASES = 5;
export const FASTER_AGENTS_MAX_PHRASE_LENGTH = 500;

export const DEFAULT_FASTER_AGENTS_PHRASES = [
  'FASTER',
  'GO FASTER',
  'Faster CLANKER',
  'Work FASTER',
  'Speed it up clanker',
];

/** The exact upstream seven-entry pool (including its 3x FASTER weighting). */
export const OPENWHIP_WEIGHTED_PHRASES = [
  'FASTER',
  'FASTER',
  'FASTER',
  'GO FASTER',
  'Faster CLANKER',
  'Work FASTER',
  'Speed it up clanker',
] as const;

function cleanPhrase(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .slice(0, FASTER_AGENTS_MAX_PHRASE_LENGTH);
}

export function normalizeFasterAgentsPhrases(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_FASTER_AGENTS_PHRASES];
  const phrases = value
    .filter((item): item is string => typeof item === 'string')
    .map(cleanPhrase)
    .filter((item) => item.trim().length > 0)
    .slice(0, FASTER_AGENTS_MAX_PHRASES);
  return phrases.length > 0 ? phrases : [DEFAULT_FASTER_AGENTS_PHRASES[0]!];
}

export function fasterAgentsRefKey(ref: TerminalRef): string {
  return ref.paneId || ref.sessionId || '';
}

interface FasterAgentsState {
  open: boolean;
  phase: 'select' | 'whip';
  phrases: string[];
  selectedRefs: TerminalRef[];
  soundEnabled: boolean;
  launch: () => void;
  close: () => void;
  toggleRef: (ref: TerminalRef) => boolean;
  continueToWhip: () => boolean;
  backToSelection: () => void;
  setPhrase: (index: number, value: string) => void;
  addPhrase: () => void;
  removePhrase: (index: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

export const useFasterAgentsStore = create<FasterAgentsState>()(
  persist(
    (set, get) => ({
      open: false,
      phase: 'select',
      phrases: [...DEFAULT_FASTER_AGENTS_PHRASES],
      selectedRefs: [],
      soundEnabled: true,
      launch: () => set({ open: true, phase: 'select', selectedRefs: [] }),
      close: () => set({ open: false, phase: 'select', selectedRefs: [] }),
      toggleRef: (ref) => {
        const key = fasterAgentsRefKey(ref);
        if (!key) return false;
        const selected = get().selectedRefs;
        if (selected.some((item) => fasterAgentsRefKey(item) === key)) {
          set({ selectedRefs: selected.filter((item) => fasterAgentsRefKey(item) !== key) });
          return true;
        }
        if (selected.length >= FASTER_AGENTS_MAX_TARGETS) return false;
        set({ selectedRefs: [...selected, { ...ref }] });
        return true;
      },
      continueToWhip: () => {
        if (get().selectedRefs.length === 0) return false;
        set({ phase: 'whip' });
        return true;
      },
      backToSelection: () => set({ phase: 'select' }),
      setPhrase: (index, value) =>
        set((state) => ({
          phrases: state.phrases.map((phrase, itemIndex) =>
            itemIndex === index ? cleanPhrase(value) : phrase,
          ),
        })),
      addPhrase: () =>
        set((state) =>
          state.phrases.length >= FASTER_AGENTS_MAX_PHRASES
            ? state
            : {
                phrases: [
                  ...state.phrases,
                  DEFAULT_FASTER_AGENTS_PHRASES.find((phrase) => !state.phrases.includes(phrase)) ??
                    'FASTER',
                ],
              },
        ),
      removePhrase: (index) =>
        set((state) =>
          state.phrases.length <= 1
            ? state
            : { phrases: state.phrases.filter((_, itemIndex) => itemIndex !== index) },
        ),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    }),
    {
      name: 'vibespace-faster-agents',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        phrases: normalizeFasterAgentsPhrases(state.phrases),
        soundEnabled: state.soundEnabled,
      }),
      merge: (persisted, current) => {
        const value = persisted as Partial<FasterAgentsState> | undefined;
        return {
          ...current,
          phrases: normalizeFasterAgentsPhrases(value?.phrases),
          soundEnabled: value?.soundEnabled !== false,
        };
      },
    },
  ),
);

export function pickFasterAgentsPhrase(phrases: readonly string[], random = Math.random): string {
  const valid = normalizeFasterAgentsPhrases(phrases);
  const isUntouchedOpenWhipSet =
    valid.length === DEFAULT_FASTER_AGENTS_PHRASES.length &&
    valid.every((phrase, index) => phrase === DEFAULT_FASTER_AGENTS_PHRASES[index]);
  const pool = isUntouchedOpenWhipSet ? OPENWHIP_WEIGHTED_PHRASES : valid;
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length));
  return pool[index]!;
}
