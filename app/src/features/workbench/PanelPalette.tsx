import * as React from 'react';
import {
  Activity,
  Bot,
  Boxes,
  Code2,
  Database,
  FileText,
  Github,
  Globe2,
  KanbanSquare,
  Network,
  NotebookPen,
  PlugZap,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { WorkbenchPanelKind } from './types';

const palette: Array<{
  kind: WorkbenchPanelKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { kind: 'terminal', label: 'Terminal', icon: Terminal },
  { kind: 'browser', label: 'Browser', icon: Globe2 },
  { kind: 'jarvis', label: 'Jarvis', icon: Bot },
  { kind: 'agent', label: 'Agent', icon: Sparkles },
  { kind: 'files', label: 'Files', icon: FileText },
  { kind: 'editor', label: 'Editor', icon: Code2 },
  { kind: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { kind: 'actions', label: 'Actions', icon: Boxes },
  { kind: 'notes', label: 'Notes', icon: NotebookPen },
  { kind: 'diagram', label: 'Diagram', icon: Network },
  { kind: 'plugins', label: 'Plugins', icon: PlugZap },
  { kind: 'github', label: 'GitHub', icon: Github },
  { kind: 'supabase', label: 'Supabase', icon: Database },
  { kind: 'activity', label: 'Activity', icon: Activity },
];

export const WORKBENCH_DRAG_MIME = 'application/x-vibespace-workbench-panel';

export function PanelPalette({ onAdd }: { onAdd: (kind: WorkbenchPanelKind) => void }) {
  return (
    <aside className="workbench-palette" aria-label="Workbench panels">
      <p>Panels</p>
      {palette.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          aria-label={`Add ${label}`}
          draggable
          onClick={() => onAdd(kind)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(
              WORKBENCH_DRAG_MIME,
              JSON.stringify({ version: 1, kind }),
            );
          }}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </aside>
  );
}
