import * as React from 'react';
import { toast } from '@/components/ui/toast';
import { VoiceService } from '@/features/voice/VoiceService';
import { useUIStore } from '@/stores/ui';
import {
  COMPOSER_STT_STOP_EVENT,
  COMPOSER_STT_TOGGLE_EVENT,
  GLOBAL_DICTATION_IN_APP_EVENT,
  requestComposerSttToggle,
  type ComposerSttToggleSource,
} from './composerSttService';
import {
  insertTextIntoEditable,
  isGlobalSttEditable,
  mountSttFocusTracking,
  resolveGlobalSttEditable,
} from './insertText';
import {
  captureSttFieldSnapshot,
  commitSttInField,
  previewSttInField,
  revertSttPreview,
  type SttFieldSnapshot,
} from './sttInterimEditor';
import { startSttVolumeMeter, stopSttVolumeMeter } from './sttVolume';

const FINALIZE_GRACE_MS = 2_500;
const DEFAULT_INACTIVITY_MS = 15_000;

function isTextInputField(
  el: HTMLElement,
): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

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
  const snapshotRef = React.useRef<SttFieldSnapshot | null>(null);
  const finalizeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingFinalRef = React.useRef(false);

  const clearFinalizeTimer = React.useCallback(() => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const revertPreview = React.useCallback(() => {
    const target = targetRef.current;
    const snapshot = snapshotRef.current;
    if (target && snapshot && isTextInputField(target)) {
      revertSttPreview(target, snapshot);
    }
    snapshotRef.current = null;
  }, []);

  const endSession = React.useCallback(
    (revertOnStop: boolean) => {
      clearFinalizeTimer();
      awaitingFinalRef.current = false;
      if (revertOnStop) revertPreview();
      targetRef.current = null;
      setListening(false);
      setComposerSttListening(false);
      stopSttVolumeMeter();
      VoiceService.setInactivityTimeoutMs(DEFAULT_INACTIVITY_MS);
      try {
        VoiceService.stopListening();
      } catch {
        // Engine may already be torn down.
      }
    },
    [clearFinalizeTimer, revertPreview, setComposerSttListening],
  );

  const stop = React.useCallback(() => {
    if (!listening && !awaitingFinalRef.current) return;
    setListening(false);
    setComposerSttListening(false);
    stopSttVolumeMeter();
    awaitingFinalRef.current = true;
    try {
      VoiceService.stopListening();
    } catch {
      awaitingFinalRef.current = false;
      revertPreview();
      targetRef.current = null;
      snapshotRef.current = null;
      return;
    }
    clearFinalizeTimer();
    finalizeTimerRef.current = setTimeout(() => {
      awaitingFinalRef.current = false;
      revertPreview();
      targetRef.current = null;
    }, FINALIZE_GRACE_MS);
  }, [clearFinalizeTimer, listening, revertPreview, setComposerSttListening]);

  const start = React.useCallback(
    (target?: HTMLElement | null) => {
      const focused = target ?? resolveGlobalSttEditable();
      if (!focused || !isGlobalSttEditable(focused)) return;

      if (!VoiceService.isSupported()) {
        toast.warning('Voice unsupported', 'Speech-to-text is not available in this runtime.');
        return;
      }
      try {
        snapshotRef.current = isTextInputField(focused)
          ? captureSttFieldSnapshot(focused)
          : null;
        VoiceService.setInactivityTimeoutMs(null);
        const started = VoiceService.startListening();
        if (!started) {
          snapshotRef.current = null;
          toast.warning('Voice unsupported', 'Could not start built-in speech recognition.');
          return;
        }
        focused.focus();
        targetRef.current = focused;
        setListening(true);
        setComposerSttListening(true);
        void startSttVolumeMeter();
      } catch (err) {
        snapshotRef.current = null;
        targetRef.current = null;
        setListening(false);
        setComposerSttListening(false);
        toast.error('Voice error', err instanceof Error ? err.message : 'Voice could not start.');
      }
    },
    [setComposerSttListening],
  );

  React.useEffect(() => mountSttFocusTracking(), []);

  React.useEffect(() => {
    const onStop = () => {
      if (listening || awaitingFinalRef.current) stop();
    };
    window.addEventListener(COMPOSER_STT_STOP_EVENT, onStop);
    return () => window.removeEventListener(COMPOSER_STT_STOP_EVENT, onStop);
  }, [listening, stop]);

  React.useEffect(() => {
    if (!listening && !awaitingFinalRef.current) return;

    const insertAtTarget = (spoken: string) => {
      const trimmed = spoken.trim();
      if (!trimmed) return;
      const target = targetRef.current;
      if (!target || !document.contains(target) || !isGlobalSttEditable(target)) {
        toast.warning('Dictation', 'Could not insert text into the focused field.');
        return;
      }
      if (isTextInputField(target) && snapshotRef.current) {
        if (!commitSttInField(target, snapshotRef.current, trimmed)) return;
      } else if (!insertTextIntoEditable(target, trimmed)) {
        toast.warning('Dictation', 'Could not insert text into the focused field.');
        return;
      }
      snapshotRef.current = null;
      awaitingFinalRef.current = false;
      clearFinalizeTimer();
      targetRef.current = null;
    };

    const offPartial = VoiceService.on('voice:partial', ({ text: partial }) => {
      const target = targetRef.current;
      const snapshot = snapshotRef.current;
      if (!target || !snapshot || !isTextInputField(target)) return;
      if (!document.contains(target)) return;
      previewSttInField(target, snapshot, partial);
    });

    const offFinal = VoiceService.on('voice:final', ({ text }) => {
      insertAtTarget(text);
      if (!VoiceService.isListening() && !VoiceService.wantsListening()) {
        setListening(false);
        setComposerSttListening(false);
        stopSttVolumeMeter();
      }
    });

    const offError = VoiceService.on('voice:error', ({ kind, message }) => {
      endSession(kind === 'aborted');
      if (kind !== 'no_speech' && kind !== 'aborted') {
        toast.error('Voice error', message);
      }
    });

    const offEnd = VoiceService.on('voice:end', () => {
      if (!VoiceService.isListening() && !VoiceService.wantsListening()) {
        if (!awaitingFinalRef.current) {
          setListening(false);
          setComposerSttListening(false);
          stopSttVolumeMeter();
        }
      }
    });

    const offTimeout = VoiceService.on('voice:timeout', ({ reason }) => {
      endSession(true);
      toast.info('Speech-to-text stopped', reason);
    });

    return () => {
      offPartial();
      offFinal();
      offError();
      offEnd();
      offTimeout();
    };
  }, [clearFinalizeTimer, endSession, listening, setComposerSttListening]);

  React.useEffect(() => {
    const onToggle = (event: Event) => {
      if (!composerSttEnabled) return;
      if (event.defaultPrevented) return;

      const detail = (event as CustomEvent<{ source?: ComposerSttToggleSource }>).detail;
      const fromToolbar = detail?.source === 'toolbar' || detail?.source === 'context-menu';
      const target = resolveGlobalSttEditable();

      if (listening) {
        event.preventDefault?.();
        stop();
        return;
      }

      if (!target) {
        if (fromToolbar) {
          toast.info('Focus a text field', 'Click into a text box, then use voice to text.');
        }
        return;
      }

      if (VoiceService.isListening() || VoiceService.wantsListening()) {
        if (!fromToolbar) return;
        VoiceService.interruptListening();
      }

      event.preventDefault?.();
      start(target);
    };

    window.addEventListener(COMPOSER_STT_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(COMPOSER_STT_TOGGLE_EVENT, onToggle);
  }, [composerSttEnabled, listening, start, stop]);

  // Ctrl+Space while VibeSpace itself is focused: the Rust global-shortcut
  // handler emits this instead of opening the floating overlay, so the press
  // becomes normal in-app voice-to-text for the focused input. A same-named
  // window CustomEvent covers web preview and tests.
  React.useEffect(() => {
    const relay = () => requestComposerSttToggle('hotkey');
    let unlistenTauri: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen(GLOBAL_DICTATION_IN_APP_EVENT, relay))
      .then((off) => {
        if (cancelled) off();
        else unlistenTauri = off;
      })
      .catch(() => {
        /* Browser preview - the window event below still works. */
      });
    window.addEventListener(GLOBAL_DICTATION_IN_APP_EVENT, relay);
    return () => {
      cancelled = true;
      unlistenTauri?.();
      window.removeEventListener(GLOBAL_DICTATION_IN_APP_EVENT, relay);
    };
  }, []);

  React.useEffect(
    () => () => {
      clearFinalizeTimer();
      endSession(true);
    },
    [clearFinalizeTimer, endSession],
  );

  return null;
}
