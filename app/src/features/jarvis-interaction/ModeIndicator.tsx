import { Bot, ClipboardList, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { interactionModeDescription, interactionModeLabel } from './modes';
import type { JarvisInteractionMode } from './types';

export interface ModeIndicatorProps {
  mode: JarvisInteractionMode;
  compact?: boolean;
  onCycle?: () => void;
}

export function ModeIndicator({ mode, compact = false, onCycle }: ModeIndicatorProps) {
  const Icon = mode === 'plan' ? ClipboardList : mode === 'ask' ? HelpCircle : Bot;
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-metadata transition',
        mode === 'agent' && 'border-accent-cyan/35 bg-accent-cyan/10 text-accent-cyan',
        mode === 'plan' && 'border-accent-copper/45 bg-accent-copper/10 text-accent-copper',
        mode === 'ask' && 'border-accent-violet/40 bg-accent-violet/10 text-accent-violet',
        compact && 'shrink-0 whitespace-nowrap px-2 py-1 text-[11px]',
      )}
      title={`${interactionModeDescription(mode)} Shift+Tab cycles modes.`}
      aria-label={`${interactionModeLabel(mode)}. Shift Tab cycles modes.`}
      onClick={onCycle}
    >
      <Icon className="h-3 w-3" />
      <span>{interactionModeLabel(mode)}</span>
    </button>
  );
}
