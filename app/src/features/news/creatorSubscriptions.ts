import { getSupabaseClient } from '@/lib/supabase';

type FetchLike = typeof fetch;

export interface CreatorNotification {
  id: number;
  eventId: string;
  sourceId: string;
  title: string;
  company: string;
  url: string;
  publishedAt: string;
}

async function accessToken(): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sign in with cloud sync to follow creators.');
  const { data, error } = await client.auth.getSession();
  const token = data.session?.access_token?.trim();
  if (error || !token) throw new Error('Sign in with cloud sync to follow creators.');
  return token;
}

async function authenticatedJson(
  origin: string,
  path: string,
  init: RequestInit,
  fetcher: FetchLike = fetch,
): Promise<unknown> {
  const token = await accessToken();
  const response = await fetcher(new URL(path, origin), {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Creator alerts could not be updated (${response.status}).`);
  return response.json();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Creator alert response is malformed.');
  }
  return value as Record<string, unknown>;
}

export async function fetchCreatorSubscriptions(origin: string): Promise<string[]> {
  const root = record(
    await authenticatedJson(origin, '/api/news/subscriptions', { method: 'GET' }),
  );
  if (!Array.isArray(root.sourceIds) || root.sourceIds.some((id) => typeof id !== 'string')) {
    throw new Error('Creator alert response is malformed.');
  }
  return [...new Set(root.sourceIds as string[])].sort();
}

export async function setCreatorSubscription(
  origin: string,
  sourceId: string,
  following: boolean,
): Promise<void> {
  const root = record(
    await authenticatedJson(origin, '/api/news/subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ sourceId, following }),
    }),
  );
  if (root.sourceId !== sourceId || root.following !== following) {
    throw new Error('Creator alert response is malformed.');
  }
}

export async function fetchCreatorNotifications(origin: string): Promise<CreatorNotification[]> {
  const root = record(
    await authenticatedJson(origin, '/api/news/notifications', { method: 'GET' }),
  );
  if (!Array.isArray(root.notifications)) throw new Error('Creator alert response is malformed.');
  return root.notifications.map((value) => {
    const row = record(value);
    if (
      typeof row.id !== 'number' ||
      !Number.isSafeInteger(row.id) ||
      typeof row.event_id !== 'string' ||
      typeof row.source_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.company !== 'string' ||
      typeof row.primary_url !== 'string' ||
      typeof row.published_at !== 'string'
    ) {
      throw new Error('Creator alert response is malformed.');
    }
    return {
      id: row.id,
      eventId: row.event_id,
      sourceId: row.source_id,
      title: row.title,
      company: row.company,
      url: row.primary_url,
      publishedAt: row.published_at,
    };
  });
}

export async function acknowledgeCreatorNotifications(
  origin: string,
  ids: readonly number[],
): Promise<void> {
  if (!ids.length) return;
  await authenticatedJson(origin, '/api/news/notifications', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}
