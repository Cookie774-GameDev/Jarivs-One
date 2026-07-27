import { ChevronDown, Cloud, LockKeyhole, Sparkles, Square } from 'lucide-react';
import { Button, Hint, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { HOTKEYS } from '@/lib/hotkeys';
import { cn } from '@/lib/utils';
import type {
  PromptForgeModelSelection,
  PromptForgePrivacyMode,
  PromptForgeStatus,
} from './contracts';
import type { PromptForgeModelOption } from './modelSelection';

export interface PromptForgeControlProps {
  status: PromptForgeStatus;
  statusMessage: string;
  isRunning: boolean;
  disabledReason: string | null;
  error: string | null;
  compact: boolean;
  modelSelection: PromptForgeModelSelection;
  modelOptions: readonly PromptForgeModelOption[];
  onModelSelectionChange: (selection: PromptForgeModelSelection) => void;
  privacyMode: PromptForgePrivacyMode;
  onPrivacyModeChange: (mode: PromptForgePrivacyMode) => void;
  allowPublicResearch: boolean;
  onAllowPublicResearchChange: (allowed: boolean) => void;
  publicResearchAvailable: boolean;
  offlineMode: boolean;
  onStart: () => void | Promise<unknown>;
  onCancel: () => void | Promise<unknown>;
}

function selected(selection: PromptForgeModelSelection, option: PromptForgeModelOption): boolean {
  return (
    selection.mode === 'single' &&
    selection.providerId === option.providerId &&
    selection.modelId === option.modelId &&
    (selection.connectionId ?? null) === (option.connectionId ?? null)
  );
}

export function PromptForgeControl({
  status,
  statusMessage,
  isRunning,
  disabledReason,
  error,
  compact,
  modelSelection,
  modelOptions,
  onModelSelectionChange,
  privacyMode,
  onPrivacyModeChange,
  allowPublicResearch,
  onAllowPublicResearchChange,
  publicResearchAvailable,
  offlineMode,
  onStart,
  onCancel,
}: PromptForgeControlProps) {
  const actionLabel = isRunning
    ? 'Cancel Prompt Forge upgrade'
    : 'Upgrade prompt with Prompt Forge';
  const tooltip = isRunning
    ? `${statusMessage} · Select to cancel`
    : (error ?? disabledReason ?? 'Upgrade this prompt with project context');

  return (
    <div className="flex items-center gap-0.5">
      <Hint label={tooltip} hotkey={HOTKEYS.PROMPT_FORGE}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          data-variant="ghost"
          aria-label={actionLabel}
          aria-description={error ?? disabledReason ?? undefined}
          disabled={!isRunning && disabledReason !== null}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void (isRunning ? onCancel() : onStart())}
          className={cn(
            'relative',
            isRunning && 'text-accent-cyan',
            status === 'ready' && 'text-success',
          )}
        >
          {isRunning ? (
            <>
              <Sparkles className="motion-safe:animate-pulse" />
              <Square className="absolute h-1.5 w-1.5 fill-current" />
            </>
          ) : (
            <Sparkles />
          )}
        </Button>
      </Hint>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Configure Prompt Forge"
            className={cn('h-6 w-4 px-0', privacyMode === 'local_only' && 'text-success')}
          >
            {privacyMode === 'local_only' ? (
              <LockKeyhole className="!h-3 !w-3" />
            ) : (
              <ChevronDown className="!h-3 !w-3" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={compact ? 'start' : 'center'}
          sideOffset={8}
          className="w-[min(360px,92vw)] space-y-4 p-3"
        >
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-secondary font-medium text-foreground">Prompt Forge model</h3>
              <span className="text-metadata text-muted-foreground">Independent from chat</span>
            </div>
            <div role="radiogroup" aria-label="Prompt Forge model" className="space-y-1">
              <button
                type="button"
                role="radio"
                aria-checked={modelSelection.mode === 'prefer_local'}
                onClick={() => onModelSelectionChange({ mode: 'prefer_local' })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-secondary outline-none',
                  'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring',
                  modelSelection.mode === 'prefer_local' && 'bg-accent-cyan/10 text-foreground',
                )}
              >
                <span>
                  <span className="block font-medium">Prefer local</span>
                  <span className="block text-metadata text-muted-foreground">
                    Uses an available Ollama or local model
                  </span>
                </span>
                <LockKeyhole className="h-3.5 w-3.5 text-success" />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={modelSelection.mode === 'current_chat_model'}
                onClick={() => onModelSelectionChange({ mode: 'current_chat_model' })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-secondary outline-none',
                  'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring',
                  modelSelection.mode === 'current_chat_model' &&
                    'bg-accent-cyan/10 text-foreground',
                )}
              >
                <span>
                  <span className="block font-medium">Use current chat model</span>
                  <span className="block text-metadata text-muted-foreground">
                    Does not change the chat selection
                  </span>
                </span>
              </button>
              {modelOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected(modelSelection, option)}
                  disabled={!option.available}
                  onClick={() =>
                    onModelSelectionChange({
                      mode: 'single',
                      providerId: option.providerId,
                      modelId: option.modelId,
                      ...(option.connectionId ? { connectionId: option.connectionId } : {}),
                    })
                  }
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-secondary outline-none',
                    'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45',
                    selected(modelSelection, option) && 'bg-accent-cyan/10 text-foreground',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{option.label}</span>
                    <span className="block truncate text-metadata text-muted-foreground">
                      {option.connectionMode === 'local'
                        ? 'Local · no hosted AI charge'
                        : option.connectionMode === 'external-cli'
                          ? 'Signed-in subscription connection'
                          : 'Provider API connection'}
                    </span>
                  </span>
                  {option.localOnly ? (
                    <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="border-t border-border pt-3">
            <h3 className="mb-2 text-secondary font-medium text-foreground">
              Privacy for this run
            </h3>
            <div
              role="radiogroup"
              aria-label="Prompt Forge privacy"
              className="grid grid-cols-2 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={privacyMode === 'local_only'}
                onClick={() => onPrivacyModeChange('local_only')}
                className={cn(
                  'rounded-md border border-border px-2 py-2 text-secondary outline-none',
                  'focus-visible:ring-1 focus-visible:ring-ring',
                  privacyMode === 'local_only' && 'border-success/40 bg-success/10 text-success',
                )}
              >
                Local only
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={privacyMode === 'provider_allowed'}
                disabled={offlineMode}
                onClick={() => onPrivacyModeChange('provider_allowed')}
                className={cn(
                  'rounded-md border border-border px-2 py-2 text-secondary outline-none disabled:opacity-45',
                  'focus-visible:ring-1 focus-visible:ring-ring',
                  privacyMode === 'provider_allowed' &&
                    'border-accent-cyan/40 bg-accent-cyan/10 text-foreground',
                )}
              >
                Provider allowed
              </button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-secondary text-muted-foreground">
              <input
                type="checkbox"
                checked={allowPublicResearch}
                disabled={
                  !publicResearchAvailable || privacyMode !== 'provider_allowed' || offlineMode
                }
                onChange={(event) => onAllowPublicResearchChange(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Allow public research for this run
                <span className="block text-metadata">
                  {publicResearchAvailable
                    ? 'Only verified sources returned by an available research connection are admitted.'
                    : 'No research connection is currently available.'}
                </span>
              </span>
            </label>
          </section>
        </PopoverContent>
      </Popover>

      {isRunning ? (
        <span
          role="status"
          aria-live="polite"
          className={cn('max-w-36 truncate text-metadata text-accent-cyan', compact && 'sr-only')}
        >
          {statusMessage}
        </span>
      ) : null}
      {error ? (
        <span
          role="alert"
          className={cn('max-w-44 truncate text-metadata text-destructive', compact && 'sr-only')}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
