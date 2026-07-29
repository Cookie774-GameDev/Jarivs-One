import { existsSync } from 'node:fs';
import path from 'node:path';

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'src/features/appearance/monochromeWorkbenchFixtures.ts',
);

describe('MonoChrome workbench fixtures', () => {
  it('exists as an owned deterministic fixture module', () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
  });

  it('deep-freezes synthetic, account-free fixture data', async () => {
    const fixtureModule = await import('./monochromeWorkbenchFixtures');
    const fixtures = fixtureModule.MONOCHROME_WORKBENCH_FIXTURES;

    expect(fixtures.fixtureOrigin).toBe('synthetic');
    expect(fixtures.networkRequests).toBe(0);
    expect(fixtures.containsUserData).toBe(false);
    expect(fixtureModule.isDeepFrozen(fixtures)).toBe(true);
    expect(() => {
      (fixtures.metrics as unknown as Array<unknown>).push({});
    }).toThrow();
  });

  it('provides stable coverage for every approved workbench surface', async () => {
    const fixtureModule = await import('./monochromeWorkbenchFixtures');

    expect(fixtureModule.MONOCHROME_WORKBENCH_SURFACE_IDS).toEqual([
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
    ]);

    expect(fixtureModule.MONOCHROME_WORKBENCH_FIXTURE_ID).toBe(
      'monochrome-development-workbench-v1',
    );
    expect(fixtureModule.MONOCHROME_WORKBENCH_FIXTURES.metrics).toHaveLength(3);
    expect(fixtureModule.MONOCHROME_WORKBENCH_FIXTURES.activityRows).toHaveLength(3);
  });
});
