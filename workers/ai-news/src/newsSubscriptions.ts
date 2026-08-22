import { boundedFetch, jsonResponse, nowIso, type Env } from './runtime';

const SOURCE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Creator subscription request is malformed.');
  }
  return value as Record<string, unknown>;
}

export function parseSubscriptionMutation(value: unknown): {
  sourceId: string;
  following: boolean;
} {
  const input = record(value);
  if (
    typeof input.sourceId !== 'string' ||
    !SOURCE_ID.test(input.sourceId) ||
    typeof input.following !== 'boolean'
  ) {
    throw new Error('Creator subscription request is malformed.');
  }
  return { sourceId: input.sourceId, following: input.following };
}

export function parseNotificationAcks(value: unknown): number[] {
  const input = record(value);
  if (!Array.isArray(input.ids) || input.ids.length > 50) {
    throw new Error('Notification acknowledgement is malformed.');
  }
  const ids = input.ids;
  if (ids.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)) {
    throw new Error('Notification acknowledgement is malformed.');
  }
  return [...new Set(ids as number[])].sort((left, right) => left - right);
}

async function requestJson(request: Request): Promise<unknown> {
  const declared = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > 16_384) throw new Error('Request body is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 16_384)
    throw new Error('Request body is too large.');
  return JSON.parse(text) as unknown;
}

async function authenticatedUser(request: Request, env: Env): Promise<string> {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!match || !supabaseUrl || !publishableKey) throw new Error('Authentication is required.');
  const userUrl = new URL('/auth/v1/user', supabaseUrl);
  const response = await boundedFetch(userUrl.toString(), {
    headers: {
      accept: 'application/json',
      apikey: publishableKey,
      authorization,
    },
    timeoutMs: 5_000,
    maxBytes: 64_000,
    maxRedirects: 0,
    retries: 0,
  });
  const payload = JSON.parse(response.text) as { id?: unknown };
  if (typeof payload.id !== 'string' || !UUID.test(payload.id))
    throw new Error('Authentication is required.');
  return payload.id;
}

export async function handleNewsSubscriptions(request: Request, env: Env): Promise<Response> {
  let userId: string;
  try {
    userId = await authenticatedUser(request, env);
  } catch {
    return jsonResponse({ error: 'AUTHENTICATION_REQUIRED' }, 401, { 'cache-control': 'no-store' });
  }

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT source_id FROM intelligence_news_creator_subscriptions
         WHERE user_id = ? ORDER BY source_id ASC`,
    )
      .bind(userId)
      .all<{ source_id: string }>();
    return jsonResponse({ sourceIds: rows.results.map((row) => row.source_id) }, 200, {
      'cache-control': 'no-store',
    });
  }
  if (request.method !== 'PUT') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const mutation = parseSubscriptionMutation(await requestJson(request));
    const source = await env.DB.prepare(
      `SELECT id FROM intelligence_news_sources
         WHERE id = ? AND enabled = 1 AND source_type <> 'github_releases' LIMIT 1`,
    )
      .bind(mutation.sourceId)
      .first<{ id: string }>();
    if (!source) return jsonResponse({ error: 'SOURCE_NOT_FOLLOWABLE' }, 404);
    const at = nowIso();
    if (mutation.following) {
      await env.DB.prepare(
        `INSERT INTO intelligence_news_creator_subscriptions
            (user_id, source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, source_id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
        .bind(userId, mutation.sourceId, at, at)
        .run();
    } else {
      await env.DB.prepare(
        'DELETE FROM intelligence_news_creator_subscriptions WHERE user_id = ? AND source_id = ?',
      )
        .bind(userId, mutation.sourceId)
        .run();
    }
    return jsonResponse({ sourceId: mutation.sourceId, following: mutation.following }, 200, {
      'cache-control': 'no-store',
    });
  } catch {
    return jsonResponse({ error: 'SUBSCRIPTION_REQUEST_INVALID' }, 400);
  }
}

export async function handleNewsNotifications(request: Request, env: Env): Promise<Response> {
  let userId: string;
  try {
    userId = await authenticatedUser(request, env);
  } catch {
    return jsonResponse({ error: 'AUTHENTICATION_REQUIRED' }, 401, { 'cache-control': 'no-store' });
  }
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT n.id, n.event_id, n.source_id, n.created_at, e.title, e.primary_url,
                e.published_at, s.company
         FROM intelligence_news_notifications n
         JOIN intelligence_news_events e ON e.id = n.event_id
         JOIN intelligence_news_sources s ON s.id = n.source_id
         WHERE n.user_id = ? AND n.acknowledged_at IS NULL
         ORDER BY n.created_at ASC, n.id ASC LIMIT 50`,
    )
      .bind(userId)
      .all<Record<string, unknown>>();
    return jsonResponse({ notifications: rows.results }, 200, { 'cache-control': 'no-store' });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const ids = parseNotificationAcks(await requestJson(request));
    if (ids.length) {
      await env.DB.prepare(
        `UPDATE intelligence_news_notifications SET acknowledged_at = ?
           WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      )
        .bind(nowIso(), userId, ...ids)
        .run();
    }
    return jsonResponse({ acknowledgedIds: ids }, 200, { 'cache-control': 'no-store' });
  } catch {
    return jsonResponse({ error: 'NOTIFICATION_ACK_INVALID' }, 400);
  }
}
