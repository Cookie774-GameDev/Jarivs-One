import * as React from 'react';
import { ArrowLeft, Check, Plus, Trash2, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { enqueueTerminalCommand } from '../terminalCommandQueue';
import type { TerminalRef } from '../terminalRefs';
import {
  FASTER_AGENTS_MAX_PHRASES,
  FASTER_AGENTS_MAX_TARGETS,
  fasterAgentsRefKey,
  pickFasterAgentsPhrase,
  useFasterAgentsStore,
} from './fasterAgentsStore';
import { WhipCanvas } from './WhipCanvas';
import { playOpenWhipCrack, preloadOpenWhipCracks } from './fasterAgentsAudio';

const SELECT_VOICE_URL = '/audio/faster-agents/select-your-snail.wav';

export interface FasterAgentsTerminalOption {
  ref: TerminalRef;
  label: string;
  detail: string;
}

async function playSelectVoice(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const audio = new Audio(SELECT_VOICE_URL);
  audio.volume = 0.9;
  signal.addEventListener('abort', () => audio.pause(), { once: true });
  await audio.play();
}

export function FasterAgentsOverlay({ terminals }: { terminals: FasterAgentsTerminalOption[] }) {
  const open = useFasterAgentsStore((state) => state.open);
  const phase = useFasterAgentsStore((state) => state.phase);
  const selectedRefs = useFasterAgentsStore((state) => state.selectedRefs);
  const phrases = useFasterAgentsStore((state) => state.phrases);
  const soundEnabled = useFasterAgentsStore((state) => state.soundEnabled);
  const selectedKeys = React.useMemo(
    () => new Set(selectedRefs.map(fasterAgentsRefKey)),
    [selectedRefs],
  );

  React.useEffect(() => {
    if (!open || phase !== 'select') return;
    const controller = new AbortController();
    preloadOpenWhipCracks();
    void playSelectVoice(controller.signal).catch(() => {
      if (controller.signal.aborted) return;
      toast.warning('Voice unavailable', 'Select your Snail');
    });
    return () => controller.abort();
  }, [open, phase]);

  React.useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.fasterAgentsSelecting = phase === 'select' ? 'true' : 'false';
    const panes = document.querySelectorAll<HTMLElement>('[data-terminal-drop-pane-id]');
    for (const pane of panes) {
      const key = pane.dataset.terminalDropPaneId ?? '';
      pane.dataset.fasterAgentsSelected = selectedKeys.has(key) ? 'true' : 'false';
    }
    return () => {
      delete document.documentElement.dataset.fasterAgentsSelecting;
      for (const pane of panes) delete pane.dataset.fasterAgentsSelected;
    };
  }, [open, phase, selectedKeys]);

  if (!open) return null;

  const crack = () => {
    if (selectedRefs.length === 0) return;
    const phrase = pickFasterAgentsPhrase(phrases);
    enqueueTerminalCommand({ command: phrase, target: 'refs', refs: selectedRefs });
    if (soundEnabled) {
      void playOpenWhipCrack().then((played) => {
        if (!played) toast.warning('Whip sound unavailable', 'The phrase was still delivered.');
      });
    }
    toast.success(
      'Whip delivered',
      `${selectedRefs.length} selected terminal${selectedRefs.length === 1 ? '' : 's'} received one phrase.`,
    );
  };

  return (
    <>
      <style>{`
        html[data-faster-agents-selecting="true"] [data-terminal-drop="pane"] { opacity:.28; filter:brightness(.42) saturate(.55); transition:opacity 160ms ease,filter 160ms ease,box-shadow 160ms ease; }
        html[data-faster-agents-selecting="true"] [data-terminal-drop="pane"][data-faster-agents-selected="true"] { opacity:1; filter:brightness(1.12) saturate(1.1); box-shadow:0 0 0 2px #d39a45,0 0 34px rgba(211,154,69,.58); position:relative; z-index:90; }
      `}</style>
      <div
        aria-hidden="true"
        data-testid="faster-agents-dimmer"
        className={`pointer-events-none fixed inset-0 z-[80] ${
          phase === 'select' ? 'bg-black/70' : 'bg-black/20 backdrop-blur-[1px]'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Faster Agents"
        className="pointer-events-none fixed inset-0 z-[100] flex flex-col p-4"
      >
        <div
          className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-accent-copper/40 bg-background/95 shadow-2xl ${
            phase === 'select'
              ? 'ml-auto h-auto max-h-full w-full max-w-md'
              : 'mx-auto h-full w-full max-w-5xl'
          }`}
        >
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-accent-copper">
                <Zap className="h-4 w-4" /> Faster Agents
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                {phase === 'select' ? 'Select your Snail' : 'Whip the selected terminals'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={soundEnabled ? 'Mute whip sounds' : 'Enable whip sounds'}
                onClick={() => useFasterAgentsStore.getState().setSoundEnabled(!soundEnabled)}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close Faster Agents"
                onClick={() => useFasterAgentsStore.getState().close()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {phase === 'select' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
              <p className="text-sm text-muted-foreground">
                Choose 1–{FASTER_AGENTS_MAX_TARGETS}. Selected panes light up; unselected panes
                never receive phrases.
              </p>
              <div className="mt-4 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
                {terminals.map((terminal) => {
                  const key = fasterAgentsRefKey(terminal.ref);
                  const selected = selectedKeys.has(key);
                  return (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={selected}
                      onClick={() => {
                        const changed = useFasterAgentsStore.getState().toggleRef(terminal.ref);
                        if (!changed && !selected) {
                          toast.warning('Selection limit reached', 'Choose at most 10 terminals.');
                        }
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-accent-copper bg-accent-copper/15 shadow-[0_0_24px_rgba(211,154,69,.28)]'
                          : 'border-border bg-paper hover:border-accent-copper/50'
                      }`}
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full border border-current text-accent-copper">
                        {selected ? <Check className="h-4 w-4" /> : <span aria-hidden>🐌</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {terminal.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {terminal.detail}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-accent-copper">
                        {selected ? 'Selected' : 'Select'}
                      </span>
                    </button>
                  );
                })}
                {terminals.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    Add or start a terminal pane first.
                  </div>
                ) : null}
              </div>
              <footer className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedRefs.length} / 10 selected
                </span>
                <Button
                  type="button"
                  disabled={selectedRefs.length === 0}
                  onClick={() => useFasterAgentsStore.getState().continueToWhip()}
                >
                  Continue to whip
                </Button>
              </footer>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-h-72">
                <WhipCanvas onCrack={crack} />
              </div>
              <aside className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => useFasterAgentsStore.getState().backToSelection()}
                  >
                    <ArrowLeft className="h-4 w-4" /> Targets ({selectedRefs.length})
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={phrases.length >= FASTER_AGENTS_MAX_PHRASES}
                    onClick={() => useFasterAgentsStore.getState().addPhrase()}
                  >
                    <Plus className="h-4 w-4" /> Phrase
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Each crack randomly chooses one saved phrase and submits it once to the selected
                  group.
                </p>
                {phrases.map((phrase, index) => (
                  <div key={index} className="rounded-lg border border-border bg-paper p-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Phrase {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={phrases.length <= 1}
                        aria-label={`Remove phrase ${index + 1}`}
                        onClick={() => useFasterAgentsStore.getState().removePhrase(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={phrase}
                      maxLength={500}
                      rows={3}
                      aria-label={`Phrase ${index + 1}`}
                      onChange={(event) =>
                        useFasterAgentsStore.getState().setPhrase(index, event.target.value)
                      }
                    />
                  </div>
                ))}
              </aside>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
