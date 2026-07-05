import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatId } from '@/types/common';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';
import type { JarvisChatAgent, JarvisInteractionMode } from './types';
import { normalizeInteractionMode } from './modes';

interface JarvisInteractionState {
  modesByChat: Record<string, JarvisInteractionMode>;
  planSafeApprovalsByChat: Record<string, boolean>;
  agentsByChat: Record<string, JarvisChatAgent[]>;
  modeForChat: (chatId: ChatId | string) => JarvisInteractionMode;
  setChatMode: (chatId: ChatId | string, mode: JarvisInteractionMode) => void;
  setPlanSafeApproval: (chatId: ChatId | string, approved: boolean) => void;
  hasPlanSafeApproval: (chatId: ChatId | string) => boolean;
  upsertAgent: (chatId: ChatId | string, agent: JarvisChatAgent) => void;
  updateAgent: (chatId: ChatId | string, agentId: string, patch: Partial<JarvisChatAgent>) => void;
  agentsForChat: (chatId: ChatId | string) => JarvisChatAgent[];
}

function key(chatId: ChatId | string): string {
  return String(chatId);
}

export const useJarvisInteractionStore = create<JarvisInteractionState>()(
  persist(
    (set, get) => ({
      modesByChat: {},
      planSafeApprovalsByChat: {},
      agentsByChat: {},
      modeForChat(chatId) {
        return normalizeInteractionMode(get().modesByChat[key(chatId)]);
      },
      setChatMode(chatId, mode) {
        set((state) => ({
          modesByChat: {
            ...state.modesByChat,
            [key(chatId)]: mode,
          },
        }));
      },
      setPlanSafeApproval(chatId, approved) {
        set((state) => ({
          planSafeApprovalsByChat: {
            ...state.planSafeApprovalsByChat,
            [key(chatId)]: approved,
          },
        }));
      },
      hasPlanSafeApproval(chatId) {
        return Boolean(get().planSafeApprovalsByChat[key(chatId)]);
      },
      upsertAgent(chatId, agent) {
        set((state) => {
          const chatKey = key(chatId);
          const existing = state.agentsByChat[chatKey] ?? [];
          const next = [
            ...existing.filter((item) => String(item.agentId) !== String(agent.agentId)),
            agent,
          ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return {
            agentsByChat: {
              ...state.agentsByChat,
              [chatKey]: next,
            },
          };
        });
      },
      updateAgent(chatId, agentId, patch) {
        set((state) => {
          const chatKey = key(chatId);
          const existing = state.agentsByChat[chatKey] ?? [];
          return {
            agentsByChat: {
              ...state.agentsByChat,
              [chatKey]: existing.map((agent) => (
                String(agent.agentId) === agentId ? { ...agent, ...patch } : agent
              )),
            },
          };
        });
      },
      agentsForChat(chatId) {
        return get().agentsByChat[key(chatId)] ?? [];
      },
    }),
    {
      name: 'jarvis-interaction-session',
      storage: createJSONStorage(() => safeLocalStorage),
      version: 1,
      partialize: (state) => ({
        modesByChat: state.modesByChat,
        planSafeApprovalsByChat: state.planSafeApprovalsByChat,
        agentsByChat: state.agentsByChat,
      }),
    },
  ),
);
