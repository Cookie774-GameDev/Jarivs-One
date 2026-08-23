const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function isWallpaperSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,79})$/.test(value);
}

export function wallpaperStoragePath(slug: string): string {
  if (!isWallpaperSlug(slug)) throw new Error('invalid_wallpaper_slug');
  return `wallpapers/${slug}/wallpaper.mp4`;
}

export function wallpaperGrantPayload(input: {
  storagePath: string;
  wallpaperId: string;
  sha256: string;
  expires: number;
}): string {
  return ['v1', input.storagePath, input.wallpaperId, input.sha256, String(input.expires)].join(
    '\n',
  );
}

export async function signWallpaperGrant(payload: string, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error('delivery_signing_secret_invalid');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

export async function createWallpaperDeliveryUrl(input: {
  baseUrl: string;
  signingSecret: string;
  wallpaperId: string;
  slug: string;
  storagePath: string;
  sha256: string;
  ttlSeconds?: number;
  nowSeconds?: number;
}): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
  const expectedPath = wallpaperStoragePath(input.slug);
  if (input.storagePath !== expectedPath) throw new Error('storage_path_mismatch');
  if (!/^[0-9a-f]{64}$/i.test(input.sha256)) throw new Error('invalid_wallpaper_sha256');
  if (!/^[0-9a-f-]{36}$/i.test(input.wallpaperId)) throw new Error('invalid_wallpaper_id');

  const base = new URL(input.baseUrl);
  if (base.protocol !== 'https:') throw new Error('delivery_base_url_must_be_https');
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 120, 30), 300);
  const expires = Math.floor(input.nowSeconds ?? Date.now() / 1000) + ttl;
  const payload = wallpaperGrantPayload({
    storagePath: expectedPath,
    wallpaperId: input.wallpaperId,
    sha256: input.sha256.toLowerCase(),
    expires,
  });
  const signature = await signWallpaperGrant(payload, input.signingSecret);
  const url = new URL(`/v1/wallpapers/${encodeURIComponent(input.slug)}/master.mp4`, base);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('wallpaper_id', input.wallpaperId);
  url.searchParams.set('sha256', input.sha256.toLowerCase());
  url.searchParams.set('signature', signature);
  return { downloadUrl: url.toString(), expiresInSeconds: ttl };
}
