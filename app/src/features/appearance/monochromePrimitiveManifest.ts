export const MONOCHROME_PRIMITIVE_SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';

export type MonochromePrimitiveState =
  | 'default'
  | 'hover'
  | 'active'
  | 'focus-visible'
  | 'disabled'
  | 'validation-error'
  | 'checked'
  | 'selected'
  | 'open'
  | 'loading'
  | 'destructive'
  | 'keyboard'
  | 'screen-reader';

export interface MonochromeSharedPrimitive {
  readonly id: string;
  readonly sourcePath: string;
  readonly testPaths: readonly string[];
  readonly owner: 'shared-ui:MC4';
  readonly states: readonly MonochromePrimitiveState[];
  readonly semanticTokens: boolean;
  readonly hardCodedUtilityDebt: boolean;
  readonly intendedFix: string;
}

export interface MonochromeFeatureSource {
  readonly path: string;
  readonly owner: string;
}

export interface MonochromeFeatureControlGroup {
  readonly category: string;
  readonly discoveryPredicate: string;
  readonly writeDisposition: 'review-amend-before-edit';
  readonly sources: readonly MonochromeFeatureSource[];
}

export interface MonochromePrimitiveManifest {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly captureMode: 'retroactive-source-freeze';
  readonly ownedPaths: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly fixtureHashes: Readonly<Record<string, string>>;
  readonly consumerTasks: readonly string[];
  readonly validatorCommand: string;
  readonly sharedPrimitives: readonly MonochromeSharedPrimitive[];
  readonly featureLocalControls: readonly MonochromeFeatureControlGroup[];
}

const TEST_PATH = 'app/src/features/appearance/monochromePrimitiveManifest.test.ts';
const OWNED_PATHS = Object.freeze([
  'app/src/features/appearance/monochromePrimitiveManifest.test.ts',
  'app/src/features/appearance/monochromePrimitiveManifest.ts',
]);
const FIXTURE_IDS = Object.freeze(['chat', 'settings-appearance', 'terminal-workbench']);
const FIXTURE_HASHES = Object.freeze({
  chat: 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9',
  'settings-appearance': '1531421802e9d827e011047c410dd29c6d7c459c03f2bdb9ad91154f8c5ab875',
  'terminal-workbench': 'd27d7b59bed7386b11335a93d8827deb13d251d6de216c3b5bb84bee9ba8bc2b',
});
const CONSUMER_TASKS = Object.freeze(['MC4', 'MC6']);
const VALIDATOR_COMMAND =
  'npm --prefix app test -- src/features/appearance/monochromePrimitiveManifest.test.ts';

function shared(
  id: string,
  sourcePath: string,
  states: readonly MonochromePrimitiveState[],
  hardCodedUtilityDebt: boolean,
  intendedFix: string,
): MonochromeSharedPrimitive {
  return Object.freeze({
    id,
    sourcePath,
    testPaths: Object.freeze([TEST_PATH]),
    owner: 'shared-ui:MC4',
    states: Object.freeze(states),
    semanticTokens: true,
    hardCodedUtilityDebt,
    intendedFix,
  });
}

function ownerFor(sourcePath: string): string {
  const featureMatch = /^app\/src\/features\/([^/]+)\//u.exec(sourcePath);
  if (featureMatch) return `feature:${featureMatch[1]}`;
  if (sourcePath.startsWith('app/src/components/layout/')) return 'feature:shell';
  if (sourcePath.startsWith('app/src/components/ai/')) return 'feature:components-ai';
  return 'feature:unclassified';
}

function featureSource(path: string): MonochromeFeatureSource {
  return Object.freeze({ path, owner: ownerFor(path) });
}

const FEATURE_DISCOVERY_PREDICATES: Readonly<Record<string, string>> = Object.freeze({
  AlertDialog: 'TSX source contains an explicit role="alertdialog" control',
  Command:
    'non-test TSX source imports cmdk or is the custom TerminalCommandPalette implementation',
  ContextMenu:
    'non-test TSX source basename ends with ContextMenu.tsx or declares an explicit role="menu" surface',
  Dropdown:
    'non-test TSX source implements the AgentPicker popover dropdown or jarvis-slash-dropdown',
  Progress: 'TSX source contains an explicit role="progressbar" control',
  Radio: 'TSX source contains an input with type="radio"',
  Resizable:
    'non-test TSX source exposes a resize separator, selected-object handles, or Resize control',
  ScrollArea:
    'non-test TSX source contains an overflow-auto or overflow-scroll utility on a rendered surface',
  Select: 'TSX source contains a native select element',
  Slider: 'TSX source contains a range input or explicit slider role',
  Table: 'TSX source contains a native table element',
});

function group(category: string, sourcePaths: readonly string[]): MonochromeFeatureControlGroup {
  return Object.freeze({
    category,
    discoveryPredicate: FEATURE_DISCOVERY_PREDICATES[category] ?? '',
    writeDisposition: 'review-amend-before-edit',
    sources: Object.freeze(sourcePaths.map(featureSource)),
  });
}

export const MONOCHROME_PRIMITIVE_MANIFEST: MonochromePrimitiveManifest = Object.freeze({
  schemaVersion: 1,
  sourceCommit: MONOCHROME_PRIMITIVE_SOURCE_COMMIT,
  captureMode: 'retroactive-source-freeze',
  ownedPaths: OWNED_PATHS,
  fixtureIds: FIXTURE_IDS,
  fixtureHashes: FIXTURE_HASHES,
  consumerTasks: CONSUMER_TASKS,
  validatorCommand: VALIDATOR_COMMAND,
  sharedPrimitives: Object.freeze([
    shared(
      'Avatar',
      'app/src/components/ui/avatar.tsx',
      ['default', 'loading', 'screen-reader'],
      true,
      'Preserve avatar geometry while removing MonoChrome gradient debt.',
    ),
    shared(
      'Badge',
      'app/src/components/ui/badge.tsx',
      ['default', 'selected', 'destructive', 'screen-reader'],
      true,
      'Use flat semantic state colors and restrained MonoChrome geometry.',
    ),
    shared(
      'Button',
      'app/src/components/ui/button.tsx',
      [
        'default',
        'hover',
        'active',
        'focus-visible',
        'disabled',
        'loading',
        'destructive',
        'keyboard',
      ],
      true,
      'Use flat semantic surfaces, visible focus, and stable target sizing.',
    ),
    shared(
      'Card',
      'app/src/components/ui/card.tsx',
      ['default', 'selected'],
      true,
      'Apply compact radius, neutral border, and minimal elevation tokens.',
    ),
    shared(
      'Checkbox',
      'app/src/components/ui/checkbox.tsx',
      ['default', 'hover', 'focus-visible', 'disabled', 'checked', 'keyboard', 'screen-reader'],
      true,
      'Replace checked gradients while preserving Radix state semantics.',
    ),
    shared(
      'Dialog',
      'app/src/components/ui/dialog.tsx',
      ['default', 'open', 'focus-visible', 'keyboard', 'screen-reader'],
      true,
      'Remove blur and large shadow under MonoChrome without changing dialog behavior.',
    ),
    shared(
      'Input',
      'app/src/components/ui/input.tsx',
      ['default', 'hover', 'focus-visible', 'disabled', 'validation-error', 'screen-reader'],
      false,
      'Retain semantic input tokens while enforcing compact MonoChrome geometry.',
    ),
    shared(
      'Label',
      'app/src/components/ui/label.tsx',
      ['default', 'disabled', 'screen-reader'],
      false,
      'Preserve label semantics and map typography to the compact sans role.',
    ),
    shared(
      'Popover',
      'app/src/components/ui/popover.tsx',
      ['default', 'open', 'focus-visible', 'keyboard', 'screen-reader'],
      true,
      'Flatten elevation and radius without changing Radix open-state behavior.',
    ),
    shared(
      'Separator',
      'app/src/components/ui/separator.tsx',
      ['default', 'screen-reader'],
      false,
      'Keep the existing one-pixel semantic separator contract.',
    ),
    shared(
      'Skeleton',
      'app/src/components/ui/skeleton.tsx',
      ['loading', 'screen-reader'],
      false,
      'Use restrained reduced-motion loading presentation.',
    ),
    shared(
      'Switch',
      'app/src/components/ui/switch.tsx',
      ['default', 'hover', 'focus-visible', 'disabled', 'checked', 'keyboard', 'screen-reader'],
      true,
      'Preserve switch geometry exception while removing excess elevation.',
    ),
    shared(
      'Tabs',
      'app/src/components/ui/tabs.tsx',
      [
        'default',
        'hover',
        'active',
        'focus-visible',
        'disabled',
        'selected',
        'keyboard',
        'screen-reader',
      ],
      true,
      'Use flat selected state and compact tab geometry.',
    ),
    shared(
      'Textarea',
      'app/src/components/ui/textarea.tsx',
      ['default', 'hover', 'focus-visible', 'disabled', 'validation-error', 'screen-reader'],
      false,
      'Retain semantic textarea tokens and compact focus treatment.',
    ),
    shared(
      'Toast',
      'app/src/components/ui/toast.tsx',
      ['default', 'open', 'destructive', 'keyboard', 'screen-reader'],
      true,
      'Bound motion and elevation while retaining dismiss and live-region behavior.',
    ),
    shared(
      'Tooltip',
      'app/src/components/ui/tooltip.tsx',
      ['default', 'open', 'focus-visible', 'keyboard', 'screen-reader'],
      true,
      'Use rectangular minimal-elevation presentation without altering accessible triggers.',
    ),
  ]),
  featureLocalControls: Object.freeze([
    group('AlertDialog', ['app/src/features/pets/PetMiniPanel.tsx']),
    group('Command', [
      'app/src/features/chat/MentionTypeahead.tsx',
      'app/src/features/command-palette/CommandPalette.tsx',
      'app/src/features/command-palette/pages.tsx',
      'app/src/features/terminals/TerminalCommandPalette.tsx',
    ]),
    group('ContextMenu', [
      'app/src/components/layout/Inspector.tsx',
      'app/src/components/layout/JarvisContextMenu.tsx',
      'app/src/components/layout/TabStrip.tsx',
      'app/src/components/layout/TopBar.tsx',
      'app/src/features/pets/PetOverlay.tsx',
      'app/src/features/terminals/TerminalContextMenu.tsx',
      'app/src/features/workbench/WorkbenchContextMenu.tsx',
    ]),
    group('Dropdown', [
      'app/src/features/agents/AgentPicker.tsx',
      'app/src/features/chat/ModelPickerTypeahead.tsx',
      'app/src/features/chat/SlashCommandOptionPicker.tsx',
      'app/src/features/chat/SlashCommandTypeahead.tsx',
    ]),
    group('Progress', [
      'app/src/features/account/AccountPage.tsx',
      'app/src/features/jarvis-runs/JarvisTaskProgressCard.tsx',
      'app/src/features/settings/sections/AllAboutMe.tsx',
    ]),
    group('Radio', ['app/src/features/settings/sections/AllAboutMe.tsx']),
    group('Resizable', [
      'app/src/features/canvas/CanvasPage.tsx',
      'app/src/features/pets/PetMiniPanel.tsx',
      'app/src/features/terminals/TileGrid.tsx',
    ]),
    group('ScrollArea', [
      'app/src/components/ErrorBoundary.tsx',
      'app/src/components/layout/ActivityStrip.tsx',
      'app/src/components/layout/AppShell.tsx',
      'app/src/components/layout/Inspector.tsx',
      'app/src/components/layout/NavPane.tsx',
      'app/src/components/layout/TabStrip.tsx',
      'app/src/features/account/AccountPage.tsx',
      'app/src/features/actions/ActionsPalette.tsx',
      'app/src/features/agents/AgentDetail.tsx',
      'app/src/features/agents/AgentManager.tsx',
      'app/src/features/agents/AgentPicker.tsx',
      'app/src/features/auth/RequireModelAccess.tsx',
      'app/src/features/benchmarks/BenchmarksPage.tsx',
      'app/src/features/call/CallModal.tsx',
      'app/src/features/canvas/CanvasPage.tsx',
      'app/src/features/chat/ChatThread.tsx',
      'app/src/features/chat/ContextInspectorCard.tsx',
      'app/src/features/chat/MentionTypeahead.tsx',
      'app/src/features/chat/ModelPickerTypeahead.tsx',
      'app/src/features/chat/SlashCommandOptionPicker.tsx',
      'app/src/features/chat/SlashCommandTypeahead.tsx',
      'app/src/features/chat/ToolCallCard.tsx',
      'app/src/features/chat/activity/ChatActivityTimeline.tsx',
      'app/src/features/command-palette/CommandPalette.tsx',
      'app/src/features/context/ContextPage.tsx',
      'app/src/features/council/AgentPanel.tsx',
      'app/src/features/dev-console/DevConsolePanel.tsx',
      'app/src/features/files/FileExplorerDialog.tsx',
      'app/src/features/files/FilesPage.tsx',
      'app/src/features/history/HistoryList.tsx',
      'app/src/features/history/Replay.tsx',
      'app/src/features/kanban/KanbanPage.tsx',
      'app/src/features/launcher/LauncherDialog.tsx',
      'app/src/features/news/NewsPanel.tsx',
      'app/src/features/onboarding/steps/Demo.tsx',
      'app/src/features/onboarding/steps/Permissions.tsx',
      'app/src/features/onboarding/steps/Persona.tsx',
      'app/src/features/onboarding/steps/Providers.tsx',
      'app/src/features/onboarding/steps/WhatsNew.tsx',
      'app/src/features/pets/PetMiniPanel.tsx',
      'app/src/features/pets/PetVoiceSurface.tsx',
      'app/src/features/projects/ProjectDetail.tsx',
      'app/src/features/prompt-forge/PromptForgeReview.tsx',
      'app/src/features/schedule/SchedulePage.tsx',
      'app/src/features/settings/SettingsModal.tsx',
      'app/src/features/settings/sections/AllAboutMe.tsx',
      'app/src/features/skills/SkillDetail.tsx',
      'app/src/features/skills/SkillEditor.tsx',
      'app/src/features/skills/SkillsPage.tsx',
      'app/src/features/terminals/AgentRolePicker.tsx',
      'app/src/features/terminals/ConnectedFilesButton.tsx',
      'app/src/features/terminals/TerminalCommandPalette.tsx',
      'app/src/features/tools/ToolsPage.tsx',
      'app/src/features/voice/JarvisVoiceTranscript.tsx',
      'app/src/features/voice/VoiceCaption.tsx',
      'app/src/features/whats-new/WhatsNewModal.tsx',
    ]),
    group('Select', [
      'app/src/components/ai/ProviderModelSelect.tsx',
      'app/src/features/agents/AgentManager.tsx',
      'app/src/features/benchmarks/BenchmarksPage.tsx',
      'app/src/features/browser/BrowserPage.tsx',
      'app/src/features/canvas/CanvasPage.tsx',
      'app/src/features/context/ContextPage.tsx',
      'app/src/features/files/FileExplorerDialog.tsx',
      'app/src/features/history/Replay.tsx',
      'app/src/features/launcher/LinkEditDialog.tsx',
      'app/src/features/preview/PreviewStudio.tsx',
      'app/src/features/schedule/SchedulePage.tsx',
      'app/src/features/settings/sections/AllAboutMe.tsx',
      'app/src/features/tools/ToolsPage.tsx',
      'app/src/features/workbench/DevicePreviewPanel.tsx',
      'app/src/features/workbench/EditorPanel.tsx',
      'app/src/features/workbench/JarvisPanel.tsx',
      'app/src/features/workbench/WallpaperPicker.tsx',
      'app/src/features/workbench/WorkbenchSaveControls.tsx',
    ]),
    group('Slider', [
      'app/src/features/agents/AgentManager.tsx',
      'app/src/features/history/Replay.tsx',
      'app/src/features/launcher/LinkEditDialog.tsx',
      'app/src/features/projects/ProjectDetail.tsx',
      'app/src/features/settings/sections/Ambient.tsx',
      'app/src/features/settings/sections/Appearance.tsx',
      'app/src/features/settings/sections/Voice.tsx',
      'app/src/features/skills/SkillEditor.tsx',
      'app/src/features/workbench/WallpaperPicker.tsx',
    ]),
    group('Table', [
      'app/src/features/benchmarks/BenchmarksPage.tsx',
      'app/src/features/settings/sections/Hotkeys.tsx',
    ]),
  ]),
});

const REQUIRED_FEATURE_CATEGORIES = [
  'AlertDialog',
  'Command',
  'ContextMenu',
  'Dropdown',
  'Progress',
  'Radio',
  'Resizable',
  'ScrollArea',
  'Select',
  'Slider',
  'Table',
] as const;

export function validateMonochromePrimitiveManifest(
  manifest: MonochromePrimitiveManifest,
  pathsAtSourceCommit: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('unsupported primitive schema version');
  if (manifest.sourceCommit !== MONOCHROME_PRIMITIVE_SOURCE_COMMIT) {
    errors.push('primitive source commit drift');
  }
  if (manifest.captureMode !== 'retroactive-source-freeze') {
    errors.push('primitive capture mode drift');
  }
  if (JSON.stringify(manifest.ownedPaths) !== JSON.stringify(OWNED_PATHS)) {
    errors.push('primitive owned path metadata drift');
  }
  if (JSON.stringify(manifest.fixtureIds) !== JSON.stringify(FIXTURE_IDS)) {
    errors.push('primitive fixture id metadata drift');
  }
  if (JSON.stringify(manifest.fixtureHashes) !== JSON.stringify(FIXTURE_HASHES)) {
    errors.push('primitive fixture hash metadata drift');
  }
  if (JSON.stringify(manifest.consumerTasks) !== JSON.stringify(CONSUMER_TASKS)) {
    errors.push('primitive consumer task metadata drift');
  }
  if (manifest.validatorCommand !== VALIDATOR_COMMAND) {
    errors.push('primitive validator command metadata drift');
  }
  const ids = manifest.sharedPrimitives.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate primitive id');
  if (JSON.stringify(ids) !== JSON.stringify([...ids].sort())) {
    errors.push('primitive ids are not in stable order');
  }

  const sourceOwners = new Map<string, string>();
  for (const entry of manifest.sharedPrimitives) {
    const priorOwner = sourceOwners.get(entry.sourcePath);
    if (priorOwner && priorOwner !== entry.owner) {
      errors.push(`duplicate owner or overlapping lane: ${entry.sourcePath}`);
    } else if (priorOwner) {
      errors.push(`duplicate primitive source path: ${entry.sourcePath}`);
    }
    sourceOwners.set(entry.sourcePath, entry.owner);
    if (!pathsAtSourceCommit.has(entry.sourcePath))
      errors.push(`absent source path: ${entry.sourcePath}`);
  }

  const categories = manifest.featureLocalControls.map((group) => group.category);
  if (JSON.stringify(categories) !== JSON.stringify(REQUIRED_FEATURE_CATEGORIES)) {
    errors.push('feature-local category closure mismatch');
  }
  for (const controlGroup of manifest.featureLocalControls) {
    if (!controlGroup.discoveryPredicate) {
      errors.push(`feature-local discovery predicate missing: ${controlGroup.category}`);
    }
    if (controlGroup.writeDisposition !== 'review-amend-before-edit') {
      errors.push(`feature-local lane assigned without review: ${controlGroup.category}`);
    }
    const sourcePaths = controlGroup.sources.map((source) => source.path);
    if (JSON.stringify(sourcePaths) !== JSON.stringify([...sourcePaths].sort())) {
      errors.push(`feature-local sources are not in stable order: ${controlGroup.category}`);
    }
    for (const source of controlGroup.sources) {
      if (!source.owner.startsWith('feature:'))
        errors.push(`feature owner missing: ${source.path}`);
      if (!pathsAtSourceCommit.has(source.path))
        errors.push(`absent feature-local path: ${source.path}`);
      if (sourceOwners.has(source.path))
        errors.push(`overlapping shared/feature lane: ${source.path}`);
    }
  }
  return errors;
}
