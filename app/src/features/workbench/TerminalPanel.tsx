import * as React from 'react';
import { TerminalView } from '@/features/terminals/TerminalView';
import type { WorkbenchPanel } from './types';

interface TerminalPanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

export function TerminalPanel({ panel, onUpdate }: TerminalPanelProps) {
  const panelRef = React.useRef(panel);
  const onUpdateRef = React.useRef(onUpdate);
  React.useEffect(() => {
    panelRef.current = panel;
    onUpdateRef.current = onUpdate;
  }, [onUpdate, panel]);

  const handleReady = React.useCallback(
    (sessionId: string) => {
      const current = panelRef.current;
      if (current.settings.resourceId === sessionId && current.status === 'ready') return;
      onUpdateRef.current({
        status: 'ready',
        settings: { ...current.settings, resourceId: sessionId },
      });
    },
    [],
  );

  return (
    <TerminalView
      className="h-full min-h-0 rounded-none border-0 shadow-none"
      hideChrome
      sessionId={panel.settings.resourceId}
      startupCommand={panel.settings.resourceId ? undefined : panel.settings.command}
      cwd={panel.settings.cwd}
      rows={24}
      cols={92}
      fontSize={10}
      onReady={handleReady}
      onFocus={() => onUpdate({ status: 'busy' })}
      onBlur={() => onUpdate({ status: 'ready' })}
      onExit={() => onUpdate({ status: 'attention' })}
    />
  );
}
