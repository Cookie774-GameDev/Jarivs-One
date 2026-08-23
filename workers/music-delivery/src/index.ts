interface R2Object {
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  range?: { offset: number; length: number };
  body?: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: { range?: Headers }): Promise<R2Object | null>;
}

export interface Env {
  MUSIC: R2Bucket;
  ALLOWED_ORIGINS?: string;
}

const TRACK = /^\/v1\/tracks\/(music-[0-9]{3}-[0-9a-f]{12}-[a-z0-9-]+\.mp3)$/;

function cors(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('origin');
  const allowed = new Set((env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()));
  if (origin && allowed.has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return headers;
}

function error(request: Request, env: Env, status: number, code: string): Response {
  const headers = cors(request, env);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify({ ok: false, error: code }), { status, headers });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const result = error(request, env, 405, 'method_not_allowed');
    result.headers.set('allow', 'GET, HEAD');
    return result;
  }
  const match = TRACK.exec(new URL(request.url).pathname);
  if (!match) return error(request, env, 404, 'not_found');
  const key = `tracks/${match[1]}`;
  const object =
    request.method === 'HEAD'
      ? await env.MUSIC.head(key)
      : await env.MUSIC.get(key, { range: request.headers });
  if (!object) return error(request, env, 404, 'track_not_found');

  const headers = cors(request, env);
  object.writeHttpMetadata(headers);
  headers.set('content-type', object.httpMetadata?.contentType ?? 'audio/mpeg');
  headers.set('accept-ranges', 'bytes');
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  let status = 200;
  if (request.headers.has('range') && object.range) {
    const { offset, length } = object.range;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    status = 206;
  } else {
    headers.set('content-length', String(object.size));
  }
  return new Response(request.method === 'HEAD' ? null : (object.body ?? null), {
    status,
    headers,
  });
}

export default { fetch: handleRequest };
