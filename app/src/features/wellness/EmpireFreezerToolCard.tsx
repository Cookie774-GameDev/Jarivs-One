import { useSyncExternalStore } from 'react';
import { Eye, Pause, Play, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runAction } from '@/lib/actions';
import { getEmpireFreezerConfig, subscribeEmpireFreezer } from './empireFreezer';

export function EmpireFreezerToolCard() {
  const config = useSyncExternalStore(
    subscribeEmpireFreezer,
    getEmpireFreezerConfig,
    getEmpireFreezerConfig,
  );
  const intervalMinutes = Math.round(config.intervalMs / 60_000);
  const durationSeconds = Math.round(config.durationMs / 1000);

  const run = (mode: 'enable' | 'pause' | 'run_now') =>
    void runAction(
      'wellness.empireFreezer',
      { mode, intervalMin: intervalMinutes, durationSec: durationSeconds },
      { source: 'user' },
    );

  return (
    <article className="flex min-h-36 w-full flex-col justify-between gap-3 rounded-lg border border-border bg-paper px-4 py-4 shadow-soft">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-accent-cyan/25 bg-accent-cyan/10">
          <Snowflake className="h-5 w-5 text-accent-cyan" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            Empire Freezer
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {config.enabled ? 'Active' : 'Paused'}
            </span>
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            A local {durationSeconds}-second eye rest every {intervalMinutes} minutes. One timer, no
            AI, no network, and it waits while VibeSpace is hidden or busy.
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-[60px]">
        <Button
          size="sm"
          variant={config.enabled ? 'ghost' : 'default'}
          onClick={() => run(config.enabled ? 'pause' : 'enable')}
          aria-label={config.enabled ? 'Pause Empire Freezer' : 'Enable Empire Freezer'}
        >
          {config.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {config.enabled ? 'Pause' : 'Enable'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => run('run_now')}>
          <Eye className="h-3.5 w-3.5" /> Take a break now
        </Button>
      </div>
    </article>
  );
}
