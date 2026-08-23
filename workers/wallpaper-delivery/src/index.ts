interface R2HttpMetadata {
  contentType?: string;
  contentDisposition?: string;
}

interface R2ObjectLike {
  size: number;
  httpEtag: string;
  httpMetadata?: R2HttpMetadata;
  range?: { offset: number; length: number };
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream;
}

interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string, options?: { range?: Headers }): Promise<R2ObjectBodyLike | R2ObjectLike | null>;
}

export interface Env {
  WALLPAPERS: R2BucketLike;
  WALLPAPER_DELIVERY_SIGNING_SECRET: string;
  ALLOWED_ORIGINS?: string;
}

const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ROUTE = /^\/v1\/wallpapers\/([a-z0-9](?:[a-z0-9-]{0,79}))\/master\.mp4$/;

function base64UrlBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '=';
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function payload(input: {
  storagePath: string;
  wallpaperId: string;
  sha256: string;
  expires: number;
}): string {
  return ['v1', input.storagePath, input.wallpaperId, input.sha256, String(input.expires)].join(
    '\n',
  );
}

async function validSignature(
  message: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const signatureBytes = base64UrlBytes(signature);
  if (!signatureBytes || secret.length < 32) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signatureBuffer = Uint8Array.from(signatureBytes).buffer;
  return crypto.subtle.verify('HMAC', key, signatureBuffer, encoder.encode(message));
}

function hasBody(object: R2ObjectLike): object is R2ObjectBodyLike {
  return 'body' in object && object.body instanceof ReadableStream;
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('origin');
  const allowed = new Set((env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()));
  if (origin && allowed.has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return headers;
}

function response(request: Request, env: Env, status: number, code: string): Response {
  const headers = corsHeaders(request, env);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify({ ok: false, error: code }), { status, headers });
}

export async function handleRequest(request: Request, env: Env, nowSeconds = Date.now() / 1000) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const denied = response(request, env, 405, 'method_not_allowed');
    denied.headers.set('allow', 'GET, HEAD');
    return denied;
  }

  const url = new URL(request.url);
  const match = ROUTE.exec(url.pathname);
  if (!match) return response(request, env, 404, 'not_found');

  const slug = match[1];
  const expires = Number(url.searchParams.get('expires'));
  const wallpaperId = url.searchParams.get('wallpaper_id') ?? '';
  const sha256 = (url.searchParams.get('sha256') ?? '').toLowerCase();
  const signature = url.searchParams.get('signature') ?? '';
  const now = Math.floor(nowSeconds);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + 300) {
    return response(request, env, 403, 'grant_expired');
  }
  if (!UUID.test(wallpaperId) || !SHA256.test(sha256)) {
    return response(request, env, 403, 'invalid_grant');
  }

  const storagePath = `wallpapers/${slug}/wallpaper.mp4`;
  const message = payload({ storagePath, wallpaperId, sha256, expires });
  if (!(await validSignature(message, signature, env.WALLPAPER_DELIVERY_SIGNING_SECRET))) {
    return response(request, env, 403, 'invalid_grant');
  }

  const object =
    request.method === 'HEAD'
      ? await env.WALLPAPERS.head(storagePath)
      : await env.WALLPAPERS.get(storagePath, { range: request.headers });
  if (!object) return response(request, env, 404, 'wallpaper_not_found');

  const headers = corsHeaders(request, env);
  object.writeHttpMetadata(headers);
  headers.set('content-type', object.httpMetadata?.contentType ?? 'video/mp4');
  headers.set('content-disposition', `attachment; filename="${slug}.mp4"`);
  headers.set('accept-ranges', 'bytes');
  headers.set('etag', object.httpEtag);
  headers.set('x-vibespace-sha256', sha256);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');

  let status = 200;
  if (
    request.headers.has('range') &&
    object.range &&
    'offset' in object.range &&
    'length' in object.range
  ) {
    const { offset, length } = object.range;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    status = 206;
  } else {
    headers.set('content-length', String(object.size));
  }

  const body = request.method === 'HEAD' || !hasBody(object) ? null : object.body;
  return new Response(body, { status, headers });
}

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
};
