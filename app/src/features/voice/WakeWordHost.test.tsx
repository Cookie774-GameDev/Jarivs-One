import * as React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { SPEECH_SYNTHESIS_END_EVENT, SPEECH_SYNTHESIS_START_EVENT } from './speechSynthesis';
import { setWakeWordEnabled } from './wakeWord';

const mocks = vi.hoisted(() => ({
  speakWithSettings: vi.fn(async () => undefined),
}));

vi.mock('./voiceRouter', () => ({
  speakWithSettings: mocks.speakWithSettings,
}));

import { WakeWordHost } from './WakeWordHost';

type ResultHandler = ((event: unknown) => void) | null;
type ErrorHandler = ((event: unknown) => void) | null;
type EndHandler = ((event: Event) => void) | null;

const recognitionInstances: MockWakeRecognition[] = [];

class MockWakeRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  maxAlternatives = 1;
  onresult: ResultHandler = null;
  onerror: ErrorHandler = null;
  onend: EndHandler = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.(new Event('end'));
  });
  abort = vi.fn(() => {
    this.onend?.(new Event('end'));
  });

  constructor() {
    recognitionInstances.push(this);
  }
}

describe('WakeWordHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    recognitionInstances.length = 0;
    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockWakeRecognition,
      configurable: true,
    });
    setWakeWordEnabled(true);
    useAuthStore.setState({ voiceAutoListenOnOpen: true });
    useUIStore.setState({ voiceModalOpen: false, voiceListening: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    setWakeWordEnabled(false);
    Reflect.deleteProperty(window, 'SpeechRecognition');
  });

  it('pauses wake recognition while Jarvis is speaking', async () => {
    render(<WakeWordHost />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(recognitionInstances).toHaveLength(1);
    const first = recognitionInstances[0]!;

    act(() => {
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_START_EVENT));
    });

    expect(first.abort).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new CustomEvent(SPEECH_SYNTHESIS_END_EVENT));
      vi.advanceTimersByTime(800);
    });

    expect(recognitionInstances).toHaveLength(2);
  });
});
