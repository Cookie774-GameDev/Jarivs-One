import * as React from 'react';
import {
  AppWindow,
  Grid2X2Plus,
  LayoutTemplate,
  LocateFixed,
  Pause,
  Play,
  Redo2,
  Sparkles,
  Undo2,
  Wallpaper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useUIStore } from '@/stores/ui';
import { PanelPalette } from './PanelPalette';
import { TemplatePicker } from './TemplatePicker';
import { WallpaperHost } from './WallpaperHost';
import { WallpaperPicker } from './WallpaperPicker';
import { WorkbenchCanvas } from './WorkbenchCanvas';
import { useWorkbenchStore } from './store';
import { openDetachedWorkbench } from './window';
import type { WorkbenchPanelKind } from './types';
import './workbench.css';

export function WorkbenchPage() {
  const setRoute = useUIStore((state) => state.setRoute);
  const wallpaper = useWorkbenchStore((state) => state.wallpaper);
  const configureWallpaper = useWorkbenchStore((state) => state.configureWallpaper);
  const addPanel = useWorkbenchStore((state) => state.addPanel);
  const applyTemplate = useWorkbenchStore((state) => state.applyTemplate);
  const autoArrange = useWorkbenchStore((state) => state.autoArrange);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const history = useWorkbenchStore((state) => state.history);
  const future = useWorkbenchStore((state) => state.future);
  const warning = useWorkbenchStore((state) => state.persistenceWarning);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [wallpapersOpen, setWallpapersOpen] = React.useState(false);

  React.useEffect(() => {
    if (warning) toast.warning('Workbench recovered', warning);
  }, [warning]);

  const spawn = () => {
    applyTemplate('web-development');
    toast.success('Web development Workbench ready', 'Four terminals and two isolated browser surfaces were placed.');
  };

  const add = (kind: WorkbenchPanelKind) => {
    addPanel(kind);
  };

  return (
    <main
      className="workbench-shell"
      aria-label="VibeSpace Workbench"
    >
      <WallpaperHost config={wallpaper} />
      <header className="workbench-toolbar">
        <div className="workbench-wordmark">
          <span><Sparkles /></span>
          <div><p>Spatial runtime</p><h1>Workbench</h1></div>
        </div>
        <div className="workbench-toolbar-actions">
          <Button type="button" size="sm" variant="accent" aria-label="Spawn Workbench" onClick={spawn}>
            <Grid2X2Plus /> Spawn Workbench
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Templates" onClick={() => setTemplatesOpen(true)}>
            <LayoutTemplate /> Templates
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Wallpapers" onClick={() => setWallpapersOpen(true)}>
            <Wallpaper /> Wallpapers
          </Button>
          <span className="workbench-toolbar-divider" />
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Undo" disabled={!history.length} onClick={undo}><Undo2 /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Redo" disabled={!future.length} onClick={redo}><Redo2 /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Auto arrange panels" onClick={autoArrange}><LocateFixed /></Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={wallpaper.paused ? 'Resume wallpaper' : 'Pause wallpaper'}
            onClick={() => configureWallpaper({ paused: !wallpaper.paused })}
          >
            {wallpaper.paused ? <Play /> : <Pause />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={async () => {
              const result = await openDetachedWorkbench();
              result.ok
                ? toast.success('Workbench window opened')
                : toast.warning('Could not open Workbench window', result.reason);
            }}
          >
            <AppWindow /> New window
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRoute('chat')}>Classic VibeSpace</Button>
        </div>
      </header>
      <div className="workbench-content">
        <PanelPalette onAdd={add} />
        <WorkbenchCanvas />
      </div>
      <TemplatePicker open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <WallpaperPicker open={wallpapersOpen} onClose={() => setWallpapersOpen(false)} />
    </main>
  );
}

export default WorkbenchPage;
