import * as React from 'react';
import { ChevronDown, Users, X } from 'lucide-react';

import { DEFAULT_JARVIS_ACTION_REGISTRATIONS } from '@/lib/jarvis/actions/catalog';
import { getPluginManifest } from '@/features/plugins/catalog';
import { PluginLogo } from '@/features/plugins/PluginLogo';
import type { Part } from '@/types';
import { cn } from '@/lib/utils';

type ActionPart = Extract<Part, { kind: 'action_proposal' }>;

export type PluginActionEvidence = Readonly<{
  plugin: NonNullable<ReturnType<typeof getPluginManifest>>;
  invocationCount: number;
  primary: boolean;
  tools: readonly Readonly<{
    name: string;
    status: ActionPart['status'];
  }>[];
}>;

function registrationFor(actionId: string) {
  const registration = DEFAULT_JARVIS_ACTION_REGISTRATIONS.find(
    (candidate) => candidate.id === actionId,
  );
  return registration?.executor.kind === 'plugin_tool' ? registration.executor : undefined;
}

export function resolvePluginActionEvidence(
  part: ActionPart,
  allParts: readonly Part[],
): PluginActionEvidence | undefined {
  const executor = registrationFor(part.action_id);
  if (!executor) return undefined;
  const plugin = getPluginManifest(executor.pluginId);
  if (!plugin) return undefined;

  const pluginActions = allParts.flatMap((candidate) => {
    if (candidate.kind !== 'action_proposal') return [];
    const candidateExecutor = registrationFor(candidate.action_id);
    if (candidateExecutor?.pluginId !== plugin.id) return [];
    return [{ part: candidate, executor: candidateExecutor }];
  });
  const finalAction = pluginActions.at(-1)?.part;

  return Object.freeze({
    plugin,
    invocationCount: Math.max(1, pluginActions.length),
    primary: finalAction?.call_id === part.call_id,
    tools: Object.freeze(
      pluginActions.map(({ part: candidate, executor: candidateExecutor }) =>
        Object.freeze({ name: candidateExecutor.toolName, status: candidate.status }),
      ),
    ),
  });
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function statusPresentation(status: ActionPart['status']) {
  if (status === 'success') return { label: 'Connected', className: 'is-connected' } as const;
  if (status === 'running' || status === 'queued') {
    return { label: 'In use', className: 'is-running' } as const;
  }
  if (status === 'error') return { label: 'Failed', className: 'is-error' } as const;
  if (status === 'cancelled') return { label: 'Cancelled', className: 'is-cancelled' } as const;
  return { label: 'Approval needed', className: 'is-pending' } as const;
}

export function PluginUsageCard({
  part,
  allParts,
}: {
  part: ActionPart;
  allParts: readonly Part[];
}) {
  const evidence = resolvePluginActionEvidence(part, allParts);
  const [expanded, setExpanded] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  if (!evidence || !evidence.primary) return null;

  const aggregateStatus = evidence.tools.some((tool) => tool.status === 'error')
    ? 'error'
    : evidence.tools.some((tool) => tool.status === 'running' || tool.status === 'queued')
      ? 'running'
      : evidence.tools.some((tool) => tool.status === 'pending')
        ? 'pending'
        : evidence.tools.some((tool) => tool.status === 'cancelled')
          ? 'cancelled'
          : 'success';
  const status = statusPresentation(aggregateStatus);
  const capabilities = evidence.plugin.supportedFeatures.slice(0, 3).map(titleCase);

  if (hidden) {
    return (
      <button
        type="button"
        className="text-metadata text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setHidden(false)}
      >
        Show {evidence.plugin.name} plugin activity
      </button>
    );
  }

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-border/75 bg-card/72 text-foreground shadow-sm"
      data-plugin-usage-card={evidence.plugin.id}
      aria-label={`${evidence.plugin.name} plugin activity`}
    >
      <span className="absolute inset-y-0 left-0 w-0.5 bg-emerald-500/75" aria-hidden />
      <div className="flex min-w-0 items-center gap-2.5 px-2.5 py-2">
        <PluginLogo plugin={evidence.plugin} size="md" className="bg-muted/70" />
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
            Plugin
          </div>
          <div className="truncate text-xs font-semibold">{evidence.plugin.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {capabilities.join(' · ') || titleCase(evidence.tools[0]?.name ?? 'Plugin tool')}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold',
            status.className === 'is-connected' &&
              'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
            status.className === 'is-running' &&
              'border-accent-copper/30 bg-accent-copper/10 text-accent-copper',
            status.className === 'is-error' &&
              'border-destructive/30 bg-destructive/8 text-destructive',
            status.className === 'is-cancelled' &&
              'border-border bg-muted/60 text-muted-foreground',
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {status.label}
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
          title={`${evidence.invocationCount} plugin invocation${evidence.invocationCount === 1 ? '' : 's'}`}
        >
          <Users className="h-3 w-3" aria-hidden />
          {evidence.invocationCount}
        </span>
        <button
          type="button"
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${evidence.plugin.name} plugin activity`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Hide ${evidence.plugin.name} plugin activity`}
          onClick={() => setHidden(true)}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {expanded ? (
        <div
          className="grid gap-1 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground"
          aria-label={`${evidence.plugin.name} plugin invocation details`}
        >
          {evidence.tools.map((tool, index) => {
            const toolStatus = statusPresentation(tool.status);
            return (
              <div
                key={`${tool.name}:${index}`}
                className="flex min-w-0 items-center justify-between gap-3"
              >
                <span className="truncate text-foreground/80">{titleCase(tool.name)}</span>
                <span className="shrink-0">{toolStatus.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
