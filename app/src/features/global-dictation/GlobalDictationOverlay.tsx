import * as React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Mic, MicOff, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toast';
import { VoiceActivityWaveform } from '@/features/voice/VoiceActivityWaveform';
import { createGlobalDictationSession, type GlobalDictationSession } from './dictationSession';
import {
  formatGlobalDictationEmptyFailure,
  formatGlobalDictationPasteFailure,
  formatGlobalDictationSessionFailure,
  formatGlobalDictationStartupFailure,
} from './dictationFailures';

/**
 * VibeSpace global dictation overlay (Ctrl+Space).
 *
 * Transcribes through the same STT pipeline as VibeSpace chat (local
 * faster-whisper / Web Speech / Deepgram / Groq per Settings) and pastes the
 * transcript into the focused app. Never routes through OS dictation (Win+H).
 */

type OverlayState = 'ready' | 'starting' | 'listening' | 'transcribing' | 'pasting' | 'error';

const STATE_HINT: Record<OverlayState, string> = {
  ready: 'Ctrl+Space · VibeSpace STT',
  starting: 'Starting microphone…',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  pasting: 'Pasting…',
  error: 'Dictation stopped',
};

export interface GlobalDictationOverlayProps {
  runtimeEffectsEnabled?: boolean;
}

export function GlobalDictationOverlay({
  runtimeEffectsEnabled = true,
}: GlobalDictationOverlayProps = {}) {
  const [state, setState] = React.useState<OverlayState>('ready');
  const [partial, setPartial] = React.useState('');
  const [finalText, setFinalText] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [engineLabel, setEngineLabel] = React.useState('');
  const levelRef = React.useRef(0);
  const sessionRef = React.useRef<GlobalDictationSession | null>(null);
  const latestInterimRef = React.useRef('');
  const stateRef = React.useRef<OverlayState>('ready');
  stateRef.current = state;

  const resetTranscript = React.useCallback(() => {
    setPartial('');
    setFinalText('');
    latestInterimRef.current = '';
    levelRef.current = 0;
  }, []);

  const teardownSession = React.useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.cancel();
  }, []);

  const failVisible = React.useCallback(
    (message: string) => {
      teardownSession();
      stateRef.current = 'error';
      setState('error');
      setErrorMessage(message);
    },
    [teardownSession],
  );

  const start = React.useCallback(async () => {
    if (sessionRef.current) return;
    resetTranscript();
    setErrorMessage('');
    setState('starting');
    try {
      const session = await createGlobalDictationSession({
        onOpen: () => setState('listening'),
        onPartial: (text) => {
          latestInterimRef.current = text;
          setPartial(text);
        },
        onFinal: (text) => {
          latestInterimRef.current = '';
          setFinalText(text);
          setPartial(text);
        },
        onLevel: (level) => {
          levelRef.current = level;
        },
        onError: (message) => failVisible(formatGlobalDictationSessionFailure(message)),
        onClose: () => {
          if (stateRef.current === 'listening') setState('ready');
        },
      });
      sessionRef.current = session;
      setEngineLabel(session.engineLabel);
    } catch (err) {
      failVisible(formatGlobalDictationStartupFailure(err));
    }
  }, [failVisible, resetTranscript]);

  /** Finalize the session and paste the transcript into the focused app. */
  const confirmAndPaste = React.useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    setState('transcribing');
    await session.stop();

    const baseText = (session.getFinalText() || finalText).trim();
    const interimText = latestInterimRef.current.trim();
    const text =
      baseText && interimText && !baseText.endsWith(interimText)
        ? `${baseText} ${interimText}`
        : baseText || interimText;
    resetTranscript();
    if (!text) {
      if (stateRef.current !== 'error') {
        failVisible(formatGlobalDictationEmptyFailure());
      }
      return;
    }
    setState('pasting');
    try {
      await getCurrentWindow().hide();
      window.setTimeout(() => {
        void invoke('dictation_paste_text', { text })
          .then(() => setState('ready'))
          .catch(async (err) => {
            // The overlay is hidden at this point - bring it back so the
            // failure is visible instead of vanishing into a hidden toast.
            await getCurrentWindow()
              .show()
              .catch(() => undefined);
            failVisible(formatGlobalDictationPasteFailure(err));
          });
      }, 120);
    } catch (err) {
      failVisible(formatGlobalDictationPasteFailure(err));
    }
  }, [failVisible, finalText, resetTranscript]);

  const cancelAndHide = React.useCallback(() => {
    teardownSession();
    resetTranscript();
    setErrorMessage('');
    setState('ready');
    void getCurrentWindow().hide();
  }, [resetTranscript, teardownSession]);

  /** Clear the transcript but keep dictating. */
  const clearTranscript = React.useCallback(() => {
    resetTranscript();
    const session = sessionRef.current;
    if (session && !session.streaming) {
      // Batch engines buffer raw audio - restart the recorder for a clean take.
      teardownSession();
      void start();
    }
  }, [resetTranscript, start, teardownSession]);

  React.useEffect(() => {
    if (!runtimeEffectsEnabled) return;
    const onToggle = () => {
      void getCurrentWindow().show();
      void getCurrentWindow().setFocus();
      if (sessionRef.current) {
        void confirmAndPaste();
      } else {
        void start();
      }
    };
    let unlisten: (() => void) | undefined;
    void listen('jarvis:global-dictation-toggle', onToggle).then((off) => {
      unlisten = off;
    });
    window.addEventListener('jarvis:global-dictation-toggle', onToggle);
    return () => {
      unlisten?.();
      window.removeEventListener('jarvis:global-dictation-toggle', onToggle);
    };
  }, [confirmAndPaste, runtimeEffectsEnabled, start]);

  React.useEffect(() => {
    if (!runtimeEffectsEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelAndHide();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (sessionRef.current) void confirmAndPaste();
        else if (stateRef.current === 'error') void start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelAndHide, confirmAndPaste, runtimeEffectsEnabled, start]);

  const listening = state === 'listening' || state === 'starting';
  const busy = state === 'transcribing' || state === 'pasting';

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-2">
      <div
        data-tauri-drag-region
        data-monochrome-surface="global-dictation"
        className={cn(
          'w-[228px] select-none rounded-2xl border border-accent-copper/45',
          'bg-background/94 px-3 py-2 text-foreground shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl',
          '[html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:bg-background [html[data-theme=monochrome]_&]:shadow-none [html[data-theme=monochrome]_&]:backdrop-blur-none',
        )}
      >
        <div data-tauri-drag-region className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (sessionRef.current) void confirmAndPaste();
              else void start();
            }}
            disabled={busy}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-60',
              listening
                ? 'border-accent-copper bg-accent-copper/18 text-accent-copper'
                : 'border-border bg-panel text-muted-foreground hover:text-foreground',
            )}
            aria-label={sessionRef.current ? 'Stop dictation' : 'Start dictation'}
          >
            {listening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          <div data-tauri-drag-region className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-copper">
              VibeSpace Dictation
            </div>
            <div
              className={cn(
                'truncate text-[11px]',
                state === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {state === 'error' ? errorMessage || STATE_HINT.error : partial || STATE_HINT[state]}
            </div>
          </div>
        </div>

        {engineLabel && state !== 'error' && (
          <div className="mt-1 truncate text-[9px] text-muted-foreground/80">{engineLabel}</div>
        )}

        {state === 'error' ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void start()}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-accent-copper/50 bg-accent-copper/12 px-2 py-1 text-[10px] font-semibold text-accent-copper hover:bg-accent-copper/20"
                aria-label="Retry dictation"
              >
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
              <button
                type="button"
                onClick={cancelAndHide}
                className="flex items-center justify-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                aria-label="Close dictation"
              >
                <X className="h-3 w-3" /> Close
              </button>
            </div>
            <div className="text-center text-[9px] text-muted-foreground">
              Fix engines in VibeSpace → Settings → Speech to Text
            </div>
          </div>
        ) : (
          <>
            <VoiceActivityWaveform levelRef={levelRef} active={listening} />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={clearTranscript}
                disabled={busy || (!partial && !finalText)}
                className="rounded-md border border-border bg-panel px-2 py-0.5 text-[9px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                aria-label="Clear transcript"
              >
                Clear
              </button>
              <div className="text-center text-[9px] text-muted-foreground">
                Enter paste · Esc cancel · drag to move
              </div>
            </div>
          </>
        )}
      </div>
      <Toaster />
    </div>
  );
}
