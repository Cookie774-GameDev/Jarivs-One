/**
 * Jarvis Mini Voice Module for the Pet mini-panel.
 * Reuses real VoiceService + useVoiceStore — not a mock UI or second voice backend.
 */
import * as React from 'react';
import { MessageSquare, Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useVoiceStore } from '@/features/voice/store';
import { VoiceService } from '@/features/voice/VoiceService';
import { useUIStore } from '@/stores/ui';
import { stopAllVoiceOutput } from '@/features/voice/voiceRouter';

export function PetVoiceSurface({
  className,
  onOpenChats,
}: {
  className?: string;
  /** Switch mini-panel to the Chats tab (same presentation store chats). */
  onOpenChats?: () => void;
}) {
  const state = useVoiceStore((s) => s.state);
  const errorMessage = useVoiceStore((s) => s.errorMessage);
  const partial = useVoiceStore((s) => s.partialTranscript);
  const finals = useVoiceStore((s) => s.finalTranscript);
  const persona = useVoiceStore((s) => s.persona);
  const setVoiceModalOpen = useUIStore((s) => s.setVoiceModalOpen);

  const [busy, setBusy] = React.useState(false);
  /** Local mute of TTS output only — does not create a second audio pipeline. */
  const [muted, setMuted] = React.useState(false);

  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isThinking = state === 'thinking';

  const start = React.useCallback(() => {
    setBusy(true);
    try {
      // Real VoiceService path used by the main Voice modal.
      const ok = VoiceService.startListening();
      if (!ok) {
        useVoiceStore.getState().setState('error', 'Could not start microphone');
      }
    } catch (err) {
      useVoiceStore
        .getState()
        .setState('error', err instanceof Error ? err.message : 'Voice start failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const stopListeningOnly = React.useCallback(() => {
    try {
      VoiceService.stopListening?.();
    } catch {
      /* ignore */
    }
    if (useVoiceStore.getState().state === 'listening') {
      useVoiceStore.getState().setState('idle');
    }
  }, []);

  const stopAll = React.useCallback(() => {
    stopListeningOnly();
    try {
      stopAllVoiceOutput();
    } catch {
      /* ignore */
    }
  }, [stopListeningOnly]);

  const toggleMute = React.useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next) {
        try {
          stopAllVoiceOutput();
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      // Cleanup on unmount / panel close: stop capture; do not leave mic open.
      try {
        if (useVoiceStore.getState().state === 'listening') {
          VoiceService.stopListening?.();
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col gap-3 p-2', className)}
      data-pet-voice-surface="true"
      data-voice-state={state}
      data-voice-muted={muted ? 'true' : 'false'}
      data-voice-persona={persona}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={isListening ? 'destructive' : 'default'}
          disabled={busy}
          onClick={() => (isListening ? stopListeningOnly() : start())}
          data-pet-voice-mic="true"
          className="gap-1.5"
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isListening ? 'Stop' : 'Listen'}
        </Button>
        {(isSpeaking || isThinking) && (
          <Button
            size="sm"
            variant="outline"
            onClick={stopAll}
            className="gap-1.5"
            data-pet-voice-stop-output="true"
          >
            <Square className="h-3.5 w-3.5" />
            Stop speaking
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleMute}
          className="gap-1.5"
          data-pet-voice-mute="true"
          aria-pressed={muted}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setVoiceModalOpen(true)}
          className="gap-1.5"
          data-pet-voice-full-ui="true"
        >
          <Volume2 className="h-4 w-4" />
          Full voice UI
        </Button>
        {onOpenChats && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenChats}
            className="gap-1.5"
            data-pet-voice-open-chats="true"
          >
            <MessageSquare className="h-4 w-4" />
            Open chat
          </Button>
        )}
        <span className="text-metadata text-muted-foreground ml-auto capitalize">
          {persona} · {state}
          {muted ? ' · muted' : ''}
        </span>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
          {errorMessage}
          <Button size="sm" variant="ghost" className="ml-2 h-auto p-0" onClick={start}>
            Retry
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-elevated/30 p-3 space-y-2">
        {finals.length === 0 && !partial && (
          <p className="text-secondary text-muted-foreground text-sm">
            Tap Listen and speak. Uses the same Jarvis voice pipeline as the main app (STT → AI → TTS).
          </p>
        )}
        {finals.map((f) => (
          <div key={f.ts} className="text-sm" data-pet-voice-user-final="true">
            <span className="text-metadata text-muted-foreground">You · </span>
            <span className="text-foreground">{f.text}</span>
          </div>
        ))}
        {partial && (
          <div className="text-sm text-muted-foreground italic" data-pet-voice-partial="true">
            {partial}
          </div>
        )}
        {isThinking && (
          <div className="text-sm text-accent-copper" data-pet-voice-thinking="true">
            Jarvis is thinking…
          </div>
        )}
        {isSpeaking && (
          <div className="text-sm text-accent-copper" data-pet-voice-speaking="true">
            Jarvis is speaking…
          </div>
        )}
      </div>
    </div>
  );
}
