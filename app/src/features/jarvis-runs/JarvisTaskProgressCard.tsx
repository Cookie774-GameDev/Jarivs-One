import { Bot, CircleStop, Terminal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useJarvisTaskRunStore, type JarvisTaskRun } from './taskRunStore';

export interface JarvisTaskProgressCardProps {
  chatId: string;
  compact?: boolean;
}

const ACTIVE_STATUSES = new Set([
  'planning',
  'waiting-for-approval',
  'running',
  'waiting-for-input',
  'blocked',
]);

function statusLabel(status: JarvisTaskRun['status']): string {
  switch (status) {
    case 'waiting-for-approval': return 'Approval needed';
    case 'waiting-for-input': return 'Input needed';
    case 'blocked': return 'Blocked';
    case 'planning': return 'Planning';
    default: return 'Working';
  }
}

export function JarvisTaskProgressCard({ chatId, compact = false }: JarvisTaskProgressCardProps) {
  const runs = useJarvisTaskRunStore((state) => state.runs);
  const cancelRun = useJarvisTaskRunStore((state) => state.cancelRun);
  const visible = Object.values(runs)
    .filter((run) => run.chatId === chatId && ACTIVE_STATUSES.has(run.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <aside
      className={cn(
        'flex flex-col gap-2',
        compact ? 'mx-1 mb-3' : 'sticky bottom-2 z-10 mb-4',
      )}
      aria-label="Jarvis task progress"
    >
      {visible.map((run) => (
        <div
          key={run.id}
          className="overflow-hidden rounded-md border border-border/80 bg-elevated/95 shadow-sm backdrop-blur"
        >
          <div className="flex items-start gap-3 px-3 pb-2 pt-2.5">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-accent-copper/30 bg-accent-copper/10">
              <Bot className="h-3.5 w-3.5 text-accent-copper" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-secondary font-medium text-foreground">{run.goal}</p>
                <span className="ml-auto shrink-0 text-metadata uppercase tracking-wide text-muted-foreground">
                  {statusLabel(run.status)}
                </span>
              </div>
              <p className="mt-0.5 text-metadata text-muted-foreground">{run.userVisibleSummary}</p>
              {(run.activeAgents.length > 0 || run.activeTerminals.length > 0) && (
                <div className="mt-1.5 flex items-center gap-3 text-metadata text-muted-foreground">
                  {run.activeAgents.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Bot className="h-3 w-3" aria-hidden="true" />
                      {run.activeAgents.length} {run.activeAgents.length === 1 ? 'agent' : 'agents'}
                    </span>
                  )}
                  {run.activeTerminals.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Terminal className="h-3 w-3" aria-hidden="true" />
                      {run.activeTerminals.length} {run.activeTerminals.length === 1 ? 'terminal' : 'terminals'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => cancelRun(run.id)}
              aria-label="Cancel task"
              title="Cancel task"
            >
              <CircleStop className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div
            className="h-0.5 bg-border/70"
            role="progressbar"
            aria-label={`${run.goal} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={run.progress}
          >
            <div
              className="h-full bg-accent-copper transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${run.progress}%` }}
            />
          </div>
        </div>
      ))}
    </aside>
  );
}
