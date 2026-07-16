import { AppWindow, Grid2X2Plus } from 'lucide-react';
import { registerAction } from '@/features/command-palette/actions';
import { useUIStore } from '@/stores/ui';
import { useWorkbenchStore } from './store';

registerAction({
  id: 'open-workbench',
  label: 'Open Workbench',
  description: 'Open the spatial canvas without changing its saved layout',
  icon: AppWindow,
  page: 'root',
  keywords: ['canvas', 'workspace', 'desktop', 'spatial'],
  perform: ({ closePalette }) => {
    useUIStore.getState().setRoute('workbench');
    closePalette();
  },
});

registerAction({
  id: 'spawn-workbench',
  label: 'Spawn Workbench',
  description: 'Create the web development layout with four terminals',
  icon: Grid2X2Plus,
  page: 'root',
  keywords: ['canvas', 'terminals', 'browser', 'web development', 'agents'],
  perform: ({ closePalette }) => {
    useWorkbenchStore.getState().applyTemplate('web-development');
    useUIStore.getState().setRoute('workbench');
    closePalette();
  },
});
