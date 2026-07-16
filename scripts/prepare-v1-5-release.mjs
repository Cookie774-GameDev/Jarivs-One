import fs from 'node:fs';

const VERSION = '1.5.0';
const OLD_VERSION = '0.1.48';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content.replace(/\r\n/g, '\n'));
const updateJson = (path, mutate) => {
  const value = JSON.parse(read(path));
  mutate(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
};

updateJson('package.json', (value) => {
  value.version = VERSION;
});
updateJson('app/package.json', (value) => {
  value.version = VERSION;
});
updateJson('package-lock.json', (value) => {
  value.version = VERSION;
  if (value.packages?.['']) value.packages[''].version = VERSION;
  if (value.packages?.app) value.packages.app.version = VERSION;
});
updateJson('app/src-tauri/tauri.conf.json', (value) => {
  value.version = VERSION;
});

let cargo = read('app/src-tauri/Cargo.toml');
cargo = cargo.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+("\s*\n)/,
  `$1${VERSION}$2`,
);
write('app/src-tauri/Cargo.toml', cargo);

let boot = read('scripts/boot-validation.mjs');
boot = boot.replace(
  `const CURRENT_VERSION = '${OLD_VERSION}';`,
  `const CURRENT_VERSION = '${VERSION}';`,
);
write('scripts/boot-validation.mjs', boot);

let releases = read('app/src/features/whats-new/releases.ts');
releases = releases.replace(
  `export const CURRENT_VERSION = '${OLD_VERSION}';`,
  `export const CURRENT_VERSION = '${VERSION}';`,
);
if (!releases.includes("version: '1.5.0'")) {
  const entry = [
    '  {',
    "    version: '1.5.0',",
    "    date: '2026-07-15',",
    "    headline: 'Complete VibeSpace Workbench and agent platform',",
    '    summary:',
    "      'This major release combines terminal recovery, Pixel Pets, the full spatial Workbench, private Jarvis memory and task execution, subscription-aware CLI providers, the VibeSpace theme system, and the rescued Grok Browser, Preview Studio, editor, files, notes, Jarvis panels, wallpapers, and native desktop integrations.',",
    '    sections: [',
    '      {',
    "        kind: 'feature',",
    '        items: [',
    "          'Spatial Workbench with draggable and resizable panels, saved layouts, templates, detached windows, persistence, browser, editor, files, notes, Jarvis, terminal, device preview, and embedded surfaces.',",
    "          'Vibe Browser and Preview Studio with isolated browser profiles, local-server discovery, responsive device frames, navigation controls, and native Tauri surfaces.',",
    "          'Pixel Pets with transparent desktop overlay, AXO and GLITCH skins, shared chat and terminal surfaces, mini-panel controls, and persisted motion preferences.',",
    "          'Jarvis task execution with durable runs, approvals, cancellation, recovery, MCP and plugin lifecycle management, private learning, and account-scoped All About Me files.',",
    "          'Subscription-aware AI connections and native CLI bridge for Codex, Claude, Gemini, Copilot, Qwen, OpenCode, local models, and exact per-chat routing.',",
    "          'Wallpaper library with previews, local blob storage, entitlements, Orbit redemption, native master caching, Supabase functions, and bundled animated wallpapers.',",
    '        ],',
    '      },',
    '      {',
    "        kind: 'improvement',",
    '        items: [',
    "          'Terminal snapshots, layouts, drafts, and safe-shell sessions recover across restarts with bounded storage and secret redaction.',",
    "          'Four synchronized appearance themes work across the main app, detached Workbench, pet windows, and settings.',",
    "          'Files, chat activity, usage cards, provider selection, model routing, scheduled actions, and agent coordination include all validated improvements from PRs #18 through #23.',",
    '        ],',
    '      },',
    '      {',
    "        kind: 'fix',",
    '        items: [',
    "          'Resolved Workbench integration overlaps without deleting the validated installer or dropping terminal, pet, theme, provider, subscription, or Jarvis functionality.',",
    "          'Fixed cross-platform Preview Studio compilation while preserving owned preview-window behavior on Windows.',",
    "          'Fixed wallpaper IndexedDB blob type safety and preserved local object URL rehydration.',",
    '        ],',
    '      },',
    '      {',
    "        kind: 'shipped',",
    '        items: [',
    "          'Version synchronized to 1.5.0 across npm, package lock, Tauri, Cargo, boot validation, and in-app release metadata.',",
    "          'Cross-platform GitHub release builds Windows, macOS, and Linux installers and requires signed updater artifacts before automatic publication.',",
    '        ],',
    '      },',
    '    ],',
    '  },',
    '',
  ].join('\n');
  releases = releases.replace(
    'export const RELEASES: readonly Release[] = [\n',
    `export const RELEASES: readonly Release[] = [\n${entry}`,
  );
}
write('app/src/features/whats-new/releases.ts', releases);

let about = read('app/src/features/settings/sections/About.tsx');
if (!about.includes('v1.5.0 (Latest)')) {
  const anchor = '        <div className="flex flex-col gap-5 border-l border-border pl-4 relative">\n';
  const card = [
    '          <div className="relative">',
    '            <div className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-accent-copper bg-panel" />',
    '            <div className="flex items-center justify-between gap-2">',
    '              <span className="font-semibold text-foreground text-secondary">v1.5.0 (Latest)</span>',
    '              <span className="text-metadata text-muted-foreground font-mono">July 15, 2026</span>',
    '            </div>',
    '            <p className="text-secondary text-muted-foreground mt-1 leading-relaxed">',
    '              Complete VibeSpace integration: terminal recovery, Pixel Pets, spatial Workbench, Jarvis execution and private memory, CLI providers, synchronized themes, Browser, Preview Studio, editor, files, notes, wallpapers, and native desktop tooling.',
    '            </p>',
    '          </div>',
    '',
  ].join('\n');
  about = about.replace(anchor, `${anchor}${card}`).replace('v0.1.31 (Latest)', 'v0.1.31');
}
write('app/src/features/settings/sections/About.tsx', about);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## [1.5.0]')) {
  const section = [
    '## [1.5.0] - 2026-07-15',
    '',
    '### Added',
    '- Complete spatial Workbench with Browser, Preview Studio, editor, files, notes, Jarvis, terminal, device preview, templates, wallpapers, and persistent layouts.',
    '- Pixel Pets, durable Jarvis task execution and private memory, subscription-aware CLI providers, synchronized themes, and wallpaper entitlements.',
    '',
    '### Changed',
    '- Integrated all validated work from PRs #18 through #23 with the rescued Grok Workbench while preserving the existing installer and application functions.',
    '- Promoted the combined integration to the official v1.5.0 release line.',
    '',
    '### Fixed',
    '- Resolved integration overlaps across Tauri capabilities, Rust command registration, command-palette actions, terminal recovery, themes, pets, providers, and Workbench routing.',
    '- Fixed Preview Studio compilation on non-Windows platforms without changing its Windows behavior.',
    '',
    '',
  ].join('\n');
  const headingEnd = changelog.indexOf('\n', changelog.indexOf('#')) + 1;
  changelog = `${changelog.slice(0, headingEnd)}\n${section}${changelog.slice(headingEnd)}`;
}
write('CHANGELOG.md', changelog);

fs.mkdirSync('releases', { recursive: true });
write(
  'releases/RELEASE_NOTES_1.5.0.md',
  [
    '# VibeSpace 1.5.0',
    '',
    'Released July 15, 2026.',
    '',
    '## Highlights',
    '',
    '- Complete spatial Workbench with draggable and resizable panels, templates, persistence, detached windows, terminal, Browser, Preview Studio, editor, files, notes, Jarvis, device previews, and wallpapers.',
    '- Pixel Pets with transparent overlay, AXO/GLITCH animations, shared chat and terminal surfaces, and account controls.',
    '- Durable Jarvis task runs, approvals, recovery, private learning, All About Me persistence, MCP/plugin lifecycle, and gold-standard intent handling.',
    '- Subscription-aware provider registry and native CLI bridge for Codex, Claude, Gemini, Copilot, Qwen, OpenCode, and local models.',
    '- VibeSpace, Jarvis Core, Default, and Light themes synchronized across every app window.',
    '- Terminal presentation recovery, bounded snapshots, safe-shell restart rules, secret redaction, and update-safe persistence.',
    '- Wallpaper library, bundled animated wallpapers, Orbit redemption, Supabase catalog/download functions, and native master caching.',
    '',
    '## Integration guarantee',
    '',
    'This release is based on PR #26 and contains the validated work from PRs #18 through #23 plus the rescued Grok Workbench. Existing installer, terminal, pet, theme, subscription, provider, Jarvis, and update functions are preserved.',
    '',
  ].join('\n'),
);

let workflow = read('.github/workflows/release.yml');
if (!workflow.includes('  create:\n')) {
  workflow = workflow.replace(
    '  # Allow manual trigger for testing without tagging.\n',
    '  create:\n  # Allow manual trigger for testing without tagging.\n',
  );
}
if (!workflow.includes("github.ref_name == 'v1.5.0'")) {
  workflow = workflow.replace(
    '  release:\n    name:',
    "  release:\n    if: github.event_name != 'create' || (github.ref_type == 'branch' && github.ref_name == 'v1.5.0')\n    name:",
  );
  workflow = workflow.replace(
    '    if: always()\n',
    "    if: always() && (github.event_name != 'create' || (github.ref_type == 'branch' && github.ref_name == 'v1.5.0'))\n",
  );
}
workflow = workflow.replace(
  'JSON.stringify({ bundle: { createUpdaterArtifacts: false } })',
  'JSON.stringify({ bundle: { createUpdaterArtifacts: true } })',
);
if (!workflow.includes('          TAURI_SIGNING_PRIVATE_KEY:')) {
  workflow = workflow.replace(
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n' +
      '          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}\n' +
      '          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}\n',
  );
}
write('.github/workflows/release.yml', workflow);

write(
  '.github/workflows/publish-v1-5-0.yml',
  [
    'name: Publish VibeSpace v1.5.0',
    '',
    'on:',
    '  workflow_run:',
    '    workflows: [Release]',
    '    types: [completed]',
    '',
    'permissions:',
    '  contents: write',
    '',
    'jobs:',
    '  publish:',
    "    if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'v1.5.0' }}",
    '    runs-on: ubuntu-22.04',
    '    steps:',
    '      - name: Publish completed signed release',
    '        env:',
    '          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '        run: gh release edit v1.5.0 --repo "$GITHUB_REPOSITORY" --draft=false --latest',
    '',
  ].join('\n'),
);

fs.rmSync('scripts/prepare-v1-5-release.mjs');
