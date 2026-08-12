import * as React from 'react';
import { Mic, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoiceState } from './store';
import { Orb } from './Orb';
import { VoiceActivityWaveform } from './VoiceActivityWaveform';

export function JarvisVoiceHeader({
  state,
  personaName,
  listeningHint,
  errorMessage,
  voiceAutoListenOnOpen,
  voiceCommitPhrase,
  levelRef,
  voiceControlEvidence,
  onClose,
  onToggleListening,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  state: VoiceState;
  personaName: string;
  listeningHint: string;
  errorMessage?: string | null;
  voiceAutoListenOnOpen: boolean;
  voiceCommitPhrase: string;
  levelRef: React.RefObject<number>;
  voiceControlEvidence?: string;
  onClose: () => void;
  onToggleListening: () => void;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
}) {
  const controlLabel =
    state === 'thinking' || state === 'speaking'
      ? 'Stop response'
      : state === 'listening'
        ? 'Stop listening'
        : state === 'paused'
          ? 'Resume listening'
          : voiceAutoListenOnOpen
            ? 'Listening active'
            : 'Click to talk';
  const controlTitle =
    state === 'thinking' || state === 'speaking'
      ? 'Stop Jarvis mid-reply and ask something else'
      : state === 'listening'
        ? 'Stop listening'
        : state === 'paused'
          ? 'Listening paused after silence — click to resume'
          : voiceAutoListenOnOpen
            ? `Hands-free — say "${voiceCommitPhrase}" to send`
            : 'Click to let Jarvis hear you';

  return (
    <div
      className="jarvis-voice-drag-row cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Close Jarvis voice session"
        title="Close"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <div className="relative z-[1] flex min-h-10 items-center gap-1.5 py-1 pl-2 pr-9">
        <button
          type="button"
          onClick={onToggleListening}
          className={cn(
            'jarvis-voice-orb-button flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-copper/80',
            (state === 'listening' || state === 'thinking' || state === 'speaking') && 'is-active',
          )}
          aria-label={controlLabel}
          data-sik-evidence={voiceControlEvidence}
          title={controlTitle}
        >
          <Orb
            state={state}
            size={42}
            ariaLabel="Jarvis voice activity"
            presentation="signal-globe"
            levelRef={levelRef}
          />
        </button>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold leading-4 text-foreground">
            {personaName}
          </span>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              'flex items-center gap-1 text-xs leading-4',
              state === 'error' ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                state === 'error'
                  ? 'bg-destructive'
                  : 'bg-success shadow-[0_0_5px_hsl(var(--success)/0.75)]',
              )}
              aria-hidden="true"
            />
            {state === 'error' && errorMessage ? errorMessage : listeningHint}
          </span>
        </div>
        <div className="mx-auto min-w-0 flex-1">
          <VoiceActivityWaveform
            levelRef={levelRef}
            active={state === 'listening' || state === 'speaking'}
          />
        </div>
        <button
          type="button"
          className="jarvis-voice-mic flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-copper/80"
          onClick={onToggleListening}
          aria-label="Toggle microphone"
          title={controlTitle}
        >
          <Mic className="h-3 w-3 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
