export const WORKBENCH_PANEL_KINDS = [
  'terminal',
  'browser',
  'jarvis',
  'agent',
  'files',
  'editor',
  'kanban',
  'actions',
  'notes',
  'diagram',
  'plugins',
  'github',
  'supabase',
  'activity',
] as const;

export type WorkbenchPanelKind = (typeof WORKBENCH_PANEL_KINDS)[number];
export type WorkbenchPanelStatus = 'idle' | 'ready' | 'busy' | 'attention' | 'error';

export interface WorkbenchPanelSettings {
  url?: string;
  cwd?: string;
  command?: string;
  route?: string;
  resourceId?: string;
  agentId?: string;
  note?: string;
  language?: string;
}

export interface WorkbenchPanel {
  id: string;
  kind: WorkbenchPanelKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  status: WorkbenchPanelStatus;
  settings: WorkbenchPanelSettings;
}

export type WorkbenchPanelTemplate = Omit<WorkbenchPanel, 'id' | 'z' | 'status'> & {
  status?: WorkbenchPanelStatus;
};

export interface WorkbenchView {
  x: number;
  y: number;
  zoom: number;
}

export type WallpaperId =
  | 'none'
  | 'warm-gradient'
  | 'space-clouds'
  | 'starfield'
  | 'orbital-lights'
  | 'particles'
  | 'fluid-gradient'
  | 'aurora'
  | 'cozy-night-window'
  | 'grid-pulse'
  | 'custom-image'
  | 'custom-video'
  | 'user-pack';

export interface WorkbenchWallpaperConfig {
  id: WallpaperId;
  paused: boolean;
  interactive: boolean;
  intensity: number;
  quality: 'low' | 'balanced' | 'high';
  assetUrl?: string;
}

export interface WorkbenchTemplate {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  wallpaperId: WallpaperId;
  panels: WorkbenchPanelTemplate[];
}

export interface WorkbenchDocument {
  version: 1;
  panels: WorkbenchPanel[];
  view: WorkbenchView;
  wallpaper: WorkbenchWallpaperConfig;
  customTemplates: WorkbenchTemplate[];
  updatedAt: number;
}

export const DEFAULT_PANEL_SIZE: Record<WorkbenchPanelKind, { width: number; height: number }> = {
  terminal: { width: 520, height: 300 },
  browser: { width: 680, height: 440 },
  jarvis: { width: 360, height: 460 },
  agent: { width: 330, height: 300 },
  files: { width: 300, height: 440 },
  editor: { width: 620, height: 440 },
  kanban: { width: 620, height: 420 },
  actions: { width: 360, height: 360 },
  notes: { width: 360, height: 330 },
  diagram: { width: 560, height: 400 },
  plugins: { width: 400, height: 360 },
  github: { width: 440, height: 380 },
  supabase: { width: 480, height: 400 },
  activity: { width: 400, height: 360 },
};

export const PANEL_TITLES: Record<WorkbenchPanelKind, string> = {
  terminal: 'Terminal',
  browser: 'Browser',
  jarvis: 'Jarvis',
  agent: 'Agent',
  files: 'Project files',
  editor: 'Editor & preview',
  kanban: 'Kanban',
  actions: 'Jarvis actions',
  notes: 'Notes',
  diagram: 'Diagram',
  plugins: 'Plugins & MCP',
  github: 'GitHub',
  supabase: 'Supabase',
  activity: 'Activity',
};
