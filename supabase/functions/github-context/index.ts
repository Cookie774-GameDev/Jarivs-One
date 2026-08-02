// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import { createGitHubContextProxy } from '../_shared/githubContextProxy.ts';

const GITHUB_API = 'https://api.github.com';
const MAX_UPSTREAM_BYTES = 32 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'tauri://localhost';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

function json(origin: string | null, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_');
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining >>>= 8) {
    bytes.unshift(remaining & 0xff);
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function der(tag: number, body: Uint8Array): Uint8Array {
  const length = derLength(body.length);
  const output = new Uint8Array(1 + length.length + body.length);
  output[0] = tag;
  output.set(length, 1);
  output.set(body, 1 + length.length);
  return output;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaAlgorithm = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  return der(0x30, concat(version, rsaAlgorithm, der(0x04, pkcs1)));
}

function decodePrivateKey(raw: string): Uint8Array {
  const pem = raw.replace(/\\n/gu, '\n').trim();
  const pkcs8Match = pem.match(
    /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PRIVATE KEY-----$/u,
  );
  const pkcs1Match = pem.match(
    /^-----BEGIN RSA PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END RSA PRIVATE KEY-----$/u,
  );
  const match = pkcs8Match ?? pkcs1Match;
  if (!match) throw new Error('github_context_configuration_invalid');
  let binary: string;
  try {
    binary = atob(match[1].replace(/\s/gu, ''));
  } catch {
    throw new Error('github_context_configuration_invalid');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return pkcs8Match ? bytes : pkcs1ToPkcs8(bytes);
}

async function createAppJwt(appId: string, privateKey: string, now: number): Promise<string> {
  if (!/^[1-9]\d{0,15}$/u.test(appId)) {
    throw new Error('github_context_configuration_invalid');
  }
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const nowSeconds = Math.floor(now / 1_000);
  const payload = base64Url(
    encoder.encode(
      JSON.stringify({
        iat: nowSeconds - 30,
        exp: nowSeconds + 540,
        iss: appId,
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePrivateKey(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function githubJson(
  path: string,
  authorization: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_BYTES)) {
    throw new Error('github_context_upstream_failed');
  }
  const text = await response.text();
  if (text.length > MAX_UPSTREAM_BYTES) {
    throw new Error('github_context_upstream_failed');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('github_context_upstream_failed');
  }
}

function githubIdentityId(user: unknown): string | null {
  if (!user || typeof user !== 'object' || !Array.isArray(user.identities)) return null;
  const identity = user.identities.find(
    (candidate: unknown) =>
      candidate &&
      typeof candidate === 'object' &&
      candidate.provider === 'github' &&
      candidate.identity_data &&
      typeof candidate.identity_data === 'object',
  );
  if (!identity) return null;
  const candidates = [identity.identity_data.sub, identity.identity_data.provider_id, identity.id];
  for (const candidate of candidates) {
    const normalized =
      typeof candidate === 'number' && Number.isSafeInteger(candidate)
        ? String(candidate)
        : candidate;
    if (typeof normalized === 'string' && /^[1-9]\d{0,15}$/u.test(normalized)) {
      return normalized;
    }
  }
  return null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'method_not_allowed' }, 405);

  const authorization =
    request.headers.get('authorization') ?? request.headers.get('Authorization');
  const jwt = authorization?.match(/^Bearer\s+([^\s]+)$/iu)?.[1];
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!jwt || !supabaseUrl || !supabaseAnonKey) {
    return json(origin, { error: 'unauthorized' }, 401);
  }

  let data: unknown;
  let authError: unknown;
  try {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authResult = await authClient.auth.getUser(jwt);
    data = authResult.data;
    authError = authResult.error;
  } catch {
    return json(origin, { error: 'unauthorized' }, 401);
  }
  const githubUserId = githubIdentityId(data?.user);
  if (authError || !data?.user?.id || !githubUserId) {
    return json(origin, { error: 'github_identity_required' }, 401);
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return json(origin, { error: 'github_context_request_invalid' }, 400);
  }
  let rawRequest: unknown;
  try {
    const body = await request.text();
    if (body.length > 4_096) throw new Error('too_large');
    rawRequest = JSON.parse(body);
  } catch {
    return json(origin, { error: 'github_context_request_invalid' }, 400);
  }

  const appId = Deno.env.get('GITHUB_APP_ID');
  const privateKey = Deno.env.get('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !privateKey) {
    return json(origin, { error: 'github_context_unavailable' }, 503);
  }

  try {
    const appJwt = createAppJwt(appId, privateKey, Date.now());
    const proxy = createGitHubContextProxy({
      now: Date.now,
      getInstallation: async (installationId: string) =>
        githubJson(`/app/installations/${installationId}`, `Bearer ${await appJwt}`),
      createInstallationToken: async ({
        installationId,
        repositoryIds,
      }: {
        installationId: string;
        repositoryIds: string[] | undefined;
      }) =>
        githubJson(`/app/installations/${installationId}/access_tokens`, `Bearer ${await appJwt}`, {
          method: 'POST',
          body: JSON.stringify({
            permissions: { contents: 'read', metadata: 'read' },
            ...(repositoryIds ? { repository_ids: repositoryIds.map((id) => Number(id)) } : {}),
          }),
        }),
      githubRequest: async ({ token, path }: { token: string; path: string }) =>
        githubJson(path, `Bearer ${token}`),
    });
    const result = await proxy.execute({ userId: data.user.id, githubUserId }, rawRequest);
    return json(origin, result);
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : '';
    if (code === 'github_context_request_invalid') {
      return json(origin, { error: 'github_context_request_invalid' }, 400);
    }
    if (
      code === 'github_context_installation_forbidden' ||
      code === 'github_context_repository_forbidden' ||
      code === 'github_context_permissions_invalid'
    ) {
      return json(origin, { error: 'github_context_forbidden' }, 403);
    }
    if (code === 'github_context_configuration_invalid') {
      return json(origin, { error: 'github_context_unavailable' }, 503);
    }
    return json(origin, { error: 'github_context_upstream_failed' }, 502);
  }
});
