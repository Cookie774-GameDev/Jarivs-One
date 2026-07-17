import { Moon, Sparkles } from 'lucide-react';
import { useUIStore } from '@/stores/ui';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SELECTABLE_THEMES, type SelectableTheme } from '@/features/appearance/themes';

const THEME_ICONS: Record<SelectableTheme, typeof Moon> = {
  vibespace: Sparkles,
  default: Moon,
};

const DENSITIES: { id: 'compact' | 'cozy'; label: string; description: string }[] = [
  { id: 'compact', label: 'Compact', description: '13px text, 28px rows. Maximum density.' },
  { id: 'cozy', label: 'Cozy', description: 'A touch more breathing room.' },
];

export function Appearance() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const density = useUIStore((s) => s.density);
  const defaultTerminalFontSize = useUIStore((s) => s.defaultTerminalFontSize);
  const setDefaultTerminalFontSize = useUIStore((s) => s.setDefaultTerminalFontSize);

  function setDensity(d: 'compact' | 'cozy') {
    // density has no dedicated action in the store yet; setState is the safe
    // imperative escape hatch zustand always provides.
    useUIStore.setState({ density: d });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-page-title text-foreground">Appearance</h2>
        <p className="text-secondary text-muted-foreground mt-1">
          Pick the app skin without replacing the existing themes.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <Label>Theme</Label>
        <div className="grid grid-cols-2 gap-2 max-w-md" role="radiogroup" aria-label="App theme">
          {SELECTABLE_THEMES.map((t) => {
            const Icon = THEME_ICONS[t.id];
            const selected = theme === t.id;
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => setTheme(t.id)}
                aria-pressed={selected}
                role="radio"
                aria-checked={selected}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-md border bg-panel py-4 transition-colors',
                  'hover:bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  selected
                    ? 'border-accent-cyan/50 shadow-[0_0_0_1px_hsl(var(--accent-cyan)/0.3)]'
                    : 'border-border',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', selected ? 'text-accent-cyan' : 'text-muted-foreground')}
                />
                <span
                  className={cn(
                    'text-ui-strong',
                    selected ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t.label}
                </span>
                <span className="text-metadata text-muted-foreground text-center px-2">
                  {t.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <Label>Density</Label>
        <div className="grid grid-cols-2 gap-2 max-w-md">
          {DENSITIES.map((d) => {
            const selected = density === d.id;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setDensity(d.id)}
                aria-pressed={selected}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-md border bg-panel px-3 py-2.5 text-left transition-colors',
                  'hover:bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  selected
                    ? 'border-accent-cyan/50 shadow-[0_0_0_1px_hsl(var(--accent-cyan)/0.3)]'
                    : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'text-ui-strong',
                    selected ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {d.label}
                </span>
                <span className="text-metadata text-muted-foreground">{d.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="default-font-size">Terminal default font size</Label>
            <p className="text-metadata text-muted-foreground mt-1">
              Global baseline font size for newly spawned or unscaled terminal panes.
            </p>
          </div>
          <span className="text-metadata text-accent-cyan font-medium">
            {defaultTerminalFontSize}px
          </span>
        </div>
        <input
          id="default-font-size"
          type="range"
          min="1"
          max="72"
          value={defaultTerminalFontSize}
          onChange={(e) => setDefaultTerminalFontSize(Number(e.target.value))}
          className="h-1.5 w-full appearance-none rounded-lg bg-border cursor-pointer accent-accent-cyan"
        />
      </section>
    </div>
  );
}
