import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as shellAuthority from './shell-overlay-manifest.ts';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const EXPECTED_SURFACES = [
  ['actions-palette-host', 'overlay', 'app/src/features/actions/ActionsPalette.tsx', 'chat'],
  ['activity-strip', 'shell', 'app/src/components/layout/ActivityStrip.tsx', 'chat'],
  ['ambient-home', 'overlay', 'app/src/features/ambient/AmbientHome.tsx', 'chat'],
  ['api-key-save-burst', 'overlay', 'app/src/features/settings/ApiKeySaveBurst.tsx', 'chat'],
  ['app-dispatch', 'dispatch', 'app/src/App.tsx', 'chat'],
  ['app-shell', 'shell', 'app/src/components/layout/AppShell.tsx', 'chat'],
  ['assistant-bar-host', 'overlay', 'app/src/features/assistant/AssistantBar.tsx', 'chat'],
  ['call-modal', 'overlay', 'app/src/features/call/CallModal.tsx', 'chat'],
  ['celebration-host', 'overlay', 'app/src/features/celebrate/index.ts', 'chat'],
  [
    'command-palette-host',
    'overlay',
    'app/src/features/command-palette/CommandPalette.tsx',
    'chat',
  ],
  ['file-explorer-host', 'overlay', 'app/src/features/files/FileExplorerDialog.tsx', 'chat'],
  [
    'global-dictation-overlay',
    'overlay',
    'app/src/features/global-dictation/GlobalDictationOverlay.tsx',
    'chat',
  ],
  ['inspector', 'shell', 'app/src/components/layout/Inspector.tsx', 'chat'],
  ['jarvis-context-menu', 'overlay', 'app/src/components/layout/JarvisContextMenu.tsx', 'chat'],
  ['launcher-dialog-host', 'overlay', 'app/src/features/launcher/LauncherDialog.tsx', 'chat'],
  ['nav-pane', 'shell', 'app/src/components/layout/NavPane.tsx', 'chat'],
  ['news-host', 'overlay', 'app/src/features/news/NewsHost.tsx', 'chat'],
  ['page-router', 'shell', 'app/src/components/layout/PageRouter.tsx', 'chat'],
  ['pet-host', 'overlay', 'app/src/features/pets/PetHost.tsx', 'chat'],
  ['pet-mini-panel-window', 'overlay', 'app/src/features/pets/PetMiniPanelWindow.tsx', 'chat'],
  ['pet-overlay-window', 'overlay', 'app/src/features/pets/PetOverlayWindow.tsx', 'chat'],
  [
    'product-tutorial-host',
    'overlay',
    'app/src/features/product-tutorial/ProductTutorialHost.tsx',
    'chat',
  ],
  [
    'settings-modal-host',
    'overlay',
    'app/src/features/settings/SettingsModal.tsx',
    'settings-appearance',
  ],
  ['tab-strip', 'shell', 'app/src/components/layout/TabStrip.tsx', 'chat'],
  ['toaster', 'overlay', 'app/src/components/ui/toast.tsx', 'chat'],
  ['top-bar', 'shell', 'app/src/components/layout/TopBar.tsx', 'chat'],
  ['update-warning-host', 'overlay', 'app/src/features/updates/UpdateWarningHost.tsx', 'chat'],
  ['voice-modal-host', 'overlay', 'app/src/features/voice/VoiceModal.tsx', 'chat'],
  ['wellness-break', 'overlay', 'app/src/features/wellness/WellnessBreak.tsx', 'chat'],
  ['whats-new-host', 'overlay', 'app/src/features/whats-new/WhatsNewHost.tsx', 'chat'],
  [
    'workbench-window-dispatch',
    'dispatch',
    'app/src/features/workbench/window.ts',
    'terminal-workbench',
  ],
] as const;

const EXPECTED_APP_ROOT_SIBLINGS = [
  [
    'ActionsPaletteHost',
    'surface',
    'actions-palette-host',
    'app/src/features/actions/ActionsPalette.tsx',
  ],
  ['AmbientAudioHost', 'reviewed-nonvisual', null, 'app/src/features/ambient/AmbientAudioHost.tsx'],
  ['AmbientHome', 'surface', 'ambient-home', 'app/src/features/ambient/AmbientHome.tsx'],
  [
    'ApiKeySaveBurst',
    'surface',
    'api-key-save-burst',
    'app/src/features/settings/ApiKeySaveBurst.tsx',
  ],
  [
    'AssistantBarHost',
    'surface',
    'assistant-bar-host',
    'app/src/features/assistant/AssistantBar.tsx',
  ],
  ['CallModal', 'surface', 'call-modal', 'app/src/features/call/CallModal.tsx'],
  ['CelebrationHost', 'surface', 'celebration-host', 'app/src/features/celebrate/index.ts'],
  [
    'CommandPaletteHost',
    'surface',
    'command-palette-host',
    'app/src/features/command-palette/CommandPalette.tsx',
  ],
  [
    'FileExplorerHost',
    'surface',
    'file-explorer-host',
    'app/src/features/files/FileExplorerDialog.tsx',
  ],
  ['GlobalHotkeysHost', 'reviewed-nonvisual', null, 'app/src/App.tsx'],
  ['GlobalSttHost', 'reviewed-nonvisual', null, 'app/src/features/composer-stt/GlobalSttHost.tsx'],
  [
    'JarvisContextMenu',
    'surface',
    'jarvis-context-menu',
    'app/src/components/layout/JarvisContextMenu.tsx',
  ],
  ['KernelSmokeReconstructedLiveEvidenceHost', 'reviewed-nonvisual', null, 'app/src/App.tsx'],
  [
    'LauncherDialogHost',
    'surface',
    'launcher-dialog-host',
    'app/src/features/launcher/LauncherDialog.tsx',
  ],
  ['NewsHost', 'surface', 'news-host', 'app/src/features/news/NewsHost.tsx'],
  ['PetHost', 'surface', 'pet-host', 'app/src/features/pets/PetHost.tsx'],
  [
    'ProductTutorialHost',
    'surface',
    'product-tutorial-host',
    'app/src/features/product-tutorial/ProductTutorialHost.tsx',
  ],
  [
    'SettingsModalHost',
    'surface',
    'settings-modal-host',
    'app/src/features/settings/SettingsModal.tsx',
  ],
  ['Toaster', 'surface', 'toaster', 'app/src/components/ui/toast.tsx'],
  [
    'UpdateWarningHost',
    'surface',
    'update-warning-host',
    'app/src/features/updates/UpdateWarningHost.tsx',
  ],
  ['VoiceModalHost', 'surface', 'voice-modal-host', 'app/src/features/voice/VoiceModal.tsx'],
  ['VoiceModuleLifecycle', 'reviewed-nonvisual', null, 'app/src/App.tsx'],
  ['WakeWordHost', 'reviewed-nonvisual', null, 'app/src/features/voice/WakeWordHost.tsx'],
  ['WellnessBreak', 'surface', 'wellness-break', 'app/src/features/wellness/WellnessBreak.tsx'],
  ['WhatsNewHost', 'surface', 'whats-new-host', 'app/src/features/whats-new/WhatsNewHost.tsx'],
] as const;

const EXPECTED_DETACHED_VIEWS = [
  ['dictation', '?view=dictation', 'global-dictation-overlay'],
  ['pet-mini-panel', '?view=pet-mini-panel', 'pet-mini-panel-window'],
  ['pet-overlay', '?view=pet-overlay', 'pet-overlay-window'],
  ['workbench-main', '?workbench=1', 'workbench-window-dispatch'],
] as const;

function sourceAtCommit(relativePath: string): string {
  return execFileSync('git', ['show', `${SOURCE_COMMIT}:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function discoverAppRootSiblingComponents(): string[] {
  const source = sourceAtCommit('app/src/App.tsx');
  const workspaceStart = source.indexOf('function WorkspaceRoot()');
  const providerStart = source.indexOf('<JarvisCommandCenterProvider', workspaceStart);
  const providerEnd = source.indexOf('</JarvisCommandCenterProvider>', providerStart);
  assert.ok(workspaceStart >= 0 && providerStart >= 0 && providerEnd > providerStart);
  const providerBody = source.slice(providerStart, providerEnd);
  const shellStart = providerBody.indexOf('<AppShell>');
  const shellEnd = providerBody.indexOf('</AppShell>', shellStart);
  assert.ok(shellStart >= 0 && shellEnd > shellStart);
  const withoutShellChildren =
    providerBody.slice(0, shellStart) +
    '<AppShell />' +
    providerBody.slice(shellEnd + '</AppShell>'.length);
  return [
    ...new Set(
      [...withoutShellChildren.matchAll(/<([A-Z][A-Za-z0-9.]*)\b/gu)]
        .map((match) => match[1])
        .filter(
          (component) =>
            !['AppShell', 'JarvisCommandCenterProvider', 'React.Suspense'].includes(component),
        ),
    ),
  ].sort();
}

test('the source-derived shell and overlay authority exists before MC6 runs', () => {
  const manifestPath = fileURLToPath(new URL('./shell-overlay-manifest.ts', import.meta.url));
  assert.equal(existsSync(manifestPath), true, 'missing shell and overlay manifest');
});

test('AppShell visual siblings resolve to concrete surfaces or reviewed nonvisual exclusions', () => {
  const manifest = shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST;
  assert.equal(Array.isArray(manifest.appRootSiblings), true, 'missing app root sibling closure');
  if (!Array.isArray(manifest.appRootSiblings)) return;

  assert.deepEqual(
    manifest.appRootSiblings.map(({ component, disposition, surfaceId, sourcePath }) => [
      component,
      disposition,
      surfaceId,
      sourcePath,
    ]),
    EXPECTED_APP_ROOT_SIBLINGS,
  );
  assert.deepEqual(
    manifest.appRootSiblings.map((entry) => entry.component),
    discoverAppRootSiblingComponents(),
  );

  const surfacesById = new Map(manifest.surfaces.map((surface) => [surface.id, surface]));
  for (const sibling of manifest.appRootSiblings) {
    assert.doesNotThrow(() => sourceAtCommit(sibling.sourcePath), sibling.sourcePath);
    if (sibling.disposition === 'surface') {
      assert.ok(sibling.surfaceId, sibling.component);
      assert.equal(surfacesById.get(sibling.surfaceId)?.sourcePath, sibling.sourcePath);
    } else {
      assert.equal(sibling.surfaceId, null);
      assert.ok(sibling.reviewNote.length > 8, sibling.component);
    }
  }
});

test('shell authority freezes all shell, overlay, and dispatch surfaces in stable order', () => {
  const manifest = shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST as Record<string, unknown>;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.captureMode, 'retroactive-source-freeze');
  assert.deepEqual(
    (
      manifest.surfaces as Array<{
        id: string;
        kind: string;
        sourcePath: string;
        fixtureId: string;
      }>
    ).map(({ id, kind, sourcePath, fixtureId }) => [id, kind, sourcePath, fixtureId]),
    EXPECTED_SURFACES,
  );
  assert.deepEqual(manifest.consumerTasks, ['MC6', 'MC9']);
  assert.equal(
    manifest.validatorCommand,
    'node --test tests/visual/monochrome/shell-overlay-manifest.test.ts',
  );
});

test('detached view inventory closes over App and workbench query dispatch', () => {
  assert.equal(
    Array.isArray(shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST.detachedViews),
    true,
    'missing detached view entries',
  );
  if (!Array.isArray(shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST.detachedViews)) return;

  assert.deepEqual(
    shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST.detachedViews.map(
      ({ id, query, surfaceId }) => [id, query, surfaceId],
    ),
    EXPECTED_DETACHED_VIEWS,
  );
  const appSource = sourceAtCommit('app/src/App.tsx');
  for (const view of ['dictation', 'pet-mini-panel', 'pet-overlay']) {
    assert.match(appSource, new RegExp(`view === '${view}'`, 'u'));
  }
  const workbenchSource = sourceAtCommit('app/src/features/workbench/window.ts');
  assert.match(workbenchSource, /workbench.*===\s*'1'/u);
});

test('surface sources and shell composition tokens exist at the frozen commit', () => {
  assert.equal(
    Array.isArray(shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST.surfaces),
    true,
    'missing shell surface entries',
  );
  if (!Array.isArray(shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST.surfaces)) return;

  for (const surface of shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST.surfaces) {
    assert.doesNotThrow(() => sourceAtCommit(surface.sourcePath), surface.sourcePath);
    assert.match(surface.owner, /^(shell|overlay|dispatch):/u);
  }
  const shellSource = sourceAtCommit('app/src/components/layout/AppShell.tsx');
  for (const token of ['<TopBar', '<NavPane', '<TabStrip', '<Inspector', '<CouncilActivityStrip']) {
    assert.ok(shellSource.includes(token), `AppShell composition token missing: ${token}`);
  }
});

test('shell validator rejects duplicates, missing siblings, missing dispatch targets, and owned-path drift', () => {
  const validate = shellAuthority.validateMonochromeShellOverlayManifest;
  assert.equal(typeof validate, 'function', 'missing shell manifest validator');
  if (typeof validate !== 'function') return;

  const manifest = shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST;
  assert.equal(Array.isArray(manifest.surfaces), true, 'missing shell surface entries');
  assert.equal(Array.isArray(manifest.detachedViews), true, 'missing detached view entries');
  assert.equal(Array.isArray(manifest.appRootSiblings), true, 'missing app root sibling closure');
  if (
    !Array.isArray(manifest.surfaces) ||
    !Array.isArray(manifest.detachedViews) ||
    !Array.isArray(manifest.appRootSiblings)
  )
    return;

  const discoveredAppSiblings = discoverAppRootSiblingComponents();
  assert.deepEqual(validate(manifest, discoveredAppSiblings), []);
  assert.match(
    validate(
      { ...manifest, surfaces: [...manifest.surfaces, manifest.surfaces[0]] },
      discoveredAppSiblings,
    ).join('\n'),
    /duplicate|stable order/iu,
  );
  assert.match(
    validate(
      { ...manifest, appRootSiblings: manifest.appRootSiblings.slice(1) },
      discoveredAppSiblings,
    ).join('\n'),
    /sibling|closure/iu,
  );
  assert.match(
    validate(
      {
        ...manifest,
        surfaces: manifest.surfaces.filter(({ id }) => id !== 'activity-strip'),
      },
      discoveredAppSiblings,
    ).join('\n'),
    /surface closure/iu,
  );
  assert.match(
    validate(
      {
        ...manifest,
        surfaces: manifest.surfaces.map((surface) =>
          surface.id === 'activity-strip' ? { ...surface, sourcePath: '../outside.tsx' } : surface,
        ),
      },
      discoveredAppSiblings,
    ).join('\n'),
    /surface closure|unsafe/iu,
  );
  assert.match(
    validate(
      {
        ...manifest,
        detachedViews: [
          ...manifest.detachedViews,
          { id: 'orphan', query: '?view=orphan', surfaceId: 'absent' },
        ],
      },
      discoveredAppSiblings,
    ).join('\n'),
    /dispatch target/iu,
  );
  assert.match(
    validate(
      { ...manifest, ownedPaths: [...manifest.ownedPaths, 'app/src/App.tsx'] },
      discoveredAppSiblings,
    ).join('\n'),
    /owned path/iu,
  );
});
