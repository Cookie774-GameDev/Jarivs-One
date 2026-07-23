import * as React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { SPEECH_SYNTHESIS_END_EVENT, SPEECH_SYNTHESIS_START_EVENT } from './speechSynthesis';
import { setWakeWordEnabled } from './wakeWord';

const mocks = vi.hoisted(() => ({
  speakWithSettings: vi.fn(async () => undefined),
  toastWarning: vi.fn(),
}));

vi.mock('./voiceRouter', () => ({
  speakWithSettings: mocks.speakWithSettings,
  syncVoiceModuleOpenState: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    warning: mocks.toastWarning,
  },
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

  it('uses precise shared narration when wake recognition cannot access the microphone', async () => {
    render(<WakeWordHost />);
    await act(async () => {
      await Promise.resolve();
    });
    const recognition = recognitionInstances[0]!;

    act(() => {
      recognition.onerror?.({ error: 'not-allowed' });
    });

    expect(mocks.toastWarning).toHaveBeenCalledWith(
      'Wake word unavailable',
      'The action failed, sir. Action: Wake-word microphone. Cause: Jarvis could not access the microphone. Check microphone permissions and device availability.',
    );
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(useUIStore.getState().voiceModalOpen).toBe(false);
  });

  it('does not expose acknowledgement playback exception details after opening voice', async () => {
    mocks.speakWithSettings.mockRejectedValueOnce(
      new Error('synthetic acknowledgement implementation detail'),
    );
    render(<WakeWordHost />);
    await act(async () => {
      await Promise.resolve();
    });
    const recognition = recognitionInstances[0]!;

    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            length: 1,
            isFinal: true,
            0: { transcript: 'hey jarvis' },
          },
        },
      });
    });
    expect(useUIStore.getState().voiceModalOpen).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(140);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.toastWarning).toHaveBeenCalledWith(
      'Voice acknowledgement unavailable',
      'The action failed, sir. Action: Voice acknowledgement. Cause: Jarvis could not play the wake-word acknowledgement. Voice mode is still open.',
    );
    expect(mocks.toastWarning.mock.calls[0]?.[1]).not.toContain(
      'synthetic acknowledgement implementation detail',
    );
  });
});
