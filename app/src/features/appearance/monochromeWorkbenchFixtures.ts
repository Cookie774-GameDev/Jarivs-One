export const MONOCHROME_WORKBENCH_FIXTURE_ID = 'monochrome-development-workbench-v1';

export const MONOCHROME_WORKBENCH_SURFACE_IDS = [
  'top-bar',
  'icon-rail',
  'sidebar',
  'section-label',
  'metrics',
  'chart',
  'table',
  'pricing',
  'numbered-setup',
  'form',
  'control-states',
  'tabs',
  'badges',
  'tooltip',
  'dropdown',
  'dialog',
  'toast',
  'empty-state',
  'jarvis',
  'prompt-forge',
  'context-inspector',
  'terminal-tab',
  'canvas-toolbar',
  'access-panel',
] as const;

export type MonochromeWorkbenchSurfaceId = (typeof MONOCHROME_WORKBENCH_SURFACE_IDS)[number];

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const fixtures = {
  fixtureId: MONOCHROME_WORKBENCH_FIXTURE_ID,
  fixtureOrigin: 'synthetic',
  networkRequests: 0,
  containsUserData: false,
  generatedAt: '2026-07-16T22:06:32.000Z',
  workspace: {
    name: 'VECTOR LAB / 04',
    branch: 'fixture/monochrome',
    runtime: 'LOCAL',
  },
  navigation: ['Overview', 'Runs', 'Contexts', 'Artifacts'],
  metrics: [
    { label: 'ACTIVE RUNS', value: '08', delta: '+2', tone: 'teal' },
    { label: 'CONTEXT USED', value: '64%', delta: '12.8k', tone: 'purple' },
    { label: 'P95 LATENCY', value: '842ms', delta: '-9%', tone: 'amber' },
  ],
  chartSegments: [18, 32, 24, 48, 41, 66, 57, 82, 72, 91, 76, 88],
  activityRows: [
    { id: 'RUN-184', agent: 'Atlas', task: 'Index source graph', status: 'Running', time: '00:42' },
    { id: 'RUN-183', agent: 'Mica', task: 'Verify access policy', status: 'Ready', time: '01:18' },
    { id: 'RUN-182', agent: 'Kite', task: 'Package fixture set', status: 'Review', time: '02:04' },
  ],
  plans: [
    { name: 'Local', price: '$0', detail: 'Deterministic workstation runs' },
    { name: 'Studio', price: '$24', detail: 'Shared synthetic workspaces' },
  ],
  setupSteps: [
    { number: '01', label: 'Select runtime', detail: 'Use the isolated local adapter.' },
    { number: '02', label: 'Attach context', detail: 'Choose fixture-safe repository slices.' },
    { number: '03', label: 'Run verification', detail: 'Capture repeatable state evidence.' },
  ],
  prompt: {
    title: 'Release readiness pass',
    body: 'Inspect the synthetic workspace and report deterministic blockers.',
  },
  contexts: [
    { label: 'Repository map', tokens: '4.2k' },
    { label: 'Acceptance contract', tokens: '2.8k' },
    { label: 'Fixture transcript', tokens: '1.1k' },
  ],
  terminalLines: [
    '$ verify --fixture monochrome',
    '✓ 16 primitives mapped',
    '✓ network access disabled',
    'ready / deterministic',
  ],
  jarvisMessages: [
    { role: 'operator', text: 'Status of the fixture lane?' },
    { role: 'jarvis', text: 'All inputs are synthetic. Two checks remain.' },
  ],
} as const;

export const MONOCHROME_WORKBENCH_FIXTURES = deepFreeze(fixtures);

export function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (child) => !child || typeof child !== 'object' || isDeepFrozen(child),
  );
}
