import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function hydrateMusicUpload(manifest, inputDir) {
  const root = resolve(inputDir);
  if (manifest.count !== manifest.tracks?.length || manifest.count < 1) {
    throw new Error('music_manifest_invalid');
  }
  const seen = new Set();
  return manifest.tracks.map((track) => {
    if (
      basename(track.sourceName) !== track.sourceName ||
      !/^tracks\/[a-z0-9-]+\.mp3$/.test(track.objectKey)
    ) {
      throw new Error(`music_manifest_unsafe:${track.id}`);
    }
    if (seen.has(track.objectKey)) throw new Error(`music_manifest_duplicate:${track.objectKey}`);
    seen.add(track.objectKey);
    const sourcePath = join(root, track.sourceName);
    if (!existsSync(sourcePath) || statSync(sourcePath).size !== track.bytes) {
      throw new Error(`music_source_changed:${track.id}`);
    }
    if (!/^[0-9a-f]{64}$/.test(track.sha256)) throw new Error(`music_hash_invalid:${track.id}`);
    return { ...track, sourcePath };
  });
}

export function uploadArgs(bucket, track) {
  return [
    'wrangler@4.125.0',
    'r2',
    'object',
    'put',
    `${bucket}/${track.objectKey}`,
    '--file',
    track.sourcePath,
    '--content-type',
    'audio/mpeg',
    '--cache-control',
    'public, max-age=31536000, immutable',
    '--remote',
    '--force',
  ];
}

function runNpx(args) {
  const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const command = process.platform === 'win32' ? process.execPath : 'npx';
  const commandArgs = process.platform === 'win32' ? [npxCli, '--yes', ...args] : args;
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    throw new Error(
      `command_failed:${result.error?.message ?? result.status}:${args.slice(0, 5).join(':')}`,
    );
  }
}

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const manifestPath = argument('--manifest');
  const inputDir = argument('--input');
  const bucket = argument('--bucket', 'vibespace-music-library');
  if (!manifestPath || !inputDir) throw new Error('usage: --manifest <file> --input <dir>');
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  const tracks = hydrateMusicUpload(manifest, inputDir);
  for (const track of tracks) {
    let uploaded = false;
    for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
      try {
        runNpx(uploadArgs(bucket, track));
        uploaded = true;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
  }
  const publicManifest = resolve(manifestPath);
  runNpx([
    'wrangler@4.125.0',
    'r2',
    'object',
    'put',
    `${bucket}/catalog/manifest.json`,
    '--file',
    publicManifest,
    '--content-type',
    'application/json',
    '--cache-control',
    'public, max-age=300',
    '--remote',
    '--force',
  ]);
  console.log(`Uploaded ${tracks.length} tracks to ${bucket}.`);
}
