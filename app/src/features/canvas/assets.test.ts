import { describe, expect, it } from 'vitest';
import {
  CANVAS_ASSET_EXPORT_FORMATS,
  CANVAS_ASSET_SOURCE_KINDS,
  CANVAS_IMAGE_FIT_MODES,
  CanvasAssetError,
  type CanvasAssetExportFormat,
  type CanvasImageTransformPatch,
  assertAssetScope,
  createCanvasImage,
  exportImageMetadata,
  isAssetInScope,
  isCanvasAsset,
  markAssetMissing,
  replaceImageSource,
  restoreAsset,
  transformCanvasImage,
  validateCanvasAsset,
} from './assets';
import { CANVAS_MAX_ASSET_BYTES } from './security';
import { CanvasSecurityError } from './security';

const digest = (char: string): string => char.repeat(64);

const validChecksum = { algorithm: 'sha-256' as const, digest: digest('a') };

const validOrigin = {
  sourceKind: 'remote' as const,
  source: 'https://cdn.example.com/img/photo.png',
  mimeType: 'image/png',
  filename: 'photo.png',
  byteSize: 2048,
  checksum: validChecksum,
  width: 640,
  height: 480,
};

const validAssetInput = {
  id: 'asset_1',
  projectId: 'proj_1',
  ownerId: 'owner_1',
  original: validOrigin,
  missing: false,
  thumbnail: null,
  altText: 'A calm lake photo',
  annotations: [],
  open: null,
  export: null,
  createdAt: 1_000,
};

const scope = { projectId: 'proj_1', ownerId: 'owner_1' };

describe('canvas asset reference validation', () => {
  it('builds a deeply frozen reference with stable identity and scope', () => {
    const reference = validateCanvasAsset(validAssetInput);

    expect(reference.id).toBe('asset_1');
    expect(reference.projectId).toBe('proj_1');
    expect(reference.ownerId).toBe('owner_1');
    expect(reference.original.mimeType).toBe('image/png');
    expect(reference.original.byteSize).toBe(2048);
    expect(reference.original.width).toBe(640);
    expect(reference.original.height).toBe(480);
    expect(reference.original.durationMs).toBeNull();
    expect(reference.missing).toBe(false);
    expect(reference.altText).toBe('A calm lake photo');
    expect(reference.createdAt).toBe(1_000);
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.original)).toBe(true);
    expect(Object.isFrozen(reference.annotations)).toBe(true);
  });

  it('normalizes safe local sources through the import-path primitive', () => {
    const reference = validateCanvasAsset({
      ...validAssetInput,
      original: { ...validOrigin, sourceKind: 'local', source: 'media/photo.png' },
    });

    expect(reference.original.sourceKind).toBe('local');
    expect(reference.original.source).toBe('media/photo.png');
  });

  it('exposes the supported source kinds', () => {
    expect(CANVAS_ASSET_SOURCE_KINDS).toEqual(['local', 'remote']);
  });

  it('accepts a bounded duration when present', () => {
    const reference = validateCanvasAsset({
      ...validAssetInput,
      original: { ...validOrigin, durationMs: 12_000 },
    });

    expect(reference.original.durationMs).toBe(12_000);
  });

  it('preserves checksum and thumbnail references without embedding bytes', () => {
    const reference = validateCanvasAsset({
      ...validAssetInput,
      thumbnail: {
        assetId: 'thumb_1',
        source: 'https://cdn.example.com/img/photo-small.png',
        checksum: { algorithm: 'sha-256', digest: digest('b') },
        width: 160,
        height: 120,
      },
    });

    expect(reference.thumbnail?.assetId).toBe('thumb_1');
    expect(reference.thumbnail?.width).toBe(160);
    expect(reference.original.checksum.digest).toBe(digest('a'));
    for (const key of Object.keys(reference)) {
      expect(['data', 'bytes', 'base64', 'payload']).not.toContain(key);
    }
  });

  it('validates annotations as bounded printable text', () => {
    const reference = validateCanvasAsset({
      ...validAssetInput,
      annotations: [{ id: 'note_1', text: 'Needs review', createdAt: 1_500 }],
    });

    expect(reference.annotations).toHaveLength(1);
    expect(reference.annotations[0]?.text).toBe('Needs review');
  });

  it('treats input as a predicate without throwing', () => {
    expect(isCanvasAsset(validAssetInput)).toBe(true);
    expect(isCanvasAsset({ ...validAssetInput, id: '!!bad!!' })).toBe(false);
  });

  it.each([
    ['javascript remote source', { ...validOrigin, source: 'javascript:alert(1)' }],
    ['data uri source', { ...validOrigin, source: 'data:image/png;base64,AAAA' }],
    ['file scheme source', { ...validOrigin, source: 'file:///etc/passwd' }],
    [
      'traversal local source',
      { ...validOrigin, sourceKind: 'local', source: '../secrets/photo.png' },
    ],
    ['unsupported mime type', { ...validOrigin, mimeType: 'image/svg+xml' }],
    ['oversized byte size', { ...validOrigin, byteSize: CANVAS_MAX_ASSET_BYTES + 1 }],
    ['non-positive byte size', { ...validOrigin, byteSize: 0 }],
    ['oversized dimension', { ...validOrigin, width: 99_999 }],
  ])('fails closed through security primitives for %s', (_label, original) => {
    expect(() => validateCanvasAsset({ ...validAssetInput, original })).toThrow(
      CanvasSecurityError,
    );
  });

  it.each([
    ['bad checksum digest', { ...validChecksum, digest: 'xyz' }],
    ['uppercase digest', { ...validChecksum, digest: digest('A') }],
    ['unknown checksum algorithm', { algorithm: 'md5', digest: digest('a') }],
  ])('fails closed for %s', (_label, checksum) => {
    expect(() =>
      validateCanvasAsset({ ...validAssetInput, original: { ...validOrigin, checksum } }),
    ).toThrow(CanvasAssetError);
  });

  it.each([
    ['invalid id', { ...validAssetInput, id: '!!bad!!' }],
    ['invalid project id', { ...validAssetInput, projectId: '' }],
    ['invalid owner id', { ...validAssetInput, ownerId: 'owner 1' }],
    ['unknown top-level field', { ...validAssetInput, extra: 1 }],
    ['control char alt text', { ...validAssetInput, altText: 'bad\u0000text' }],
    [
      'filename with separator',
      { ...validAssetInput, original: { ...validOrigin, filename: 'a/b.png' } },
    ],
    ['negative duration', { ...validAssetInput, original: { ...validOrigin, durationMs: -5 } }],
    ['negative timestamp', { ...validAssetInput, createdAt: -1 }],
  ])('fails closed for %s', (_label, input) => {
    expect(() => validateCanvasAsset(input)).toThrow(CanvasAssetError);
  });
});

describe('canvas asset missing state', () => {
  it('toggles missing state immutably while preserving identity', () => {
    const reference = validateCanvasAsset(validAssetInput);

    const missing = markAssetMissing(reference);
    expect(missing.missing).toBe(true);
    expect(missing.id).toBe(reference.id);
    expect(missing.original.checksum.digest).toBe(reference.original.checksum.digest);
    expect(reference.missing).toBe(false);

    const restored = restoreAsset(missing);
    expect(restored.missing).toBe(false);
    expect(missing.missing).toBe(true);
  });

  it('returns the same reference when the missing flag is unchanged', () => {
    const reference = validateCanvasAsset(validAssetInput);
    expect(restoreAsset(reference)).toBe(reference);
    expect(markAssetMissing(markAssetMissing(reference)).missing).toBe(true);
  });
});

describe('canvas asset scope isolation', () => {
  it('accepts a matching project and owner scope', () => {
    const reference = validateCanvasAsset(validAssetInput);
    expect(assertAssetScope(reference, scope)).toBe(reference);
    expect(isAssetInScope(reference, scope)).toBe(true);
  });

  it.each([
    ['other project', { projectId: 'proj_2', ownerId: 'owner_1' }],
    ['other owner', { projectId: 'proj_1', ownerId: 'owner_2' }],
  ])('fails closed for %s scope', (_label, other) => {
    const reference = validateCanvasAsset(validAssetInput);
    expect(() => assertAssetScope(reference, other)).toThrow(CanvasAssetError);
    expect(isAssetInScope(reference, other)).toBe(false);
  });
});

describe('canvas image transforms', () => {
  const imageAsset = validateCanvasAsset(validAssetInput);

  it('creates an identity transform for a present image asset', () => {
    const state = createCanvasImage(imageAsset);

    expect(state.asset.id).toBe('asset_1');
    expect(state.transform.resizeWidth).toBeNull();
    expect(state.transform.resizeHeight).toBeNull();
    expect(state.transform.fitMode).toBe('fit');
    expect(state.transform.crop).toBeNull();
    expect(state.transform.rotation).toBe(0);
    expect(state.transform.opacity).toBe(1);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.transform)).toBe(true);
  });

  it('rejects non-image assets and missing assets', () => {
    const textAsset = validateCanvasAsset({
      ...validAssetInput,
      id: 'asset_text',
      original: {
        ...validOrigin,
        mimeType: 'text/plain',
        filename: 'notes.txt',
        source: 'notes.txt',
        sourceKind: 'local',
        width: null,
        height: null,
      },
    });
    expect(() => createCanvasImage(textAsset)).toThrow(CanvasAssetError);
    expect(() => createCanvasImage(markAssetMissing(imageAsset))).toThrow(CanvasAssetError);
  });

  it('applies resize, rotation, opacity and fit immutably', () => {
    const state = createCanvasImage(imageAsset);

    const resized = transformCanvasImage(state, {
      resizeWidth: 320,
      resizeHeight: 240,
      fitMode: 'fill',
      rotation: 90,
      opacity: 0.5,
    });

    expect(resized.transform.resizeWidth).toBe(320);
    expect(resized.transform.resizeHeight).toBe(240);
    expect(resized.transform.fitMode).toBe('fill');
    expect(resized.transform.rotation).toBe(90);
    expect(resized.transform.opacity).toBe(0.5);
    expect(state.transform.resizeWidth).toBeNull();
    expect(state.transform.opacity).toBe(1);
    expect(resized).not.toBe(state);
  });

  it('applies a normalized crop and clears it with null', () => {
    const state = createCanvasImage(imageAsset);
    const cropped = transformCanvasImage(state, {
      crop: { left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 },
    });

    expect(cropped.transform.crop).toEqual({ left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 });
    expect(transformCanvasImage(cropped, { crop: null }).transform.crop).toBeNull();
  });

  it.each([
    ['crop out of bounds', { crop: { left: -0.1, top: 0, right: 1, bottom: 1 } }],
    ['crop left >= right', { crop: { left: 0.8, top: 0, right: 0.2, bottom: 1 } }],
    ['rotation out of range', { rotation: 720 }],
    ['opacity above one', { opacity: 1.5 }],
    ['opacity below zero', { opacity: -0.1 }],
    ['non-finite resize', { resizeWidth: Number.NaN }],
    ['non-positive resize', { resizeHeight: 0 }],
    ['invalid fit mode', { fitMode: 'stretch' }],
  ])('fails closed for %s', (_label, patch) => {
    const state = createCanvasImage(imageAsset);
    expect(() => transformCanvasImage(state, patch as CanvasImageTransformPatch)).toThrow(
      CanvasAssetError,
    );
  });

  it('refuses to transform a missing asset', () => {
    const state = createCanvasImage(imageAsset);
    const missingState = { ...state, asset: markAssetMissing(imageAsset) };
    expect(() => transformCanvasImage(missingState, { opacity: 0.5 })).toThrow(CanvasAssetError);
  });

  it('replaces the source while preserving the transform and scope', () => {
    const state = transformCanvasImage(createCanvasImage(imageAsset), { opacity: 0.4 });
    const replacement = validateCanvasAsset({
      ...validAssetInput,
      id: 'asset_2',
      original: {
        ...validOrigin,
        source: 'https://cdn.example.com/img/other.png',
        filename: 'other.png',
      },
    });

    const replaced = replaceImageSource(state, replacement);
    expect(replaced.asset.id).toBe('asset_2');
    expect(replaced.transform.opacity).toBe(0.4);
    expect(state.asset.id).toBe('asset_1');
  });

  it('rejects replace-source across scopes, missing targets, or non-images', () => {
    const state = createCanvasImage(imageAsset);
    const otherScope = validateCanvasAsset({
      ...validAssetInput,
      id: 'asset_3',
      projectId: 'proj_2',
    });
    const textAsset = validateCanvasAsset({
      ...validAssetInput,
      id: 'asset_4',
      original: {
        ...validOrigin,
        mimeType: 'text/plain',
        filename: 'n.txt',
        source: 'n.txt',
        sourceKind: 'local',
        width: null,
        height: null,
      },
    });

    expect(() => replaceImageSource(state, otherScope)).toThrow(CanvasAssetError);
    expect(() => replaceImageSource(state, markAssetMissing(imageAsset))).toThrow(CanvasAssetError);
    expect(() => replaceImageSource(state, textAsset)).toThrow(CanvasAssetError);
  });
});

describe('canvas image export metadata', () => {
  const imageAsset = validateCanvasAsset(validAssetInput);

  it('derives safe export metadata without binary payloads', () => {
    const state = createCanvasImage(imageAsset);
    const metadata = exportImageMetadata(state);

    expect(CANVAS_ASSET_EXPORT_FORMATS).toContain(metadata.format);
    expect(metadata.filename.length).toBeGreaterThan(0);
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(480);
    for (const key of Object.keys(metadata)) {
      expect(['data', 'bytes', 'base64', 'payload']).not.toContain(key);
    }
  });

  it('uses resize dimensions and swaps them for quarter-turn rotations', () => {
    const state = transformCanvasImage(createCanvasImage(imageAsset), {
      resizeWidth: 100,
      resizeHeight: 50,
      rotation: 90,
    });
    const metadata = exportImageMetadata(state, 'png');

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(50);
    expect(metadata.height).toBe(100);
    expect(metadata.filename.endsWith('.png')).toBe(true);
  });

  it('rejects unsupported export formats', () => {
    const state = createCanvasImage(imageAsset);
    expect(() => exportImageMetadata(state, 'bmp' as unknown as CanvasAssetExportFormat)).toThrow(
      CanvasAssetError,
    );
  });

  it('exposes the supported fit modes', () => {
    expect(CANVAS_IMAGE_FIT_MODES).toEqual(['fit', 'fill']);
  });
});
