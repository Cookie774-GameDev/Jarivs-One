import type {
  WorkbenchPanel,
  WorkbenchPanelTemplate,
  WorkbenchTemplate,
} from './types';

let fallbackId = 0;

export function createWorkbenchId(prefix = 'panel'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  fallbackId += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

const panel = (
  kind: WorkbenchPanelTemplate['kind'],
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
  settings: WorkbenchPanelTemplate['settings'] = {},
): WorkbenchPanelTemplate => ({
  kind,
  title,
  x,
  y,
  width,
  height,
  minimized: false,
  settings,
});

export const BUILT_IN_TEMPLATES: WorkbenchTemplate[] = [
  {
    id: 'coding',
    name: 'Coding Workbench',
    description: 'Files, editor, Jarvis, and two live terminals.',
    builtIn: true,
    wallpaperId: 'space-clouds',
    panels: [
      panel('files', 'Project files', 60, 70, 280, 620, { route: 'files' }),
      panel('editor', 'Editor & preview', 370, 70, 720, 380, { language: 'typescript' }),
      panel('jarvis', 'Jarvis', 1120, 70, 360, 620, { route: 'chat' }),
      panel('terminal', 'Terminal 1', 370, 480, 350, 260),
      panel('terminal', 'Terminal 2', 740, 480, 350, 260),
    ],
  },
  {
    id: 'multi-agent',
    name: 'Multi-Agent Workbench',
    description: 'A command surface for multiple agents with shared activity.',
    builtIn: true,
    wallpaperId: 'orbital-lights',
    panels: [
      panel('jarvis', 'Jarvis coordinator', 60, 70, 360, 520, { route: 'chat' }),
      panel('agent', 'Codex agent', 450, 70, 340, 260, { agentId: 'codex' }),
      panel('agent', 'Claude agent', 820, 70, 340, 260, { agentId: 'claude' }),
      panel('terminal', 'Codex terminal', 450, 360, 340, 300, { command: 'codex' }),
      panel('terminal', 'Claude terminal', 820, 360, 340, 300, { command: 'claude' }),
      panel('activity', 'Workspace activity', 1190, 70, 360, 590, { route: 'history' }),
    ],
  },
  {
    id: 'research',
    name: 'Research Workbench',
    description: 'Two isolated browser surfaces, notes, Jarvis, and a diagram.',
    builtIn: true,
    wallpaperId: 'aurora',
    panels: [
      panel('browser', 'Research', 60, 70, 620, 400, { url: 'https://www.google.com' }),
      panel('browser', 'Sources', 710, 70, 620, 400, { url: 'https://arxiv.org' }),
      panel('notes', 'Research notes', 60, 500, 400, 330),
      panel('diagram', 'Synthesis map', 490, 500, 560, 330),
      panel('jarvis', 'Jarvis', 1080, 500, 360, 330, { route: 'chat' }),
    ],
  },
  {
    id: 'web-development',
    name: 'Web Development Workbench',
    description: 'Local preview, documentation, project files, Jarvis, and four terminals.',
    builtIn: true,
    wallpaperId: 'space-clouds',
    panels: [
      panel('files', 'Project files', 40, 60, 250, 570, { route: 'files' }),
      panel('browser', 'Local preview', 320, 60, 560, 350, { url: 'http://localhost:5173' }),
      panel('browser', 'API documentation', 910, 60, 560, 350, {
        url: 'https://developer.mozilla.org',
      }),
      panel('jarvis', 'Jarvis', 1500, 60, 330, 570, { route: 'chat' }),
      panel('terminal', 'Codex 1', 320, 440, 270, 260, { command: 'codex' }),
      panel('terminal', 'Codex 2', 610, 440, 270, 260, { command: 'codex' }),
      panel('terminal', 'Claude 1', 910, 440, 270, 260, { command: 'claude' }),
      panel('terminal', 'Claude 2', 1200, 440, 270, 260, { command: 'claude' }),
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase Workbench',
    description: 'Database workspace with browser, terminal, files, and GitHub.',
    builtIn: true,
    wallpaperId: 'grid-pulse',
    panels: [
      panel('supabase', 'Supabase', 50, 70, 500, 430, { route: 'tools' }),
      panel('browser', 'Supabase dashboard', 580, 70, 650, 430, {
        url: 'https://supabase.com/dashboard',
      }),
      panel('files', 'Migrations', 50, 530, 300, 330, { route: 'files' }),
      panel('terminal', 'Database terminal', 380, 530, 500, 330),
      panel('github', 'GitHub', 910, 530, 430, 330, { route: 'tools' }),
    ],
  },
  {
    id: 'content',
    name: 'Content Workbench',
    description: 'Drafting, research, notes, actions, and publishing context.',
    builtIn: true,
    wallpaperId: 'cozy-night-window',
    panels: [
      panel('editor', 'Draft', 60, 70, 650, 560, { language: 'markdown' }),
      panel('browser', 'Research', 740, 70, 600, 340, { url: 'https://www.google.com' }),
      panel('notes', 'Editorial notes', 740, 440, 360, 310),
      panel('actions', 'Jarvis actions', 1130, 440, 360, 310),
    ],
  },
  {
    id: 'blank',
    name: 'Blank Workbench',
    description: 'A quiet canvas ready for your own layout.',
    builtIn: true,
    wallpaperId: 'warm-gradient',
    panels: [],
  },
];

export function instantiateTemplate(template: WorkbenchTemplate): WorkbenchPanel[] {
  return template.panels.map((draft, index) => ({
    ...draft,
    id: createWorkbenchId(draft.kind),
    z: index + 1,
    status: draft.status ?? 'idle',
    settings: { ...draft.settings },
  }));
}

export function findBuiltInTemplate(id: string): WorkbenchTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.id === id);
}
