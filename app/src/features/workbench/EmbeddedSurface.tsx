import * as React from 'react';
import type { WorkbenchPanelKind } from './types';

const KanbanPage = React.lazy(() =>
  import('@/features/kanban').then((m) => ({ default: m.KanbanPage })),
);
const AgentManager = React.lazy(() =>
  import('@/features/agents').then((m) => ({ default: m.AgentManager })),
);
const ToolsPage = React.lazy(() =>
  import('@/features/tools').then((m) => ({ default: m.ToolsPage })),
);
const HistoryPage = React.lazy(() =>
  import('@/features/history').then((m) => ({ default: m.HistoryPage })),
);
const ContextPage = React.lazy(() =>
  import('@/features/context').then((m) => ({ default: m.ContextPage })),
);

function SurfaceFallback({ label }: { label: string }) {
  return (
    <div className="workbench-panel-empty">
      <strong>Loading {label}…</strong>
      <span>Connecting to the live VibeSpace surface.</span>
    </div>
  );
}

/**
 * Mount real app pages inside Workbench panels (same stores/APIs as main routes).
 */
export function EmbeddedSurface({ kind }: { kind: WorkbenchPanelKind }) {
  let node: React.ReactNode = null;
  let label = String(kind);

  switch (kind) {
    case 'kanban':
      label = 'Kanban';
      node = <KanbanPage />;
      break;
    case 'agent':
      label = 'Agents';
      node = <AgentManager />;
      break;
    case 'actions':
    case 'plugins':
    case 'github':
    case 'supabase':
      label = 'Tools';
      node = <ToolsPage />;
      break;
    case 'activity':
      label = 'Activity';
      node = <HistoryPage />;
      break;
    case 'diagram':
      label = 'Context map';
      node = <ContextPage />;
      break;
    default:
      return null;
  }

  return (
    <div
      className="workbench-embedded-surface"
      data-testid={`workbench-embedded-${kind}`}
      data-workbench-surface={kind}
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <React.Suspense fallback={<SurfaceFallback label={label} />}>{node}</React.Suspense>
    </div>
  );
}

export function isEmbeddedSurfaceKind(kind: WorkbenchPanelKind): boolean {
  return (
    kind === 'kanban' ||
    kind === 'agent' ||
    kind === 'actions' ||
    kind === 'plugins' ||
    kind === 'github' ||
    kind === 'supabase' ||
    kind === 'activity' ||
    kind === 'diagram'
  );
}
