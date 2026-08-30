import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriRoot = path.join(repositoryRoot, 'app', 'src-tauri');
const vendorRoot = path.join(tauriRoot, 'vendor', 'espeak-rs-sys-0.2.0');

const readUtf8 = (target) => readFile(target, 'utf8');
const execFileAsync = promisify(execFile);
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, target)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, target).split(path.sep).join('/'));
    }
  }

  return files;
}

test('Cargo patches only espeak-rs-sys 0.2.0 to the audited local source', async () => {
  const [workspaceManifest, vendoredManifest] = await Promise.all([
    readUtf8(path.join(tauriRoot, 'Cargo.toml')),
    readUtf8(path.join(vendorRoot, 'Cargo.toml')),
  ]);

  assert.match(workspaceManifest, /^\[patch\.crates-io\]$/m);
  assert.match(
    workspaceManifest,
    /^espeak-rs-sys = \{ path = "vendor\/espeak-rs-sys-0\.2\.0" \}$/m,
  );
  assert.match(vendoredManifest, /^name = "espeak-rs-sys"$/m);
  assert.match(vendoredManifest, /^version = "0\.2\.0"$/m);
  assert.match(vendoredManifest, /^build = "build\.rs"$/m);
});

test('Git preserves the audited vendor and copied license bytes exactly', async () => {
  const attributes = await readUtf8(path.join(repositoryRoot, '.gitattributes'));

  assert.match(attributes, /^\/app\/src-tauri\/vendor\/espeak-rs-sys-0\.2\.0\/\*\* -text$/m);
  assert.match(attributes, /^\/docs\/oss\/licenses\/GPL-3\.0-or-later-espeak-ng\.txt -text$/m);
});

test('the vendored build keeps Release eSpeak while refusing the debug CRT import', async () => {
  const buildScript = await readUtf8(path.join(vendorRoot, 'build.rs'));

  assert.match(
    buildScript,
    /env::var\("ESPEAK_LIB_PROFILE"\)\.unwrap_or\("Release"\.to_string\(\)\)/,
  );
  assert.match(buildScript, /\.profile\(&profile\)/);
  assert.match(buildScript, /build\/src\/speechPlayer\/Release/);
  assert.match(buildScript, /build\/src\/ucd-tools\/Release/);
  assert.match(buildScript, /cargo:rustc-link-lib=\{\}=\{\}/);
  assert.doesNotMatch(buildScript, /cargo:rustc-link-lib=dylib=msvcrtd/);
  assert.doesNotMatch(buildScript, /cfg!\(all\(debug_assertions, windows\)\)/);
});

test('the complete vendored package matches the audited crate except for build.rs', async () => {
  const files = (await listFiles(vendorRoot)).sort();
  const unmodifiedFiles = files.filter((relative) => relative !== 'build.rs');
  const generatedArtifacts = files.filter(
    (relative) =>
      relative === '.cargo-ok' ||
      relative.startsWith('target/') ||
      /\.(?:a|dll|exe|lib|o|obj|pdb|so)$/iu.test(relative),
  );
  const hashLines = [];

  for (const relative of unmodifiedFiles) {
    const contents = await readFile(path.join(vendorRoot, ...relative.split('/')));
    hashLines.push(`${relative}|${sha256(contents)}`);
  }

  assert.deepEqual(generatedArtifacts, []);
  assert.equal(files.length, 2_193);
  assert.equal(unmodifiedFiles.length, 2_192);
  assert.equal(
    sha256(hashLines.join('\n')),
    'c5c54dbf1b182d72993f3b10e8de17be86eb7c58b9c8ce179316edcbc21aded3',
  );
  assert.equal(
    sha256(await readFile(path.join(vendorRoot, 'build.rs'))),
    '92e93feb490b86fa030185595a711db1abd747a63d5fbaf82209d40367692f05',
  );
});

test('offline Cargo resolution selects the vendored package without a checked-in lock', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'vibespace-espeak-resolution-'));
  try {
    await mkdir(path.join(fixture, 'src'));
    await writeFile(path.join(fixture, 'src', 'lib.rs'), 'pub fn contract_fixture() {}\n');
    await writeFile(
      path.join(fixture, 'Cargo.toml'),
      `[package]
name = "vibespace-espeak-resolution-contract"
version = "0.0.0"
edition = "2021"

[dependencies]
espeak-rs-sys = "=0.2.0"

[patch.crates-io]
espeak-rs-sys = { path = "${vendorRoot.split(path.sep).join('/')}" }
`,
    );

    const { stdout } = await execFileAsync(
      'cargo',
      ['metadata', '--offline', '--format-version', '1', '--manifest-path', 'Cargo.toml'],
      { cwd: fixture, maxBuffer: 16 * 1024 * 1024 },
    );
    const metadata = JSON.parse(stdout);
    const packages = metadata.packages.filter(
      ({ name, version }) => name === 'espeak-rs-sys' && version === '0.2.0',
    );

    assert.equal(packages.length, 1);
    assert.equal(packages[0].source, null);
    assert.equal(path.normalize(packages[0].manifest_path), path.join(vendorRoot, 'Cargo.toml'));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
