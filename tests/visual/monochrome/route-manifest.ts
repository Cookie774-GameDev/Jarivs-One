import { MONOCHROME_SOURCE_COMMIT } from './fixture-manifest.ts';

export interface MonochromeRouteEntry {
  readonly id: string;
  readonly sourcePath: string;
  readonly fixtureId: 'chat' | 'settings-appearance' | 'terminal-workbench';
  readonly owner: string;
}

export interface MonochromeRouteManifest {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly captureMode: 'retroactive-source-freeze';
  readonly ownedPaths: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly fixtureHashes: Readonly<Record<string, string>>;
  readonly consumerTasks: readonly string[];
  readonly validatorCommand: string;
  readonly routes: readonly MonochromeRouteEntry[];
}

const route = (
  id: string,
  sourcePath: string,
  fixtureId: MonochromeRouteEntry['fixtureId'],
): MonochromeRouteEntry => Object.freeze({ id, sourcePath, fixtureId, owner: `route:${id}` });

export const MONOCHROME_ROUTE_MANIFEST: MonochromeRouteManifest = Object.freeze({
  schemaVersion: 1,
  sourceCommit: MONOCHROME_SOURCE_COMMIT,
  captureMode: 'retroactive-source-freeze',
  ownedPaths: Object.freeze([
    'tests/visual/monochrome/route-manifest.test.ts',
    'tests/visual/monochrome/route-manifest.ts',
  ]),
  fixtureIds: Object.freeze(['chat', 'settings-appearance', 'terminal-workbench']),
  fixtureHashes: Object.freeze({
    chat: 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9',
    'settings-appearance': '1531421802e9d827e011047c410dd29c6d7c459c03f2bdb9ad91154f8c5ab875',
    'terminal-workbench': 'd27d7b59bed7386b11335a93d8827deb13d251d6de216c3b5bb84bee9ba8bc2b',
  }),
  consumerTasks: Object.freeze(['MC5', 'MC6', 'MC7']),
  validatorCommand: 'node --test tests/visual/monochrome/route-manifest.test.ts',
  routes: Object.freeze([
    route('account', 'app/src/features/account/index.ts', 'settings-appearance'),
    route('agent-detail', 'app/src/features/agents/index.ts', 'chat'),
    route('agents', 'app/src/features/agents/index.ts', 'chat'),
    route('benchmarks', 'app/src/features/benchmarks/index.ts', 'chat'),
    route('browser', 'app/src/features/browser/index.ts', 'chat'),
    route('canvas', 'app/src/features/canvas/index.ts', 'chat'),
    route('chat', 'app/src/features/chat/index.ts', 'chat'),
    route('context', 'app/src/features/context/index.ts', 'chat'),
    route('files', 'app/src/features/files/index.ts', 'chat'),
    route('history', 'app/src/features/history/index.ts', 'chat'),
    route('kanban', 'app/src/features/kanban/index.ts', 'chat'),
    route('preview', 'app/src/features/preview/index.ts', 'chat'),
    route('project-detail', 'app/src/features/projects/index.ts', 'chat'),
    route('schedule', 'app/src/features/schedule/index.ts', 'chat'),
    route('skills', 'app/src/features/skills/index.ts', 'chat'),
    route('terminal', 'app/src/features/terminals/TerminalsPage.tsx', 'terminal-workbench'),
    route('tools', 'app/src/features/tools/index.ts', 'chat'),
    route('workbench', 'app/src/features/workbench/index.ts', 'terminal-workbench'),
  ]),
});

const OWNED_PATHS = [
  'tests/visual/monochrome/route-manifest.test.ts',
  'tests/visual/monochrome/route-manifest.ts',
] as const;

export function validateMonochromeRouteManifest(manifest: MonochromeRouteManifest): string[] {
  const errors: string[] = [];
  const ids = manifest.routes.map((entry) => entry.id);
  const stableIds = [...ids].sort();
  if (new Set(ids).size !== ids.length) errors.push('duplicate route id');
  if (JSON.stringify(ids) !== JSON.stringify(stableIds))
    errors.push('routes are not in stable order');
  if (manifest.routes.some((entry) => !entry.owner.startsWith('route:'))) {
    errors.push('route owner missing');
  }
  if (JSON.stringify(manifest.ownedPaths) !== JSON.stringify(OWNED_PATHS)) {
    errors.push('owned path overlap or drift');
  }
  return errors;
}
