import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession: auth.getSession } }),
}));

import {
  acknowledgeCreatorNotifications,
  fetchCreatorNotifications,
  fetchCreatorSubscriptions,
  setCreatorSubscription,
} from './creatorSubscriptions';

describe('creator subscription client', () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'account-token' } },
      error: null,
    });
  });

  it('preserves the authenticated exact source through follow and unfollow', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer account-token');
      const body = JSON.parse(String(init?.body)) as { sourceId: string; following: boolean };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    await setCreatorSubscription('https://news.example', 'openai-youtube', true);
    await setCreatorSubscription('https://news.example', 'openai-youtube', false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('loads persisted follows and acknowledges exact notification IDs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sourceIds: ['openai-youtube'] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [
              {
                id: 7,
                event_id: 'event-1',
                source_id: 'openai-youtube',
                title: 'New model briefing',
                company: 'OpenAI',
                primary_url: 'https://openai.com/news/example',
                published_at: '2026-08-22T01:00:00Z',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ acknowledgedIds: [7] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetcher);

    await expect(fetchCreatorSubscriptions('https://news.example')).resolves.toEqual([
      'openai-youtube',
    ]);
    const notifications = await fetchCreatorNotifications('https://news.example');
    expect(notifications[0]).toMatchObject({ id: 7, sourceId: 'openai-youtube' });
    await acknowledgeCreatorNotifications(
      'https://news.example',
      notifications.map((item) => item.id),
    );
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' });
  });
});
