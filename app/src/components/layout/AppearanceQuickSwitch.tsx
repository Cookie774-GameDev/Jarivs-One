import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui';

interface AppearanceQuickSwitchProps {
  compact?: boolean;
}

const QUICK_APPEARANCES = [
  { id: 'default', label: 'Default', compactLabel: 'D' },
  { id: 'vibespace', label: 'VibeSpace', compactLabel: 'V' },
] as const;

export function AppearanceQuickSwitch({ compact = false }: AppearanceQuickSwitchProps) {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  return (
    <div
      className={cn(
        'appearance-quick-switch no-drag inline-flex shrink-0 items-center border border-border bg-background/70 shadow-sm',
        'supports-[backdrop-filter]:bg-background/55 supports-[backdrop-filter]:backdrop-blur-sm',
        compact ? 'h-6 gap-px rounded-[7px] p-0.5' : 'h-7 gap-0.5 rounded-[9px] p-0.5',
      )}
      role="group"
      aria-label="App appearance"
      data-compact={compact ? 'true' : 'false'}
    >
      {QUICK_APPEARANCES.map((appearance) => {
        const selected = theme === appearance.id;
        return (
          <button
            key={appearance.id}
            type="button"
            aria-label={appearance.label}
            aria-pressed={selected}
            title={`Use ${appearance.label} appearance`}
            data-appearance-choice={appearance.id}
            onClick={() => setTheme(appearance.id)}
            className={cn(
              'appearance-quick-switch__choice inline-flex h-full items-center justify-center font-semibold tracking-tight transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              compact ? 'min-w-5 rounded-[5px] px-1 text-[9px]' : 'min-w-[54px] rounded-[7px] px-2 text-[10px]',
              selected
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span aria-hidden="true">{compact ? appearance.compactLabel : appearance.label}</span>
          </button>
        );
      })}
    </div>
  );
}
