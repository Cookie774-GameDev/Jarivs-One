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
import './sakura-prompt-forge.css';

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
    <div
      data-monochrome-surface="prompt-forge"
      data-monochrome-state={status}
      data-sakura-surface="prompt-forge"
      data-sakura-state={status}
      className="mc7d-prompt-forge flex items-center gap-0.5 [html[data-theme=monochrome]_&]:font-mono"
    >
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
            'relative [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border [html[data-theme=monochrome]_&]:border-transparent [html[data-theme=monochrome]_&]:shadow-none',
            '[html[data-theme=monochrome]_&]:hover:border-border-mid [html[data-theme=monochrome]_&]:hover:bg-muted',
            isRunning && 'text-accent-cyan',
            isRunning &&
              '[html[data-theme=monochrome]_&]:border-accent-cyan/60 [html[data-theme=monochrome]_&]:bg-accent-cyan/10',
            status === 'ready' && 'text-success',
            status === 'ready' &&
              '[html[data-theme=monochrome]_&]:border-success/60 [html[data-theme=monochrome]_&]:bg-success/10',
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
            data-monochrome-state={privacyMode}
            className={cn(
              'h-6 min-h-6 w-6 min-w-6 shrink-0 px-0 [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:shadow-none',
              privacyMode === 'local_only' && 'text-success',
            )}
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
          data-monochrome-surface="prompt-forge-settings"
          data-sakura-surface="prompt-forge-settings"
          className="w-[min(360px,92vw)] space-y-4 p-3 [[data-theme=monochrome]_&]:rounded-sm [[data-theme=monochrome]_&]:border-border-mid [[data-theme=monochrome]_&]:bg-panel [[data-theme=monochrome]_&]:font-mono [[data-theme=monochrome]_&]:shadow-none"
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
                data-monochrome-state={modelSelection.mode === 'prefer_local' ? 'selected' : 'idle'}
                onClick={() => onModelSelectionChange({ mode: 'prefer_local' })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-secondary outline-none',
                  'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring',
                  modelSelection.mode === 'prefer_local' && 'bg-accent-cyan/10 text-foreground',
                  '[html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border [html[data-theme=monochrome]_&]:border-transparent',
                  modelSelection.mode === 'prefer_local' &&
                    '[html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-accent-cyan [html[data-theme=monochrome]_&]:border-y-border [html[data-theme=monochrome]_&]:border-r-border',
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
                data-monochrome-state={
                  modelSelection.mode === 'current_chat_model' ? 'selected' : 'idle'
                }
                onClick={() => onModelSelectionChange({ mode: 'current_chat_model' })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-secondary outline-none',
                  'hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring',
                  modelSelection.mode === 'current_chat_model' &&
                    'bg-accent-cyan/10 text-foreground',
                  '[html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border [html[data-theme=monochrome]_&]:border-transparent',
                  modelSelection.mode === 'current_chat_model' &&
                    '[html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-accent-cyan [html[data-theme=monochrome]_&]:border-y-border [html[data-theme=monochrome]_&]:border-r-border',
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
                  data-monochrome-state={selected(modelSelection, option) ? 'selected' : 'idle'}
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
                    '[html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border [html[data-theme=monochrome]_&]:border-transparent',
                    selected(modelSelection, option) &&
                      '[html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-accent-cyan [html[data-theme=monochrome]_&]:border-y-border [html[data-theme=monochrome]_&]:border-r-border',
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
                data-monochrome-state={privacyMode === 'local_only' ? 'selected' : 'idle'}
                onClick={() => onPrivacyModeChange('local_only')}
                className={cn(
                  'rounded-md border border-border px-2 py-2 text-secondary outline-none',
                  'focus-visible:ring-1 focus-visible:ring-ring',
                  privacyMode === 'local_only' && 'border-success/40 bg-success/10 text-success',
                  '[html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:bg-background',
                  privacyMode === 'local_only' &&
                    '[html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-success',
                )}
              >
                Local only
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={privacyMode === 'provider_allowed'}
                data-monochrome-state={privacyMode === 'provider_allowed' ? 'selected' : 'idle'}
                disabled={offlineMode}
                onClick={() => onPrivacyModeChange('provider_allowed')}
                className={cn(
                  'rounded-md border border-border px-2 py-2 text-secondary outline-none disabled:opacity-45',
                  'focus-visible:ring-1 focus-visible:ring-ring',
                  privacyMode === 'provider_allowed' &&
                    'border-accent-cyan/40 bg-accent-cyan/10 text-foreground',
                  '[html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:bg-background',
                  privacyMode === 'provider_allowed' &&
                    '[html[data-theme=monochrome]_&]:border-l-2 [html[data-theme=monochrome]_&]:border-l-accent-cyan',
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
