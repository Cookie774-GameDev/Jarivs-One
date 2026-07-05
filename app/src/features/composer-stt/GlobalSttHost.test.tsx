import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSttHost } from './GlobalSttHost';
import {
  COMPOSER_STT_TOGGLE_EVENT,
  requestComposerSttToggle,
} from './composerSttService';
import { rememberSttEditableFromFocus, resetSttFocusMemoryForTests } from './insertText';

const voiceMocks = vi.hoisted(() => ({
  startListening: vi.fn(() => true),
  stopListening: vi.fn(),
  isSupported: vi.fn(() => true),
  isListening: vi.fn(() => false),
  wantsListening: vi.fn(() => false),
  setInactivityTimeoutMs: vi.fn(),
  interruptListening: vi.fn(),
  onVoice: vi.fn(() => () => {}),
}));

const setComposerSttListening = vi.hoisted(() => vi.fn());

vi.mock('@/features/voice/VoiceService', () => ({
  VoiceService: {
    startListening: voiceMocks.startListening,
    stopListening: voiceMocks.stopListening,
    isSupported: voiceMocks.isSupported,
    isListening: voiceMocks.isListening,
    wantsListening: voiceMocks.wantsListening,
    setInactivityTimeoutMs: voiceMocks.setInactivityTimeoutMs,
    interruptListening: voiceMocks.interruptListening,
    on: voiceMocks.onVoice,
  },
}));

vi.mock('@/stores/ui', () => ({
  useUIStore: (selector: (state: { composerStt: boolean; setComposerSttListening: typeof setComposerSttListening }) => unknown) =>
    selector({
      composerStt: true,
      setComposerSttListening,
    }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GlobalSttHost', () => {
  beforeEach(() => {
    resetSttFocusMemoryForTests();
    voiceMocks.startListening.mockClear();
    voiceMocks.stopListening.mockClear();
    voiceMocks.isSupported.mockClear();
    voiceMocks.isListening.mockClear();
    voiceMocks.isListening.mockReturnValue(false);
    voiceMocks.interruptListening.mockClear();
    setComposerSttListening.mockClear();
  });

  it('starts dictation for the last focused global field after toolbar mic steals focus', () => {
    render(<GlobalSttHost />);

    const field = document.createElement('textarea');
    field.id = 'agent-prompt';
    document.body.appendChild(field);
    field.focus();
    rememberSttEditableFromFocus(field);

    const micButton = document.createElement('button');
    document.body.appendChild(micButton);
    micButton.focus();

    requestComposerSttToggle('toolbar');

    expect(voiceMocks.startListening).toHaveBeenCalledTimes(1);
    expect(setComposerSttListening).toHaveBeenCalledWith(true);

    field.remove();
    micButton.remove();
  });

  it('preempts an active Jarvis voice listener when toolbar dictation starts', () => {
    render(<GlobalSttHost />);

    const field = document.createElement('textarea');
    field.id = 'hands-free-field';
    document.body.appendChild(field);
    field.focus();
    rememberSttEditableFromFocus(field);

    voiceMocks.isListening.mockReturnValue(true);

    requestComposerSttToggle('toolbar');

    expect(voiceMocks.interruptListening).toHaveBeenCalledTimes(1);
    expect(voiceMocks.startListening).toHaveBeenCalledTimes(1);
    expect(setComposerSttListening).toHaveBeenCalledWith(true);

    field.remove();
  });

  it('does not start when no text field was recently focused', () => {
    render(<GlobalSttHost />);

    const micButton = document.createElement('button');
    document.body.appendChild(micButton);
    micButton.focus();

    window.dispatchEvent(new CustomEvent(COMPOSER_STT_TOGGLE_EVENT, { detail: { source: 'toolbar' } }));

    expect(voiceMocks.startListening).not.toHaveBeenCalled();

    micButton.remove();
  });

  it('does not interrupt Jarvis voice when toolbar dictation has no target field', () => {
    render(<GlobalSttHost />);

    const micButton = document.createElement('button');
    document.body.appendChild(micButton);
    micButton.focus();
    voiceMocks.isListening.mockReturnValue(true);

    window.dispatchEvent(new CustomEvent(COMPOSER_STT_TOGGLE_EVENT, { detail: { source: 'toolbar' } }));

    expect(voiceMocks.interruptListening).not.toHaveBeenCalled();
    expect(voiceMocks.startListening).not.toHaveBeenCalled();

    micButton.remove();
  });
});
