import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatId } from '@/types/common';
import {
  cycleInteractionMode,
  interactionModeLabel,
  modeFromSlashCommand,
} from './modes';
import { useJarvisInteractionStore } from './sessionStore';

describe('Jarvis interaction modes', () => {
  beforeEach(() => {
    useJarvisInteractionStore.setState(useJarvisInteractionStore.getInitialState());
  });

  it('cycles Agent -> Plan -> Ask -> Agent for Shift+Tab', () => {
    expect(cycleInteractionMode('agent')).toBe('plan');
    expect(cycleInteractionMode('plan')).toBe('ask');
    expect(cycleInteractionMode('ask')).toBe('agent');
  });

  it('maps slash commands to interaction modes', () => {
    expect(modeFromSlashCommand('ask')).toBe('ask');
    expect(modeFromSlashCommand('plan')).toBe('plan');
    expect(modeFromSlashCommand('multitask')).toBe('agent');
    expect(modeFromSlashCommand('unknown')).toBeNull();
  });

  it('persists mode per chat with Agent Mode as the default', () => {
    const chatA = 'chat_a' as ChatId;
    const chatB = 'chat_b' as ChatId;

    expect(useJarvisInteractionStore.getState().modeForChat(chatA)).toBe('agent');
    useJarvisInteractionStore.getState().setChatMode(chatA, 'plan');

    expect(useJarvisInteractionStore.getState().modeForChat(chatA)).toBe('plan');
    expect(useJarvisInteractionStore.getState().modeForChat(chatB)).toBe('agent');
  });

  it('exposes user-facing labels for composer chips', () => {
    expect(interactionModeLabel('agent')).toBe('Agent Mode');
    expect(interactionModeLabel('plan')).toBe('Plan Mode');
    expect(interactionModeLabel('ask')).toBe('Ask Mode');
  });
});
