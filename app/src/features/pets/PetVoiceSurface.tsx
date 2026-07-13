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
import { useAuthStore } from '@/stores/auth';
import { stopAllVoiceOutput } from '@/features/voice/voiceRouter';
import { usePetPresentationStore } from './petPresentationStore';
import { sanitizeActivitySummary } from './petPresentation';

const SAFE_VOICE_ACTIVITY: Record<string, string> = {
  listening: 'Jarvis is listening',
  thinking: 'Jarvis is thinking',
  speaking: 'Jarvis is speaking',
  error: 'Voice request failed',
  idle: 'Voice request completed',
};

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
  const defaultProvider = useAuthStore((s) => s.defaultProvider);
  const selectedModels = useAuthStore((s) => s.selectedModels);
  const pushActivity = usePetPresentationStore((s) => s.pushActivity);

  const [busy, setBusy] = React.useState(false);
  /** Local mute of TTS output only — does not create a second audio pipeline. */
  const [muted, setMuted] = React.useState(false);

  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';
  const isThinking = state === 'thinking';

  const modelId = defaultProvider ? selectedModels[defaultProvider] : undefined;
  const providerLabel = defaultProvider
    ? `${defaultProvider}${modelId ? ` · ${modelId}` : ''}`
    : 'provider not set';

  // Safe activity summaries only — never transcripts, tokens, or paths.
  const prevStateRef = React.useRef(state);
  React.useEffect(() => {
    if (prevStateRef.current === state) return;
    prevStateRef.current = state;
    const summary = SAFE_VOICE_ACTIVITY[state];
    if (!summary) return;
    // Avoid "completed" spam when bouncing through idle without a session
    if (state === 'idle' && !finals.length && !errorMessage) return;
    pushActivity(
      {
        id: `voice-${state}-${Date.now()}`,
        kind: state === 'error' ? 'error' : 'notification',
        summary: sanitizeActivitySummary(summary),
        target: { type: 'notification', id: 'pet-voice' },
        createdAt: Date.now(),
      },
      true,
    );
  }, [state, pushActivity, finals.length, errorMessage]);

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
      className={cn('flex h-full min-h-0 min-w-0 flex-col gap-3 p-2', className)}
      data-pet-voice-surface="true"
      data-voice-state={state}
      data-voice-muted={muted ? 'true' : 'false'}
      data-voice-persona={persona}
      data-voice-provider={defaultProvider ?? ''}
    >
      <div className="flex flex-wrap items-center gap-2" data-pet-voice-toolbar="true">
        <Button
          size="sm"
          variant={isListening ? 'destructive' : 'default'}
          disabled={busy}
          onClick={() => (isListening ? stopListeningOnly() : start())}
          data-pet-voice-mic="true"
          className="gap-1.5"
          aria-label={isListening ? 'Stop listening' : 'Listen'}
          title={isListening ? 'Stop listening' : 'Listen'}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          <span data-pet-compact-label>{isListening ? 'Stop' : 'Listen'}</span>
        </Button>
        {(isSpeaking || isThinking) && (
          <Button
            size="sm"
            variant="outline"
            onClick={stopAll}
            className="gap-1.5"
            data-pet-voice-stop-output="true"
            aria-label="Stop speaking"
            title="Stop speaking"
          >
            <Square className="h-3.5 w-3.5" />
            <span data-pet-compact-label>Stop speaking</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleMute}
          className="gap-1.5"
          data-pet-voice-mute="true"
          aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          <span data-pet-compact-label>{muted ? 'Unmute' : 'Mute'}</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setVoiceModalOpen(true)}
          className="gap-1.5"
          data-pet-voice-full-ui="true"
          aria-label="Open full voice UI"
          title="Open full voice UI"
        >
          <Volume2 className="h-4 w-4" />
          <span data-pet-compact-label>Full voice UI</span>
        </Button>
        {onOpenChats && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenChats}
            className="gap-1.5"
            data-pet-voice-open-chats="true"
            aria-label="Open chat"
            title="Open chat"
          >
            <MessageSquare className="h-4 w-4" />
            <span data-pet-compact-label>Open chat</span>
          </Button>
        )}
        <span className="text-metadata text-muted-foreground ml-auto capitalize">
          {persona} · {state}
          {muted ? ' · muted' : ''}
        </span>
      </div>

      <div
        className="pet-panel-secondary-copy text-metadata text-muted-foreground truncate"
        data-pet-voice-provider-status="true"
        title={providerLabel}
      >
        Model · {providerLabel} · voice {persona}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm"
        >
          {errorMessage}
          <Button size="sm" variant="ghost" className="ml-2 h-auto p-0" onClick={start}>
            Retry
          </Button>
        </div>
      )}

      <div
        className="flex-1 min-h-0 min-w-0 overflow-auto rounded-lg border border-border bg-elevated/30 p-3 space-y-2"
        data-pet-voice-transcript="true"
      >
        {finals.length === 0 && !partial && (
          <p className="text-secondary text-muted-foreground text-sm">
            Tap Listen and speak. Uses the same Jarvis voice pipeline as the main app (STT → AI →
            TTS).
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
