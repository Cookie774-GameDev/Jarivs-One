import { createWallpaperDeliveryUrl } from '../../../supabase/functions/_shared/wallpaperR2';
import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../src/index';

const secret = 'test-only-signing-secret-with-at-least-32-characters';
const wallpaperId = 'd2baebf7-25d9-4fe9-a482-65cfbf1decc2';
const slug = '1769778778';
const sha256 = 'a'.repeat(64);
const now = 1_800_000_000;

function object(range?: { offset: number; length: number }) {
  return {
    size: 1000,
    httpEtag: '"etag"',
    httpMetadata: { contentType: 'video/mp4' },
    range,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    }),
    writeHttpMetadata(headers: Headers) {
      headers.set('content-type', 'video/mp4');
    },
  };
}

function env(value = object()): Env {
  return {
    WALLPAPER_DELIVERY_SIGNING_SECRET: secret,
    ALLOWED_ORIGINS: 'http://tauri.localhost',
    WALLPAPERS: {
      head: vi.fn().mockResolvedValue(value),
      get: vi.fn().mockResolvedValue(value),
    },
  };
}

async function signedUrl() {
  return (
    await createWallpaperDeliveryUrl({
      baseUrl: 'https://wallpapers.example.workers.dev',
      signingSecret: secret,
      wallpaperId,
      slug,
      storagePath: `wallpapers/${slug}/wallpaper.mp4`,
      sha256,
      ttlSeconds: 120,
      nowSeconds: now,
    })
  ).downloadUrl;
}

describe('wallpaper delivery worker', () => {
  it('rejects anonymous, expired, tampered, and traversal requests before R2 access', async () => {
    const target = env();
    expect(
      (
        await handleRequest(
          new Request('https://worker.test/v1/wallpapers/x/master.mp4'),
          target,
          now,
        )
      ).status,
    ).toBe(403);

    const expired = new URL(await signedUrl());
    expect((await handleRequest(new Request(expired), target, now + 121)).status).toBe(403);

    const tampered = new URL(await signedUrl());
    tampered.searchParams.set('sha256', 'b'.repeat(64));
    expect((await handleRequest(new Request(tampered), target, now)).status).toBe(403);

    const traversal = new URL(await signedUrl());
    traversal.pathname = '/v1/wallpapers/../private/master.mp4';
    expect((await handleRequest(new Request(traversal), target, now)).status).toBe(404);
    expect(target.WALLPAPERS.get).not.toHaveBeenCalled();
  });

  it('streams the exact object with private integrity headers', async () => {
    const target = env();
    const request = new Request(await signedUrl(), {
      headers: { Origin: 'http://tauri.localhost' },
    });
    const result = await handleRequest(request, target, now);
    expect(result.status).toBe(200);
    expect(result.headers.get('content-length')).toBe('1000');
    expect(result.headers.get('x-vibespace-sha256')).toBe(sha256);
    expect(result.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost');
    expect(target.WALLPAPERS.get).toHaveBeenCalledWith(`wallpapers/${slug}/wallpaper.mp4`, {
      range: request.headers,
    });
  });

  it('supports HEAD and resolved byte ranges without returning duplicate bodies', async () => {
    // Cloudflare may expose a resolved full-object range on HEAD even without a
    // Range request. That must remain a normal 200 response.
    const headTarget = env(object({ offset: 0, length: 1000 }));
    const head = await handleRequest(
      new Request(await signedUrl(), { method: 'HEAD' }),
      headTarget,
      now,
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(headTarget.WALLPAPERS.head).toHaveBeenCalledTimes(1);

    const rangeTarget = env(object({ offset: 100, length: 200 }));
    const ranged = await handleRequest(
      new Request(await signedUrl(), { headers: { Range: 'bytes=100-299' } }),
      rangeTarget,
      now,
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 100-299/1000');
    expect(ranged.headers.get('content-length')).toBe('200');
  });
});
