import { MONOCHROME_SOURCE_COMMIT } from './fixture-manifest.ts';

export type MonochromeShellSurfaceKind = 'shell' | 'overlay' | 'dispatch';
export type MonochromeShellFixtureId = 'chat' | 'settings-appearance' | 'terminal-workbench';

export interface MonochromeShellSurface {
  readonly id: string;
  readonly kind: MonochromeShellSurfaceKind;
  readonly sourcePath: string;
  readonly fixtureId: MonochromeShellFixtureId;
  readonly owner: string;
  readonly testPaths: readonly string[];
}

export interface MonochromeDetachedView {
  readonly id: string;
  readonly query: string;
  readonly surfaceId: string;
}

export type MonochromeAppRootSiblingDisposition = 'surface' | 'reviewed-nonvisual';

export interface MonochromeAppRootSibling {
  readonly component: string;
  readonly disposition: MonochromeAppRootSiblingDisposition;
  readonly surfaceId: string | null;
  readonly sourcePath: string;
  readonly reviewNote: string;
}

export interface MonochromeShellOverlayManifest {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly captureMode: 'retroactive-source-freeze';
  readonly ownedPaths: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly fixtureHashes: Readonly<Record<string, string>>;
  readonly consumerTasks: readonly string[];
  readonly validatorCommand: string;
  readonly surfaces: readonly MonochromeShellSurface[];
  readonly appRootSiblings: readonly MonochromeAppRootSibling[];
  readonly detachedViews: readonly MonochromeDetachedView[];
}

const surface = (
  id: string,
  kind: MonochromeShellSurfaceKind,
  sourcePath: string,
  fixtureId: MonochromeShellFixtureId,
  testPaths: readonly string[] = [],
): MonochromeShellSurface =>
  Object.freeze({
    id,
    kind,
    sourcePath,
    fixtureId,
    owner: `${kind}:${id}`,
    testPaths: Object.freeze(testPaths),
  });

const detachedView = (id: string, query: string, surfaceId: string): MonochromeDetachedView =>
  Object.freeze({ id, query, surfaceId });

const appRootSibling = (
  component: string,
  disposition: MonochromeAppRootSiblingDisposition,
  surfaceId: string | null,
  sourcePath: string,
  reviewNote: string,
): MonochromeAppRootSibling =>
  Object.freeze({ component, disposition, surfaceId, sourcePath, reviewNote });

export const MONOCHROME_SHELL_OVERLAY_MANIFEST: MonochromeShellOverlayManifest = Object.freeze({
  schemaVersion: 1,
  sourceCommit: MONOCHROME_SOURCE_COMMIT,
  captureMode: 'retroactive-source-freeze',
  ownedPaths: Object.freeze([
    'tests/visual/monochrome/shell-overlay-manifest.test.ts',
    'tests/visual/monochrome/shell-overlay-manifest.ts',
  ]),
  fixtureIds: Object.freeze(['chat', 'settings-appearance', 'terminal-workbench']),
  fixtureHashes: Object.freeze({
    chat: 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9',
    'settings-appearance': '1531421802e9d827e011047c410dd29c6d7c459c03f2bdb9ad91154f8c5ab875',
    'terminal-workbench': 'd27d7b59bed7386b11335a93d8827deb13d251d6de216c3b5bb84bee9ba8bc2b',
  }),
  consumerTasks: Object.freeze(['MC6', 'MC9']),
  validatorCommand: 'node --test tests/visual/monochrome/shell-overlay-manifest.test.ts',
  surfaces: Object.freeze([
    surface(
      'actions-palette-host',
      'overlay',
      'app/src/features/actions/ActionsPalette.tsx',
      'chat',
    ),
    surface('activity-strip', 'shell', 'app/src/components/layout/ActivityStrip.tsx', 'chat'),
    surface('ambient-home', 'overlay', 'app/src/features/ambient/AmbientHome.tsx', 'chat'),
    surface(
      'api-key-save-burst',
      'overlay',
      'app/src/features/settings/ApiKeySaveBurst.tsx',
      'chat',
    ),
    surface('app-dispatch', 'dispatch', 'app/src/App.tsx', 'chat'),
    surface('app-shell', 'shell', 'app/src/components/layout/AppShell.tsx', 'chat'),
    surface('assistant-bar-host', 'overlay', 'app/src/features/assistant/AssistantBar.tsx', 'chat'),
    surface('call-modal', 'overlay', 'app/src/features/call/CallModal.tsx', 'chat'),
    surface('celebration-host', 'overlay', 'app/src/features/celebrate/index.ts', 'chat'),
    surface(
      'command-palette-host',
      'overlay',
      'app/src/features/command-palette/CommandPalette.tsx',
      'chat',
    ),
    surface(
      'file-explorer-host',
      'overlay',
      'app/src/features/files/FileExplorerDialog.tsx',
      'chat',
    ),
    surface(
      'global-dictation-overlay',
      'overlay',
      'app/src/features/global-dictation/GlobalDictationOverlay.tsx',
      'chat',
      ['app/src/features/global-dictation/GlobalDictationOverlay.test.tsx'],
    ),
    surface('inspector', 'shell', 'app/src/components/layout/Inspector.tsx', 'chat'),
    surface(
      'jarvis-context-menu',
      'overlay',
      'app/src/components/layout/JarvisContextMenu.tsx',
      'chat',
    ),
    surface(
      'launcher-dialog-host',
      'overlay',
      'app/src/features/launcher/LauncherDialog.tsx',
      'chat',
    ),
    surface('nav-pane', 'shell', 'app/src/components/layout/NavPane.tsx', 'chat'),
    surface('news-host', 'overlay', 'app/src/features/news/NewsHost.tsx', 'chat'),
    surface('page-router', 'shell', 'app/src/components/layout/PageRouter.tsx', 'chat', [
      'app/src/components/layout/PageRouter.canvas.test.tsx',
      'app/src/components/layout/PageRouter.terminals.test.tsx',
      'app/src/components/layout/PageRouter.workbench.test.tsx',
    ]),
    surface('pet-host', 'overlay', 'app/src/features/pets/PetHost.tsx', 'chat'),
    surface(
      'pet-mini-panel-window',
      'overlay',
      'app/src/features/pets/PetMiniPanelWindow.tsx',
      'chat',
    ),
    surface('pet-overlay-window', 'overlay', 'app/src/features/pets/PetOverlayWindow.tsx', 'chat', [
      'app/src/features/pets/PetOverlayWindow.test.tsx',
    ]),
    surface(
      'product-tutorial-host',
      'overlay',
      'app/src/features/product-tutorial/ProductTutorialHost.tsx',
      'chat',
    ),
    surface(
      'settings-modal-host',
      'overlay',
      'app/src/features/settings/SettingsModal.tsx',
      'settings-appearance',
    ),
    surface('tab-strip', 'shell', 'app/src/components/layout/TabStrip.tsx', 'chat'),
    surface('toaster', 'overlay', 'app/src/components/ui/toast.tsx', 'chat'),
    surface('top-bar', 'shell', 'app/src/components/layout/TopBar.tsx', 'chat', [
      'app/src/components/layout/TopBar.voiceSmoke.test.tsx',
    ]),
    surface(
      'update-warning-host',
      'overlay',
      'app/src/features/updates/UpdateWarningHost.tsx',
      'chat',
    ),
    surface('voice-modal-host', 'overlay', 'app/src/features/voice/VoiceModal.tsx', 'chat'),
    surface('wellness-break', 'overlay', 'app/src/features/wellness/WellnessBreak.tsx', 'chat'),
    surface('whats-new-host', 'overlay', 'app/src/features/whats-new/WhatsNewHost.tsx', 'chat'),
    surface(
      'workbench-window-dispatch',
      'dispatch',
      'app/src/features/workbench/window.ts',
      'terminal-workbench',
      ['app/src/features/workbench/window.test.ts'],
    ),
  ]),
  appRootSiblings: Object.freeze([
    appRootSibling(
      'ActionsPaletteHost',
      'surface',
      'actions-palette-host',
      'app/src/features/actions/ActionsPalette.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'AmbientAudioHost',
      'reviewed-nonvisual',
      null,
      'app/src/features/ambient/AmbientAudioHost.tsx',
      'Reviewed headless lifecycle host; it returns no rendered DOM.',
    ),
    appRootSibling(
      'AmbientHome',
      'surface',
      'ambient-home',
      'app/src/features/ambient/AmbientHome.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'ApiKeySaveBurst',
      'surface',
      'api-key-save-burst',
      'app/src/features/settings/ApiKeySaveBurst.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'AssistantBarHost',
      'surface',
      'assistant-bar-host',
      'app/src/features/assistant/AssistantBar.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'CallModal',
      'surface',
      'call-modal',
      'app/src/features/call/CallModal.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'CelebrationHost',
      'surface',
      'celebration-host',
      'app/src/features/celebrate/index.ts',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'CommandPaletteHost',
      'surface',
      'command-palette-host',
      'app/src/features/command-palette/CommandPalette.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'FileExplorerHost',
      'surface',
      'file-explorer-host',
      'app/src/features/files/FileExplorerDialog.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'GlobalHotkeysHost',
      'reviewed-nonvisual',
      null,
      'app/src/App.tsx',
      'Reviewed headless keyboard lifecycle host; it returns no rendered DOM.',
    ),
    appRootSibling(
      'GlobalSttHost',
      'reviewed-nonvisual',
      null,
      'app/src/features/composer-stt/GlobalSttHost.tsx',
      'Reviewed headless speech lifecycle host; it returns no rendered DOM.',
    ),
    appRootSibling(
      'JarvisContextMenu',
      'surface',
      'jarvis-context-menu',
      'app/src/components/layout/JarvisContextMenu.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'KernelSmokeReconstructedLiveEvidenceHost',
      'reviewed-nonvisual',
      null,
      'app/src/App.tsx',
      'Reviewed diagnostic host; its output is hidden and not a visual surface.',
    ),
    appRootSibling(
      'LauncherDialogHost',
      'surface',
      'launcher-dialog-host',
      'app/src/features/launcher/LauncherDialog.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'NewsHost',
      'surface',
      'news-host',
      'app/src/features/news/NewsHost.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'PetHost',
      'surface',
      'pet-host',
      'app/src/features/pets/PetHost.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'ProductTutorialHost',
      'surface',
      'product-tutorial-host',
      'app/src/features/product-tutorial/ProductTutorialHost.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'SettingsModalHost',
      'surface',
      'settings-modal-host',
      'app/src/features/settings/SettingsModal.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'Toaster',
      'surface',
      'toaster',
      'app/src/components/ui/toast.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'UpdateWarningHost',
      'surface',
      'update-warning-host',
      'app/src/features/updates/UpdateWarningHost.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'VoiceModalHost',
      'surface',
      'voice-modal-host',
      'app/src/features/voice/VoiceModal.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'VoiceModuleLifecycle',
      'reviewed-nonvisual',
      null,
      'app/src/App.tsx',
      'Reviewed headless voice lifecycle host; it returns no rendered DOM.',
    ),
    appRootSibling(
      'WakeWordHost',
      'reviewed-nonvisual',
      null,
      'app/src/features/voice/WakeWordHost.tsx',
      'Reviewed headless wake-word lifecycle host; it returns no rendered DOM.',
    ),
    appRootSibling(
      'WellnessBreak',
      'surface',
      'wellness-break',
      'app/src/features/wellness/WellnessBreak.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
    appRootSibling(
      'WhatsNewHost',
      'surface',
      'whats-new-host',
      'app/src/features/whats-new/WhatsNewHost.tsx',
      'Rendered visual sibling resolved to its concrete overlay source.',
    ),
  ]),
  detachedViews: Object.freeze([
    detachedView('dictation', '?view=dictation', 'global-dictation-overlay'),
    detachedView('pet-mini-panel', '?view=pet-mini-panel', 'pet-mini-panel-window'),
    detachedView('pet-overlay', '?view=pet-overlay', 'pet-overlay-window'),
    detachedView('workbench-main', '?workbench=1', 'workbench-window-dispatch'),
  ]),
});

const OWNED_PATHS = [
  'tests/visual/monochrome/shell-overlay-manifest.test.ts',
  'tests/visual/monochrome/shell-overlay-manifest.ts',
] as const;

export function validateMonochromeShellOverlayManifest(
  manifest: MonochromeShellOverlayManifest,
  discoveredAppSiblingComponents: readonly string[],
): string[] {
  const errors: string[] = [];
  const surfaceIds = manifest.surfaces.map((entry) => entry.id);
  if (new Set(surfaceIds).size !== surfaceIds.length) {
    errors.push('duplicate shell surface id');
  }
  if (JSON.stringify(surfaceIds) !== JSON.stringify([...surfaceIds].sort())) {
    errors.push('shell surfaces are not in stable order');
  }
  const surfaceSources = manifest.surfaces.map((entry) => entry.sourcePath);
  if (new Set(surfaceSources).size !== surfaceSources.length) {
    errors.push('duplicate shell surface source path');
  }
  const siblingComponents = manifest.appRootSiblings.map((entry) => entry.component);
  if (new Set(siblingComponents).size !== siblingComponents.length) {
    errors.push('duplicate app root sibling');
  }
  if (JSON.stringify(siblingComponents) !== JSON.stringify([...siblingComponents].sort())) {
    errors.push('app root siblings are not in stable order');
  }
  if (
    JSON.stringify(siblingComponents) !== JSON.stringify([...discoveredAppSiblingComponents].sort())
  ) {
    errors.push('app root sibling closure mismatch');
  }
  const knownSurfaceEntries = new Map(manifest.surfaces.map((entry) => [entry.id, entry]));
  for (const sibling of manifest.appRootSiblings) {
    if (sibling.disposition === 'surface') {
      if (
        sibling.surfaceId === null ||
        knownSurfaceEntries.get(sibling.surfaceId)?.sourcePath !== sibling.sourcePath
      ) {
        errors.push(`app root sibling surface mismatch: ${sibling.component}`);
      }
    } else if (sibling.surfaceId !== null || sibling.reviewNote.trim().length < 9) {
      errors.push(`invalid reviewed app root sibling exclusion: ${sibling.component}`);
    }
  }
  const detachedIds = manifest.detachedViews.map((entry) => entry.id);
  if (new Set(detachedIds).size !== detachedIds.length) {
    errors.push('duplicate detached view id');
  }
  if (JSON.stringify(detachedIds) !== JSON.stringify([...detachedIds].sort())) {
    errors.push('detached views are not in stable order');
  }
  const knownSurfaces = new Set(surfaceIds);
  for (const view of manifest.detachedViews) {
    if (!knownSurfaces.has(view.surfaceId)) {
      errors.push(`missing detached dispatch target: ${view.surfaceId}`);
    }
  }
  if (JSON.stringify(manifest.ownedPaths) !== JSON.stringify(OWNED_PATHS)) {
    errors.push('owned path overlap or drift');
  }
  return errors;
}
