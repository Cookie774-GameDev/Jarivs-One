import { describe, expect, it } from 'vitest';
import { createWallpaperDeliveryUrl, wallpaperStoragePath } from './wallpaperR2';

const secret = 'test-only-signing-secret-with-at-least-32-characters';

describe('wallpaper R2 delivery grant', () => {
  it('creates a bounded signed HTTPS URL for the exact catalog object', async () => {
    const result = await createWallpaperDeliveryUrl({
      baseUrl: 'https://wallpapers.example.workers.dev',
      signingSecret: secret,
      wallpaperId: 'd2baebf7-25d9-4fe9-a482-65cfbf1decc2',
      slug: '1769778778',
      storagePath: 'wallpapers/1769778778/wallpaper.mp4',
      sha256: 'a'.repeat(64),
      ttlSeconds: 120,
      nowSeconds: 1_800_000_000,
    });
    const url = new URL(result.downloadUrl);
    expect(url.pathname).toBe('/v1/wallpapers/1769778778/master.mp4');
    expect(url.searchParams.get('expires')).toBe('1800000120');
    expect(url.searchParams.get('signature')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresInSeconds).toBe(120);
  });

  it('rejects a catalog path that does not match the selected slug', async () => {
    await expect(
      createWallpaperDeliveryUrl({
        baseUrl: 'https://wallpapers.example.workers.dev',
        signingSecret: secret,
        wallpaperId: 'd2baebf7-25d9-4fe9-a482-65cfbf1decc2',
        slug: 'safe-slug',
        storagePath: 'wallpapers/other/wallpaper.mp4',
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow('storage_path_mismatch');
  });

  it('rejects traversal and non-HTTPS delivery bases', async () => {
    expect(() => wallpaperStoragePath('../private')).toThrow('invalid_wallpaper_slug');
    await expect(
      createWallpaperDeliveryUrl({
        baseUrl: 'http://wallpapers.example.test',
        signingSecret: secret,
        wallpaperId: 'd2baebf7-25d9-4fe9-a482-65cfbf1decc2',
        slug: 'safe-slug',
        storagePath: 'wallpapers/safe-slug/wallpaper.mp4',
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow('delivery_base_url_must_be_https');
  });
});
