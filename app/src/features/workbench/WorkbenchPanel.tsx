import * as React from 'react';
import { Copy, GripHorizontal, Minus, X } from 'lucide-react';
import { BrowserPanel } from './BrowserPanel';
import { ReferencePanel } from './ReferencePanel';
import { TerminalPanel } from './TerminalPanel';
import type { WorkbenchPanel as WorkbenchPanelModel } from './types';

interface WorkbenchPanelProps {
  panel: WorkbenchPanelModel;
  selected: boolean;
  zoom: number;
  onSelect: (additive: boolean) => void;
  onBringToFront: () => void;
  onUpdate: (patch: Partial<WorkbenchPanelModel>) => void;
  onRuntimeUpdate: (patch: Partial<WorkbenchPanelModel>) => void;
  onDuplicate: () => void;
  onClose: () => void;
}

export function WorkbenchPanel({
  panel,
  selected,
  zoom,
  onSelect,
  onBringToFront,
  onUpdate,
  onRuntimeUpdate,
  onDuplicate,
  onClose,
}: WorkbenchPanelProps) {
  const [draft, setDraft] = React.useState({
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
  });
  const onUpdateRef = React.useRef(onUpdate);
  const onRuntimeUpdateRef = React.useRef(onRuntimeUpdate);
  onUpdateRef.current = onUpdate;
  onRuntimeUpdateRef.current = onRuntimeUpdate;

  // Stable identities so child panels (Files/Jarvis/Editor) never re-subscribe
  // effects solely because the canvas re-rendered with new inline lambdas.
  const update = React.useCallback((patch: Partial<WorkbenchPanelModel>) => {
    onUpdateRef.current(patch);
  }, []);
  const updateRuntime = React.useCallback((patch: Partial<WorkbenchPanelModel>) => {
    onRuntimeUpdateRef.current(patch);
  }, []);

  React.useEffect(() => {
    setDraft({ x: panel.x, y: panel.y, width: panel.width, height: panel.height });
  }, [panel.height, panel.width, panel.x, panel.y]);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button,input,textarea')) return;
    event.preventDefault();
    onSelect(event.shiftKey);
    onBringToFront();
    const start = { clientX: event.clientX, clientY: event.clientY, x: draft.x, y: draft.y };
    const move = (moveEvent: PointerEvent) => {
      setDraft((current) => ({
        ...current,
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / zoom),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / zoom),
      }));
    };
    const up = (upEvent: PointerEvent) => {
      const x = Math.round(start.x + (upEvent.clientX - start.clientX) / zoom);
      const y = Math.round(start.y + (upEvent.clientY - start.clientY) / zoom);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onUpdate({ x, y });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      width: draft.width,
      height: draft.height,
    };
    const move = (moveEvent: PointerEvent) => {
      setDraft((current) => ({
        ...current,
        width: Math.max(240, Math.round(start.width + (moveEvent.clientX - start.clientX) / zoom)),
        height: Math.max(
          160,
          Math.round(start.height + (moveEvent.clientY - start.clientY) / zoom),
        ),
      }));
    };
    const up = (upEvent: PointerEvent) => {
      const width = Math.max(
        240,
        Math.round(start.width + (upEvent.clientX - start.clientX) / zoom),
      );
      const height = Math.max(
        160,
        Math.round(start.height + (upEvent.clientY - start.clientY) / zoom),
      );
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onUpdate({ width, height });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <section
      className="workbench-panel"
      data-kind={panel.kind}
      data-panel-id={panel.id}
      data-selected={selected ? 'true' : 'false'}
      data-minimized={panel.minimized ? 'true' : 'false'}
      aria-label={`${panel.title} panel`}
      style={{
        left: draft.x,
        top: draft.y,
        width: draft.width,
        height: panel.minimized ? 42 : draft.height,
        zIndex: panel.z,
      }}
      onPointerDown={(event) => {
        onSelect(event.shiftKey);
        onBringToFront();
      }}
    >
      <header className="workbench-panel-header" onPointerDown={beginDrag}>
        <span
          className={`workbench-panel-status workbench-panel-status--${panel.status}`}
          role="status"
        >
          <span className="sr-only">Status: {panel.status}</span>
        </span>
        <GripHorizontal aria-hidden="true" />
        <strong>{panel.title}</strong>
        <span className="workbench-panel-kind">{panel.kind}</span>
        <button type="button" aria-label={`Duplicate ${panel.title}`} onClick={onDuplicate}>
          <Copy />
        </button>
        <button
          type="button"
          aria-label={`${panel.minimized ? 'Restore' : 'Minimize'} ${panel.title}`}
          onClick={() => onUpdate({ minimized: !panel.minimized })}
        >
          <Minus />
        </button>
        <button type="button" aria-label={`Close ${panel.title}`} onClick={onClose}>
          <X />
        </button>
      </header>
      <div
        className="workbench-panel-body"
        aria-hidden={panel.minimized}
        onWheel={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {panel.kind === 'terminal' ? (
          <TerminalPanel panel={panel} onUpdate={updateRuntime} />
        ) : panel.kind === 'browser' ? (
          <BrowserPanel panel={panel} onUpdate={update} />
        ) : (
          <ReferencePanel panel={panel} onUpdate={updateRuntime} />
        )}
      </div>
      <button
        type="button"
        className="workbench-panel-resize"
        aria-label={`Resize ${panel.title}`}
        onPointerDown={beginResize}
      />
    </section>
  );
}
