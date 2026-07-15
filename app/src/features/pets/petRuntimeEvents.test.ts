import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installPetApplicationEventAdapters,
  petReactionForEvent,
  publishPetRuntimeEvent,
  resetPetRuntimeEventDedupeForTests,
  shouldAcceptPetReaction,
  subscribePetRuntimeEvents,
} from './petRuntimeEvents';

describe('Pet runtime event broker', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPetRuntimeEventDedupeForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes only typed metadata and deduplicates the same event id', () => {
    const received: string[] = [];
    const unsubscribe = subscribePetRuntimeEvents((event) => received.push(event.kind));
    const event = {
      id: 'chat-1-running',
      kind: 'chat.streaming' as const,
      sourceId: 'chat-1',
      occurredAt: 10,
    };

    publishPetRuntimeEvent(event);
    publishPetRuntimeEvent(event);

    expect(received).toEqual(['chat.streaming']);
    const persisted = localStorage.getItem('vibespace-pet-runtime-event') ?? '';
    expect(persisted).toContain('chat.streaming');
    expect(persisted).not.toMatch(/prompt|message|output|token|password/i);
    unsubscribe();
  });

  it('adapts the existing chat run-state event without copying chat content', () => {
    const received: string[] = [];
    const unsubscribe = subscribePetRuntimeEvents((event) => received.push(event.kind));
    const uninstall = installPetApplicationEventAdapters({
      subscribeAgents: false,
      subscribeTerminals: false,
    });

    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: { chatId: 'chat-real-id', status: 'running', ignoredText: 'secret prompt' },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('jarvis:run-state', {
        detail: { chatId: 'chat-real-id', status: 'done', ignoredText: 'secret reply' },
      }),
    );

    expect(received).toEqual(['chat.streaming', 'chat.completed']);
    expect(localStorage.getItem('vibespace-pet-runtime-event')).not.toContain('secret');
    uninstall();
    unsubscribe();
  });

  it('uses deterministic priority and restores lower-priority work after temporary reactions', () => {
    const working = petReactionForEvent('chat.streaming');
    const success = petReactionForEvent('chat.completed');
    const error = petReactionForEvent('app.error');

    expect(working.reaction).toBe('working');
    expect(success.priority).toBeGreaterThan(working.priority);
    expect(error.priority).toBeGreaterThan(success.priority);
    expect(shouldAcceptPetReaction(error, success, 100, 1_000)).toBe(false);
    expect(shouldAcceptPetReaction(error, success, 2_000, 1_000)).toBe(true);
  });
});
