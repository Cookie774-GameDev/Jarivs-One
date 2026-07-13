import * as React from 'react';
import {
  Activity,
  Bot,
  Boxes,
  Code2,
  Database,
  FileText,
  Github,
  KanbanSquare,
  Network,
  NotebookPen,
  PlugZap,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore, type Route } from '@/stores/ui';
import type { WorkbenchPanel, WorkbenchPanelKind } from './types';

interface ReferencePanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

const icons: Record<Exclude<WorkbenchPanelKind, 'terminal' | 'browser'>, React.ComponentType<{ className?: string }>> = {
  jarvis: Bot,
  agent: Sparkles,
  files: FileText,
  editor: Code2,
  kanban: KanbanSquare,
  actions: Boxes,
  notes: NotebookPen,
  diagram: Network,
  plugins: PlugZap,
  github: Github,
  supabase: Database,
  activity: Activity,
};

const routeByKind: Partial<Record<WorkbenchPanelKind, Route>> = {
  jarvis: 'chat',
  agent: 'agents',
  files: 'files',
  kanban: 'kanban',
  actions: 'tools',
  plugins: 'tools',
  github: 'tools',
  supabase: 'tools',
  activity: 'history',
};

export function ReferencePanel({ panel, onUpdate }: ReferencePanelProps) {
  const setRoute = useUIStore((state) => state.setRoute);
  const Icon = icons[panel.kind as Exclude<WorkbenchPanelKind, 'terminal' | 'browser'>];

  if (panel.kind === 'notes') {
    return (
      <textarea
        className="workbench-note-editor"
        aria-label={`${panel.title} content`}
        placeholder="Capture decisions, links, and next steps…"
        value={panel.settings.note ?? ''}
        onChange={(event) =>
          onUpdate({ settings: { ...panel.settings, note: event.target.value.slice(0, 20_000) } })
        }
      />
    );
  }

  if (panel.kind === 'editor') {
    return (
      <div className="workbench-editor-split">
        <textarea
          aria-label="Editor content"
          value={panel.settings.note ?? '// Start shaping the idea here.\n'}
          onChange={(event) =>
            onUpdate({ settings: { ...panel.settings, note: event.target.value.slice(0, 40_000) } })
          }
          spellCheck={false}
        />
        <pre aria-label="Editor preview">{panel.settings.note ?? '// Preview waits for your draft.'}</pre>
      </div>
    );
  }

  const route = routeByKind[panel.kind];
  return (
    <div className="workbench-reference-panel" data-workbench-reference={panel.kind}>
      <div className="workbench-reference-orbit" aria-hidden="true">
        {Icon ? <Icon className="h-7 w-7" /> : null}
      </div>
      <div>
        <p className="workbench-reference-kicker">Connected VibeSpace surface</p>
        <h3>{panel.title}</h3>
        <p>
          This panel keeps a lightweight live reference here while the full workspace remains one
          click away.
        </p>
      </div>
      {route ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setRoute(route)}>
          Open full {panel.kind} view
        </Button>
      ) : null}
    </div>
  );
}
