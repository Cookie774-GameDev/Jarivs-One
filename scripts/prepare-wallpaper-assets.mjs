/**
 * Prepare Workbench wallpaper catalog metadata from a local MP4 folder.
 *
 * Usage:
 *   node scripts/prepare-wallpaper-assets.mjs --input "C:\Users\viper\Downloads\VibeSpace-WallpAPPERS" --out "scripts/wallpaper-assets/out"
 *
 * Does not bundle full videos into the app. Writes:
 *   - catalog/catalog.json  (remote catalog seed / upload payload)
 *   - wallpapers/<slug>/manifest.json
 *   - optional thumbs if ffmpeg is available
 *
 * Full MP4s stay in the input folder (or copy manifests only) for Supabase Storage upload.
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function slugify(name) {
  return (
    name
      .replace(extname(name), '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'wallpaper'
  );
}

/**
 * Human display name from original MP4 filename.
 * Strips leading hash ids, quality suffixes (Prob4), trailing counters.
 */
function displayNameFromFile(file) {
  let base = basename(file, extname(file));

  if (/^\d+$/.test(base)) return `Wallpaper ${base}`;

  // hash_Title… or id-Title…
  const under = base.match(/^([A-Za-z0-9]{8,})_+(.*)$/);
  if (under && under[2] && !/^[A-Za-z0-9]{10,}$/.test(under[2])) {
    base = under[2];
  } else {
    const dash = base.match(/^([A-Za-z0-9]{8,})-(.+)$/);
    if (dash && dash[2] && dash[2].length >= 3) base = dash[2];
  }

  base = base
    .replace(/[\s_-]*\d*prob\d*$/i, '')
    .replace(/_\d+_\d+$/, '')
    .replace(/[\s_-]+\d+$/, '')
    .replace(/\s*live\s*wallpaper\s*$/i, ' Live Wallpaper')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/4\s+K\b/gi, '4K')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Keep numbers glued to 4K; title-case words
  const name = base
    .split(' ')
    .map((w) => {
      if (!w) return w;
      if (/^\d+$/.test(w) || /^4K$/i.test(w)) return w.toUpperCase() === '4K' ? '4K' : w;
      if (w.length <= 2 && /^[A-Z0-9]+$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/\b4k\b/gi, '4K')
    .trim();

  return (name || basename(file, extname(file))).slice(0, 80);
}

function categoryFor(name) {
  const n = name.toLowerCase();
  if (n.includes('space') || n.includes('night') || n.includes('magical')) return 'space';
  if (n.includes('autumn') || n.includes('forest') || n.includes('river') || n.includes('canyon'))
    return 'nature';
  if (n.includes('samurai') || n.includes('ocean') || n.includes('shore')) return 'cozy';
  if (n.includes('kenshi') || n.includes('sasuke')) return 'abstract';
  return 'abstract';
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

const inputDir = arg('--input', process.env.WALLPAPER_INPUT);
const outDir = arg('--out', join(process.cwd(), 'scripts', 'wallpaper-assets', 'out'));

if (!inputDir || !existsSync(inputDir)) {
  console.error('Missing --input folder with wallpaper MP4s');
  process.exit(1);
}

mkdirSync(join(outDir, 'catalog'), { recursive: true });
mkdirSync(join(outDir, 'wallpapers'), { recursive: true });

const files = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith('.mp4'));
if (files.length < 1) {
  console.error('No .mp4 files found in', inputDir);
  process.exit(1);
}

// Opt-in: --ffmpeg to generate thumbs/previews (slow on large masters).
const ffmpeg = process.argv.includes('--ffmpeg') && hasFfmpeg();
const catalog = [];
let sort = 0;

for (const file of files) {
  sort += 1;
  const abs = join(inputDir, file);
  const st = statSync(abs);
  const slug = slugify(file);
  const id = createHash('sha256').update(slug).digest('hex').slice(0, 32);
  // UUID-shaped deterministic id for seed inserts
  const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`;
  const wpDir = join(outDir, 'wallpapers', slug);
  mkdirSync(wpDir, { recursive: true });

  const sha256 = await sha256File(abs);
  const storagePath = `wallpapers/${slug}/wallpaper.mp4`;
  const thumbPath = `wallpapers/${slug}/thumbnail.webp`;
  const fallbackPath = `wallpapers/${slug}/fallback.webp`;
  const previewPath = `wallpapers/${slug}/preview.webm`;

  // Do not copy multi‑100MB masters into the repo tree by default (keeps installer small).
  // Upload tooling should read masters from --input. Write a pointer file instead.
  writeFileSync(join(wpDir, 'SOURCE.txt'), `source=${abs}\nstorage_path=${storagePath}\n`);

  if (ffmpeg) {
    spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        abs,
        '-ss',
        '00:00:02',
        '-vframes',
        '1',
        '-vf',
        'scale=480:-1',
        join(wpDir, 'fallback.webp'),
      ],
      { encoding: 'utf8' },
    );
    spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        abs,
        '-ss',
        '00:00:02',
        '-vframes',
        '1',
        '-vf',
        'scale=320:-1',
        join(wpDir, 'thumbnail.webp'),
      ],
      { encoding: 'utf8' },
    );
    spawnSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        abs,
        '-t',
        '3',
        '-an',
        '-vf',
        'scale=640:-1',
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '600k',
        join(wpDir, 'preview.webm'),
      ],
      { encoding: 'utf8' },
    );
  }

  const displayName = displayNameFromFile(file);
  const category = categoryFor(`${file} ${displayName}`);
  const entry = {
    id: uuid,
    slug,
    name: displayName,
    description: `Animated Workbench wallpaper (${category}).`,
    category,
    tags: [category, 'animated', 'video'],
    version: '1.0.0',
    author: 'VibeSpace',
    storage_path: storagePath,
    thumbnail_path: thumbPath,
    preview_path: previewPath,
    fallback_path: fallbackPath,
    size_bytes: st.size,
    width: 1920,
    height: 1080,
    format: 'mp4',
    engine_type: 'video',
    sha256,
    minimum_app_version: '0.1.48',
    performance_tier: st.size > 60_000_000 ? 'high' : st.size > 25_000_000 ? 'balanced' : 'low',
    featured: sort <= 6,
    active: true,
    sort_order: sort,
  };

  writeFileSync(join(wpDir, 'manifest.json'), JSON.stringify(entry, null, 2));
  catalog.push(entry);
}

const catalogDoc = {
  version: 1,
  generated_at: new Date().toISOString(),
  source_folder: inputDir,
  count: catalog.length,
  ffmpeg_thumbs: ffmpeg,
  wallpapers: catalog,
};

writeFileSync(join(outDir, 'catalog', 'catalog.json'), JSON.stringify(catalogDoc, null, 2));
writeFileSync(
  join(outDir, 'catalog', 'seed.sql'),
  catalog
    .map(
      (w) =>
        `insert into public.wallpapers (id, slug, name, description, category, tags, version, author, storage_path, thumbnail_path, preview_path, fallback_path, size_bytes, width, height, format, engine_type, sha256, performance_tier, featured, active, sort_order) values ('${w.id}'::uuid, '${w.slug}', ${sqlStr(w.name)}, ${sqlStr(w.description)}, '${w.category}', array[${w.tags.map(sqlStr).join(',')}], '${w.version}', '${w.author}', '${w.storage_path}', '${w.thumbnail_path}', '${w.preview_path}', '${w.fallback_path}', ${w.size_bytes}, ${w.width}, ${w.height}, '${w.format}', '${w.engine_type}', '${w.sha256}', '${w.performance_tier}', ${w.featured}, true, ${w.sort_order}) on conflict (slug) do update set name = excluded.name, size_bytes = excluded.size_bytes, sha256 = excluded.sha256, updated_at = now();`,
    )
    .join('\n'),
);

// Also emit a TS seed for offline catalog cache (metadata only, no binary).
writeFileSync(
  join(process.cwd(), 'app', 'src', 'features', 'wallpaper-library', 'catalogSeed.generated.ts'),
  `/* Auto-generated by scripts/prepare-wallpaper-assets.mjs — metadata only */\n` +
    `import type { CatalogWallpaper } from './types';\n` +
    `export const CATALOG_SEED: CatalogWallpaper[] = ${JSON.stringify(
      catalog.map(({ storage_path: _s, ...rest }) => rest),
      null,
      2,
    )} as unknown as CatalogWallpaper[];\n`,
);

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

console.log(`Prepared ${catalog.length} wallpapers → ${outDir}`);
console.log(`ffmpeg thumbs: ${ffmpeg ? 'yes' : 'no (install ffmpeg for previews)'}`);
if (catalog.length < 20) {
  console.warn(
    `Warning: only ${catalog.length} entries (goal asks for ≥20 when assets available).`,
  );
}
