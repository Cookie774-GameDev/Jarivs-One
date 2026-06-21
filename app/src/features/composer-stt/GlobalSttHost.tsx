import * as React from 'react';
import { toast } from '@/components/ui/toast';
import { VoiceService } from '@/features/voice/VoiceService';
import { useUIStore } from '@/stores/ui';
import {
  COMPOSER_STT_STOP_EVENT,
  COMPOSER_STT_TOGGLE_EVENT,
  type ComposerSttToggleSource,
} from './composerSttService';
import { insertTextIntoFocusedEditable, isGlobalSttEditable } from './insertText';

/**
 * Focus-aware speech-to-text for any in-app text field that is not the chat
 * composer or an xterm pane. Top-bar mic and Ctrl+CapsLock dispatch the same
 * toggle event; this host handles agent prompts, settings fields, etc.
 */
export function GlobalSttHost() {
  const composerSttEnabled = useUIStore((s) => s.composerStt);
  const setComposerSttListening = useUIStore((s) => s.setComposerSttListening);
  const [listening, setListening] = React.useState(false);
  const targetRef = React.useRef<HTMLElement | null>(null);

  const stop = React.useCallback(() => {
    targetRef.current = null;
    setListening(false);
    setComposerSttListening(false);
    try {
      VoiceService.stopListening();
    } catch {
      // Engine may already be torn down.
    }
  }, [setComposerSttListening]);

  const start = React.useCallback(() => {
    const focused = document.activeElement;
    if (!isGlobalSttEditable(focused)) return;

    if (!VoiceService.isSupported()) {
      toast.warning('Voice unsupported', 'Speech-to-text is not available in this runtime.');
      return;
    }
    try {
      const started = VoiceService.startListening();
      if (!started) {
        toast.warning('Voice unsupported', 'Could not start built-in speech recognition.');
        return;
      }
      targetRef.current = focused;
      setListening(true);
      setComposerSttListening(true);
    } catch (err) {
      targetRef.current = null;
      setListening(false);
      setComposerSttListening(false);
      toast.error('Voice error', err instanceof Error ? err.message : 'Voice could not start.');
    }
  }, [setComposerSttListening]);

  React.useEffect(() => {
    const onStop = () => {
      if (listening) stop();
    };
    window.addEventListener(COMPOSER_STT_STOP_EVENT, onStop);
    return () => window.removeEventListener(COMPOSER_STT_STOP_EVENT, onStop);
  }, [listening, stop]);

  React.useEffect(() => {
    if (!listening) return;

    const insertAtTarget = (spoken: string) => {
      const trimmed = spoken.trim();
      if (!trimmed) return;
      const target = targetRef.current;
      if (target && document.contains(target)) {
        target.focus();
      }
      if (!insertTextIntoFocusedEditable(trimmed)) {
        toast.warning('Dictation', 'Could not insert text into the focused field.');
      }
    };

    const offFinal = VoiceService.on('voice:final', ({ text }) => insertAtTarget(text));
    const offError = VoiceService.on('voice:error', ({ kind, message }) => {
      stop();
      if (kind !== 'no_speech' && kind !== 'aborted') {
        toast.error('Voice error', message);
      }
    });
    const offEnd = VoiceService.on('voice:end', () => {
      if (!VoiceService.isListening()) stop();
    });
    const offTimeout = VoiceService.on('voice:timeout', ({ reason }) => {
      stop();
      toast.info('Speech-to-text stopped', reason);
    });

    return () => {
      offFinal();
      offError();
      offEnd();
      offTimeout();
    };
  }, [listening, stop]);

  React.useEffect(() => {
    const onToggle = (event: Event) => {
      if (!composerSttEnabled) return;

      const detail = (event as CustomEvent<{ source?: ComposerSttToggleSource }>).detail;
      const fromToolbar = detail?.source === 'toolbar';
      const focused = document.activeElement;

      if (listening) {
        event.preventDefault?.();
        stop();
        return;
      }

      if (VoiceService.isListening()) return;

      if (!isGlobalSttEditable(focused)) {
        if (fromToolbar) {
          toast.info('Focus a text field', 'Click into a text box, then use voice to text.');
        }
        return;
      }

      event.preventDefault?.();
      start();
    };

    window.addEventListener(COMPOSER_STT_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(COMPOSER_STT_TOGGLE_EVENT, onToggle);
  }, [composerSttEnabled, listening, start, stop]);

  React.useEffect(() => () => stop(), [stop]);

  return null;
}
