import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as primitiveAuthority from '../../app/src/features/appearance/monochromePrimitiveManifest.ts';
import * as fixtureAuthority from '../../tests/visual/monochrome/fixture-manifest.ts';
import { MONOCHROME_NATIVE_WINDOW_MANIFEST } from '../../tests/visual/monochrome/native-window-manifest.ts';
import * as routeAuthority from '../../tests/visual/monochrome/route-manifest.ts';
import * as shellAuthority from '../../tests/visual/monochrome/shell-overlay-manifest.ts';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const requiredAuthorities = [
  '../../tests/visual/monochrome/fixture-manifest.ts',
  '../../tests/visual/monochrome/route-manifest.ts',
  '../../tests/visual/monochrome/shell-overlay-manifest.ts',
  '../../tests/visual/monochrome/native-window-manifest.ts',
  '../../app/src/features/appearance/monochromePrimitiveManifest.ts',
];
const COMMON_FIXTURE_IDS = ['chat', 'settings-appearance', 'terminal-workbench'];
const COMMON_FIXTURE_HASHES = {
  chat: 'fd8950bf1a41f18797c3e4ea97ad25f1eac86ffda0862cc61e361bdea2a158c9',
  'settings-appearance': '1531421802e9d827e011047c410dd29c6d7c459c03f2bdb9ad91154f8c5ab875',
  'terminal-workbench': 'd27d7b59bed7386b11335a93d8827deb13d251d6de216c3b5bb84bee9ba8bc2b',
};
const COMMON_MANIFEST_AUTHORITIES = [
  {
    name: 'fixture',
    manifest: fixtureAuthority.MONOCHROME_FIXTURE_MANIFEST,
    ownedPaths: [
      'tests/visual/monochrome/fixture-manifest.test.ts',
      'tests/visual/monochrome/fixture-manifest.ts',
      'tests/visual/monochrome/fixtures.ts',
    ],
    consumerTasks: ['MC4', 'MC5', 'MC6'],
    validatorCommand: 'node --test tests/visual/monochrome/fixture-manifest.test.ts',
  },
  {
    name: 'native-window',
    manifest: MONOCHROME_NATIVE_WINDOW_MANIFEST,
    ownedPaths: [
      'tests/visual/monochrome/native-window-manifest.test.ts',
      'tests/visual/monochrome/native-window-manifest.ts',
    ],
    consumerTasks: ['MC9'],
    validatorCommand: 'node --test tests/visual/monochrome/native-window-manifest.test.ts',
  },
  {
    name: 'primitive',
    manifest: primitiveAuthority.MONOCHROME_PRIMITIVE_MANIFEST,
    ownedPaths: [
      'app/src/features/appearance/monochromePrimitiveManifest.test.ts',
      'app/src/features/appearance/monochromePrimitiveManifest.ts',
    ],
    consumerTasks: ['MC4', 'MC6'],
    validatorCommand:
      'npm --prefix app test -- src/features/appearance/monochromePrimitiveManifest.test.ts',
  },
  {
    name: 'route',
    manifest: routeAuthority.MONOCHROME_ROUTE_MANIFEST,
    ownedPaths: [
      'tests/visual/monochrome/route-manifest.test.ts',
      'tests/visual/monochrome/route-manifest.ts',
    ],
    consumerTasks: ['MC5', 'MC6', 'MC7'],
    validatorCommand: 'node --test tests/visual/monochrome/route-manifest.test.ts',
  },
  {
    name: 'shell-overlay',
    manifest: shellAuthority.MONOCHROME_SHELL_OVERLAY_MANIFEST,
    ownedPaths: [
      'tests/visual/monochrome/shell-overlay-manifest.test.ts',
      'tests/visual/monochrome/shell-overlay-manifest.ts',
    ],
    consumerTasks: ['MC6', 'MC9'],
    validatorCommand: 'node --test tests/visual/monochrome/shell-overlay-manifest.test.ts',
  },
];

const SIDE_EFFECT_DISCOVERY_RULES = Object.freeze([
  {
    sourcePath: 'app/src-tauri/src/lib.rs',
    predicates: [
      [
        'plugin-registration',
        'plugin-registration',
        /tauri_plugin_[a-z_]+::(?:init|Builder::new)/u,
      ],
      ['startup-hook', 'startup', /\.setup\(\|app\|/u],
      ['terminal-cli-start', 'startup', /terminal_cli::start_terminal_cli_server\(/u],
      ['tray-create', 'tray', /TrayIconBuilder::with_id\(/u],
      ['global-shortcut-register', 'global-shortcut', /global_shortcut\(\)\.register\(/u],
      ['app-run-lifecycle', 'process-lifecycle', /\.run\(\|app_handle, event\|/u],
    ],
  },
  {
    sourcePath: 'app/src-tauri/src/credentials.rs',
    predicates: [
      ['keyring-entry', 'credential-store', /Entry::new\(/u],
      ['keyring-set', 'credential-store', /\.set_password\(/u],
      ['keyring-read', 'credential-store', /\.get_password\(/u],
      ['keyring-delete', 'credential-store', /\.delete_credential\(/u],
    ],
  },
  {
    sourcePath: 'app/src-tauri/src/pets.rs',
    predicates: [
      ['registry-read', 'os-registry', /\.open_subkey(?:_with_flags)?\(/u],
      ['registry-create', 'os-registry', /\.create_subkey(?:_with_flags)?\(/u],
      ['registry-set', 'os-registry', /\brun\.set_value\(/u],
      ['registry-delete', 'os-registry', /\brun\.delete_value\(/u],
    ],
  },
  {
    sourcePath: 'app/src-tauri/src/launcher.rs',
    predicates: [
      ['directory-create', 'filesystem', /fs::create_dir_all\(/u],
      ['file-write', 'filesystem', /fs::write\(/u],
      ['file-copy', 'filesystem', /fs::copy\(/u],
      ['registry-open', 'os-registry', /\.open_subkey(?:_with_flags)?\(/u],
      ['registry-create', 'os-registry', /\.create_subkey(?:_with_flags)?\(/u],
      ['registry-path-write', 'os-registry', /\benv\.set_value\("Path"/u],
      ['process-path-write', 'process-environment', /std::env::set_var\("PATH"/u],
      ['file-permissions-write', 'filesystem', /fs::set_permissions\(/u],
    ],
  },
  {
    sourcePath: 'app/src-tauri/src/terminal_cli.rs',
    predicates: [
      ['keyring-entry', 'credential-store', /Entry::new\(/u],
      ['keyring-set', 'credential-store', /\.set_password\(/u],
      ['keyring-read', 'credential-store', /\.get_password\(/u],
      ['file-remove', 'filesystem', /fs::remove_file\(/u],
      ['directory-create', 'filesystem', /fs::create_dir_all\(/u],
      ['file-create', 'filesystem', /OpenOptions::new\(\)/u],
      ['file-write', 'filesystem', /\bfile\.write_all\(/u],
      ['file-flush', 'filesystem', /\bfile\.sync_all\(\)/u],
      ['file-permissions-write', 'filesystem', /fs::set_permissions\(/u],
      ['file-rename', 'filesystem', /fs::rename\(/u],
      ['file-replace-windows', 'filesystem', /\bMoveFileExW\(/u],
    ],
  },
  {
    sourcePath: 'app/src/App.tsx',
    predicates: [
      [
        'frontend-terminal-launcher-install',
        'frontend-ipc',
        /invoke\('install_terminal_launcher'\)/u,
      ],
    ],
  },
  {
    sourcePath: 'app/src/lib/updates.ts',
    predicates: [
      ['update-check', 'updater', /\bconst update = await check\(\)/u],
      ['update-download-install', 'updater', /\bupdate\.downloadAndInstall\(/u],
      ['workspace-flush', 'persistence', /\bflushWorkspacePersistence\('pre-update-/u],
      ['process-relaunch', 'process-lifecycle', /\bawait relaunch\(\)/u],
    ],
  },
]);
const sourceCommitCache = new Map();

function sideEffect(
  id,
  sourcePath,
  sourceLine,
  operation,
  category,
  token,
  currentSeam,
  expectation = 'present',
) {
  return Object.freeze({
    id,
    sourcePath,
    sourceLine,
    operation,
    category,
    token,
    currentSeam,
    expectation,
    guardDisposition: 'inventory-only-no-guard-required',
  });
}

export const MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY = Object.freeze([
  sideEffect(
    'app-1009-frontend-terminal-launcher-install',
    'app/src/App.tsx',
    1009,
    'frontend-terminal-launcher-install',
    'frontend-ipc',
    ".then(({ invoke }) => invoke('install_terminal_launcher'))",
    'Direct frontend terminal launcher install boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'credentials-22-keyring-entry',
    'app/src-tauri/src/credentials.rs',
    22,
    'keyring-entry',
    'credential-store',
    'Entry::new(SERVICE, &account).map_err(|err| format!("credential store unavailable: {err}"))',
    'Direct keyring entry boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'credentials-33-keyring-set',
    'app/src-tauri/src/credentials.rs',
    33,
    'keyring-set',
    'credential-store',
    '.set_password(trimmed)',
    'Direct keyring set boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'credentials-40-keyring-read',
    'app/src-tauri/src/credentials.rs',
    40,
    'keyring-read',
    'credential-store',
    'match entry.get_password() {',
    'Direct keyring read boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'credentials-51-keyring-delete',
    'app/src-tauri/src/credentials.rs',
    51,
    'keyring-delete',
    'credential-store',
    'match entry.delete_credential() {',
    'Direct keyring delete boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'deep-link-registration-absent',
    'app/src-tauri/src/lib.rs',
    null,
    'plugin-registration',
    'declared-absence',
    'tauri_plugin_deep_link::init',
    'Documentation names deep links, but the source commit has no plugin registration',
    'absent',
  ),
  sideEffect(
    'launcher-14-directory-create',
    'app/src-tauri/src/launcher.rs',
    14,
    'directory-create',
    'filesystem',
    'fs::create_dir_all(&bin_dir).map_err(io_err)?;',
    'Direct directory create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-39-directory-create',
    'app/src-tauri/src/launcher.rs',
    39,
    'directory-create',
    'filesystem',
    'fs::create_dir_all(&bin_dir).map_err(io_err)?;',
    'Direct directory create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-409-file-write',
    'app/src-tauri/src/launcher.rs',
    409,
    'file-write',
    'filesystem',
    'fs::write(path, content).map_err(io_err)',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-426-file-copy',
    'app/src-tauri/src/launcher.rs',
    426,
    'file-copy',
    'filesystem',
    'fs::copy(path, backup).map_err(io_err)?;',
    'Direct file copy boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-43-file-write',
    'app/src-tauri/src/launcher.rs',
    43,
    'file-write',
    'filesystem',
    'fs::write(&primary, script).map_err(io_err)?;',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-437-registry-open',
    'app/src-tauri/src/launcher.rs',
    437,
    'registry-open',
    'os-registry',
    '.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)',
    'Direct registry environment handle open boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-447-registry-path-write',
    'app/src-tauri/src/launcher.rs',
    447,
    'registry-path-write',
    'os-registry',
    'env.set_value("Path", &updated)',
    'Direct registry path write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-458-process-path-write',
    'app/src-tauri/src/launcher.rs',
    458,
    'process-path-write',
    'process-environment',
    'std::env::set_var("PATH", joined);',
    'Direct process path write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-47-file-write',
    'app/src-tauri/src/launcher.rs',
    47,
    'file-write',
    'filesystem',
    'fs::write(&lower, unix_launcher_script()).map_err(io_err)?;',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-554-file-write',
    'app/src-tauri/src/launcher.rs',
    554,
    'file-write',
    'filesystem',
    'fs::write(&path, next).map_err(io_err)?;',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-565-process-path-write',
    'app/src-tauri/src/launcher.rs',
    565,
    'process-path-write',
    'process-environment',
    'std::env::set_var("PATH", joined);',
    'Direct process path write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'launcher-576-file-permissions-write',
    'app/src-tauri/src/launcher.rs',
    576,
    'file-permissions-write',
    'filesystem',
    'fs::set_permissions(path, perms).map_err(io_err)',
    'Direct file permissions write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-203-plugin-registration',
    'app/src-tauri/src/lib.rs',
    203,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-207-plugin-registration',
    'app/src-tauri/src/lib.rs',
    207,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_os::init())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-208-plugin-registration',
    'app/src-tauri/src/lib.rs',
    208,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_shell::init())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-209-plugin-registration',
    'app/src-tauri/src/lib.rs',
    209,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_dialog::init())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-210-plugin-registration',
    'app/src-tauri/src/lib.rs',
    210,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_notification::init())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-211-plugin-registration',
    'app/src-tauri/src/lib.rs',
    211,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_http::init())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-212-plugin-registration',
    'app/src-tauri/src/lib.rs',
    212,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_process::init())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-213-plugin-registration',
    'app/src-tauri/src/lib.rs',
    213,
    'plugin-registration',
    'plugin-registration',
    '.plugin(tauri_plugin_updater::Builder::new().build())',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-215-plugin-registration',
    'app/src-tauri/src/lib.rs',
    215,
    'plugin-registration',
    'plugin-registration',
    'tauri_plugin_global_shortcut::Builder::new()',
    'Direct plugin registration boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-232-startup-hook',
    'app/src-tauri/src/lib.rs',
    232,
    'startup-hook',
    'startup',
    '.setup(|app| {',
    'Direct startup hook boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-233-terminal-cli-start',
    'app/src-tauri/src/lib.rs',
    233,
    'terminal-cli-start',
    'startup',
    'if let Err(err) = terminal_cli::start_terminal_cli_server(',
    'Direct terminal cli start boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-267-tray-create',
    'app/src-tauri/src/lib.rs',
    267,
    'tray-create',
    'tray',
    'let _tray = tauri::tray::TrayIconBuilder::with_id(branding::TRAY_ICON_ID)',
    'Direct tray create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-309-global-shortcut-register',
    'app/src-tauri/src/lib.rs',
    309,
    'global-shortcut-register',
    'global-shortcut',
    'if let Err(err) = app.global_shortcut().register(dictation_shortcut) {',
    'Direct global shortcut register boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'lib-472-app-run-lifecycle',
    'app/src-tauri/src/lib.rs',
    472,
    'app-run-lifecycle',
    'process-lifecycle',
    '.run(|app_handle, event| {',
    'Direct app run lifecycle boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'pets-36-registry-read',
    'app/src-tauri/src/pets.rs',
    36,
    'registry-read',
    'os-registry',
    '.open_subkey_with_flags(r"Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_READ)',
    'Direct registry read boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'pets-60-registry-create',
    'app/src-tauri/src/pets.rs',
    60,
    'registry-create',
    'os-registry',
    '.create_subkey(r"Software\\Microsoft\\Windows\\CurrentVersion\\Run")',
    'Direct registry startup-key create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'pets-65-registry-set',
    'app/src-tauri/src/pets.rs',
    65,
    'registry-set',
    'os-registry',
    'run.set_value(',
    'Direct registry set boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'pets-72-registry-delete',
    'app/src-tauri/src/pets.rs',
    72,
    'registry-delete',
    'os-registry',
    'match run.delete_value(PET_AUTOSTART_VALUE_NAME) {',
    'Direct registry delete boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1093-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1093,
    'file-remove',
    'filesystem',
    'return match fs::remove_file(path) {',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1105-directory-create',
    'app/src-tauri/src/terminal_cli.rs',
    1105,
    'directory-create',
    'filesystem',
    'fs::create_dir_all(parent).map_err(|error| format!("Shell profile directory: {error}"))?;',
    'Direct directory create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1115-file-create',
    'app/src-tauri/src/terminal_cli.rs',
    1115,
    'file-create',
    'filesystem',
    'let mut file = OpenOptions::new()',
    'Direct file create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1120-file-write',
    'app/src-tauri/src/terminal_cli.rs',
    1120,
    'file-write',
    'filesystem',
    'if let Err(error) = file.write_all(content.as_bytes()) {',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1122-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1122,
    'file-remove',
    'filesystem',
    'let _ = fs::remove_file(&temporary);',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1125-file-flush',
    'app/src-tauri/src/terminal_cli.rs',
    1125,
    'file-flush',
    'filesystem',
    'if let Err(error) = file.sync_all() {',
    'Direct file flush boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1127-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1127,
    'file-remove',
    'filesystem',
    'let _ = fs::remove_file(&temporary);',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1132-file-permissions-write',
    'app/src-tauri/src/terminal_cli.rs',
    1132,
    'file-permissions-write',
    'filesystem',
    'if let Err(error) = fs::set_permissions(&temporary, metadata.permissions()) {',
    'Direct file permissions write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1133-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1133,
    'file-remove',
    'filesystem',
    'let _ = fs::remove_file(&temporary);',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1138-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1138,
    'file-remove',
    'filesystem',
    'let _ = fs::remove_file(&temporary);',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1165-keyring-entry',
    'app/src-tauri/src/terminal_cli.rs',
    1165,
    'keyring-entry',
    'credential-store',
    'Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)',
    'Direct keyring entry boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1186-directory-create',
    'app/src-tauri/src/terminal_cli.rs',
    1186,
    'directory-create',
    'filesystem',
    'fs::create_dir_all(parent).map_err(|error| format!("endpoint directory: {error}"))?;',
    'Direct directory create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1194-file-create',
    'app/src-tauri/src/terminal_cli.rs',
    1194,
    'file-create',
    'filesystem',
    'let mut file = OpenOptions::new()',
    'Direct file create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1199-file-write',
    'app/src-tauri/src/terminal_cli.rs',
    1199,
    'file-write',
    'filesystem',
    'file.write_all(&bytes)',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1201-file-flush',
    'app/src-tauri/src/terminal_cli.rs',
    1201,
    'file-flush',
    'filesystem',
    'file.sync_all()',
    'Direct file flush boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1206-file-permissions-write',
    'app/src-tauri/src/terminal_cli.rs',
    1206,
    'file-permissions-write',
    'filesystem',
    'fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))',
    'Direct file permissions write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1210-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1210,
    'file-remove',
    'filesystem',
    'let _ = fs::remove_file(&temporary);',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1405-keyring-set',
    'app/src-tauri/src/terminal_cli.rs',
    1405,
    'keyring-set',
    'credential-store',
    '.set_password(&nonce)',
    'Direct keyring set boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1524-keyring-read',
    'app/src-tauri/src/terminal_cli.rs',
    1524,
    'keyring-read',
    'credential-store',
    '.get_password()',
    'Direct keyring read boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1845-file-replace-windows',
    'app/src-tauri/src/terminal_cli.rs',
    1845,
    'file-replace-windows',
    'filesystem',
    'MoveFileExW(',
    'Direct file replace windows boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1856-file-rename',
    'app/src-tauri/src/terminal_cli.rs',
    1856,
    'file-rename',
    'filesystem',
    'fs::rename(temporary, destination).map_err(|error| error.to_string())',
    'Direct file rename boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1875-file-create',
    'app/src-tauri/src/terminal_cli.rs',
    1875,
    'file-create',
    'filesystem',
    'let mut file = OpenOptions::new()',
    'Direct file create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1880-file-write',
    'app/src-tauri/src/terminal_cli.rs',
    1880,
    'file-write',
    'filesystem',
    'file.write_all(content.as_bytes())',
    'Direct file write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1882-file-flush',
    'app/src-tauri/src/terminal_cli.rs',
    1882,
    'file-flush',
    'filesystem',
    'file.sync_all()',
    'Direct file flush boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1887-file-permissions-write',
    'app/src-tauri/src/terminal_cli.rs',
    1887,
    'file-permissions-write',
    'filesystem',
    'fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))',
    'Direct file permissions write boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1891-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1891,
    'file-remove',
    'filesystem',
    'let _ = fs::remove_file(&temporary);',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1926-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1926,
    'file-remove',
    'filesystem',
    'None => match fs::remove_file(rollback_path) {',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1972-file-rename',
    'app/src-tauri/src/terminal_cli.rs',
    1972,
    'file-rename',
    'filesystem',
    'if let Err(remove_error) = fs::rename(path, &temporary) {',
    'Direct file rename boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1975-file-rename',
    'app/src-tauri/src/terminal_cli.rs',
    1975,
    'file-rename',
    'filesystem',
    'if let Err(error) = fs::rename(moved_path, original) {',
    'Direct file rename boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-1991-file-remove',
    'app/src-tauri/src/terminal_cli.rs',
    1991,
    'file-remove',
    'filesystem',
    'if let Err(error) = fs::remove_file(&temporary) {',
    'Direct file remove boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'terminal-cli-2043-directory-create',
    'app/src-tauri/src/terminal_cli.rs',
    2043,
    'directory-create',
    'filesystem',
    'fs::create_dir_all(&bin_dir).map_err(|error| format!("CLI bin directory: {error}"))?;',
    'Direct directory create boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'updates-48-update-check',
    'app/src/lib/updates.ts',
    48,
    'update-check',
    'updater',
    'const update = await check();',
    'Direct update check boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'updates-63-workspace-flush',
    'app/src/lib/updates.ts',
    63,
    'workspace-flush',
    'persistence',
    "await flushWorkspacePersistence('pre-update-install');",
    'Direct workspace flush boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'updates-69-update-download-install',
    'app/src/lib/updates.ts',
    69,
    'update-download-install',
    'updater',
    'await update.downloadAndInstall((event) => {',
    'Direct update download install boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'updates-87-workspace-flush',
    'app/src/lib/updates.ts',
    87,
    'workspace-flush',
    'persistence',
    "await flushWorkspacePersistence('pre-update-relaunch');",
    'Direct workspace flush boundary; no MonoChrome guard at MC0B',
  ),
  sideEffect(
    'updates-91-process-relaunch',
    'app/src/lib/updates.ts',
    91,
    'process-relaunch',
    'process-lifecycle',
    'await relaunch();',
    'Direct process relaunch boundary; no MonoChrome guard at MC0B',
  ),
]);

function sourceAtCommit(relativePath) {
  const cached = sourceCommitCache.get(relativePath);
  if (cached !== undefined) return cached;
  const source = execFileSync('git', ['show', `${SOURCE_COMMIT}:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  sourceCommitCache.set(relativePath, source);
  return source;
}

function discoverPrivilegedSideEffects() {
  const candidates = [];
  for (const rule of SIDE_EFFECT_DISCOVERY_RULES) {
    const lines = sourceAtCommit(rule.sourcePath).split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      for (const [operation, category, predicate] of rule.predicates) {
        if (!predicate.test(line)) continue;
        candidates.push({
          sourcePath: rule.sourcePath,
          sourceLine: index + 1,
          operation,
          category,
          token: line.trim(),
        });
      }
    }
  }
  return candidates.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.sourceLine - right.sourceLine ||
      left.operation.localeCompare(right.operation),
  );
}

function discoverRegistryOpenCreateBoundaries() {
  return ['app/src-tauri/src/launcher.rs', 'app/src-tauri/src/pets.rs']
    .flatMap((sourcePath) =>
      sourceAtCommit(sourcePath)
        .split(/\r?\n/u)
        .flatMap((line, index) => {
          const match = line.match(
            /\.(open_subkey(?:_with_flags)?|create_subkey(?:_with_flags)?)\(/u,
          );
          if (!match) return [];
          const operation = match[1].startsWith('create')
            ? 'registry-create'
            : sourcePath.endsWith('/launcher.rs')
              ? 'registry-open'
              : 'registry-read';
          return [
            {
              sourcePath,
              sourceLine: index + 1,
              operation,
              category: 'os-registry',
              token: line.trim(),
            },
          ];
        }),
    )
    .sort(
      (left, right) =>
        left.sourcePath.localeCompare(right.sourcePath) || left.sourceLine - right.sourceLine,
    );
}

function callsiteTuple(entry) {
  return [entry.sourcePath, entry.sourceLine, entry.operation, entry.category, entry.token];
}

test('all Step-7 source-derived authorities exist before later MonoChrome tasks run', () => {
  for (const relativePath of requiredAuthorities) {
    const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
    assert.equal(existsSync(absolutePath), true, `missing Step-7 authority: ${relativePath}`);
  }
});

test('all Step-7 manifests freeze exact common metadata and disjoint owned paths', () => {
  for (const authority of COMMON_MANIFEST_AUTHORITIES) {
    const { manifest } = authority;
    assert.equal(manifest.schemaVersion, 1, authority.name);
    assert.equal(manifest.sourceCommit, SOURCE_COMMIT, authority.name);
    assert.equal(manifest.captureMode, 'retroactive-source-freeze', authority.name);
    assert.deepEqual(manifest.ownedPaths, authority.ownedPaths, authority.name);
    assert.deepEqual(manifest.fixtureIds, COMMON_FIXTURE_IDS, authority.name);
    assert.deepEqual(manifest.fixtureHashes, COMMON_FIXTURE_HASHES, authority.name);
    assert.deepEqual(manifest.consumerTasks, authority.consumerTasks, authority.name);
    assert.equal(manifest.validatorCommand, authority.validatorCommand, authority.name);
    for (const ownedPath of manifest.ownedPaths) {
      assert.equal(existsSync(fileURLToPath(new URL(`../../${ownedPath}`, import.meta.url))), true);
    }
  }

  const validateSet = fixtureAuthority.validateMonochromeManifestSet;
  assert.equal(typeof validateSet, 'function', 'missing common manifest set validator');
  if (typeof validateSet !== 'function') return;
  const manifests = COMMON_MANIFEST_AUTHORITIES.map(({ name, manifest }) => ({ name, manifest }));
  assert.deepEqual(validateSet(manifests), []);
  assert.match(
    validateSet([
      ...manifests.slice(0, 2),
      {
        ...manifests[2],
        manifest: {
          ...manifests[2].manifest,
          ownedPaths: [...manifests[2].manifest.ownedPaths, manifests[0].manifest.ownedPaths[0]],
        },
      },
      ...manifests.slice(3),
    ]).join('\n'),
    /owned path.*overlap|overlap.*owned path/iu,
  );
  assert.match(
    validateSet([
      ...manifests.slice(0, 2),
      {
        ...manifests[2],
        manifest: { ...manifests[2].manifest, fixtureIds: ['chat'] },
      },
      ...manifests.slice(3),
    ]).join('\n'),
    /fixture.*metadata|metadata.*fixture/iu,
  );
});

test('manifest contract inventories every source-commit production capability tuple', () => {
  const capabilityFiles = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', SOURCE_COMMIT, 'app/src-tauri/capabilities'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .filter((sourcePath) => sourcePath.endsWith('.json'))
    .sort();
  const discovered = capabilityFiles.map((sourcePath) => {
    const parsed = JSON.parse(sourceAtCommit(sourcePath));
    return [
      sourcePath.replace('app/src-tauri/capabilities/', ''),
      parsed.identifier,
      parsed.windows,
    ];
  });
  assert.equal(MONOCHROME_NATIVE_WINDOW_MANIFEST.sourceCommit, SOURCE_COMMIT);
  assert.deepEqual(
    MONOCHROME_NATIVE_WINDOW_MANIFEST.capabilities.map(({ file, identifier, windows }) => [
      file,
      identifier,
      windows,
    ]),
    discovered,
  );
});

test('privileged side-effect inventory freezes every required callsite in stable order', () => {
  const ids = MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY.map((entry) => entry.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY.length);
});

test('privileged inventory closes over every bounded source-derived side-effect candidate', () => {
  const discovered = discoverPrivilegedSideEffects().map(callsiteTuple);
  const frozen = MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY.filter(
    (entry) => entry.expectation !== 'absent',
  )
    .map(callsiteTuple)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const sortedDiscovered = discovered.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  assert.deepEqual(frozen, sortedDiscovered);
});

test('privileged discovery includes the frozen launcher registry-open boundary', () => {
  const discovered = discoverPrivilegedSideEffects().map(callsiteTuple);
  assert.deepEqual(
    discovered.find(
      ([sourcePath, sourceLine]) =>
        sourcePath === 'app/src-tauri/src/launcher.rs' && sourceLine === 437,
    ),
    [
      'app/src-tauri/src/launcher.rs',
      437,
      'registry-open',
      'os-registry',
      '.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)',
    ],
  );
});

test('privileged discovery includes the frozen pets registry-create boundary', () => {
  const discovered = discoverPrivilegedSideEffects().map(callsiteTuple);
  assert.deepEqual(
    discovered.find(
      ([sourcePath, sourceLine]) => sourcePath === 'app/src-tauri/src/pets.rs' && sourceLine === 60,
    ),
    [
      'app/src-tauri/src/pets.rs',
      60,
      'registry-create',
      'os-registry',
      '.create_subkey(r"Software\\Microsoft\\Windows\\CurrentVersion\\Run")',
    ],
  );
});

test('privileged registry open/create inventory matches the independent bounded source scan', () => {
  const discovered = discoverRegistryOpenCreateBoundaries().map(callsiteTuple);
  const frozen = MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY.filter(
    (entry) =>
      ['app/src-tauri/src/launcher.rs', 'app/src-tauri/src/pets.rs'].includes(entry.sourcePath) &&
      ['registry-read', 'registry-open', 'registry-create'].includes(entry.operation),
  ).map(callsiteTuple);
  assert.equal(discovered.length, 3);
  assert.deepEqual(frozen, discovered);
});

test('privileged inventory schema identifies each literal source callsite and current seam', () => {
  for (const entry of MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.match(entry.sourcePath, /^(?:app|tests|scripts)\//u);
    if (entry.expectation === 'absent') {
      assert.equal(entry.sourceLine, null, entry.id);
    } else {
      assert.ok(Number.isSafeInteger(entry.sourceLine) && entry.sourceLine > 0, entry.id);
    }
    assert.match(entry.operation, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.match(entry.category, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.equal(entry.guardDisposition, 'inventory-only-no-guard-required');
    assert.ok(entry.currentSeam.length > 0, entry.id);
  }
  const ids = MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY.map((entry) => entry.id);
  assert.deepEqual(ids, [...ids].sort());
});

test('privileged callsite tokens reflect source-commit presence or declared absence', () => {
  for (const entry of MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY) {
    const source = sourceAtCommit(entry.sourcePath);
    if (entry.expectation === 'absent') {
      assert.equal(source.includes(entry.token), false, entry.id);
    } else {
      assert.equal(source.split(/\r?\n/u)[entry.sourceLine - 1]?.trim(), entry.token, entry.id);
    }
    assert.equal(entry.guardDisposition, 'inventory-only-no-guard-required');
    assert.ok(entry.currentSeam.length > 0, entry.id);
  }
});

test('privileged inventory covers the complete side-effect category vocabulary', () => {
  assert.deepEqual(
    [...new Set(MONOCHROME_PRIVILEGED_SIDE_EFFECT_INVENTORY.map((entry) => entry.category))].sort(),
    [
      'credential-store',
      'declared-absence',
      'filesystem',
      'frontend-ipc',
      'global-shortcut',
      'os-registry',
      'persistence',
      'plugin-registration',
      'process-environment',
      'process-lifecycle',
      'startup',
      'tray',
      'updater',
    ],
  );
});
