import { getSupabaseClient } from '@/lib/supabase/client';
import type { Json, PublicProfileStatusCard } from '@/lib/supabase/types';

export const PUBLIC_STATUS_METRICS = [
  'activeTimeMs',
  'totalTokens',
  'messagesWritten',
  'charactersTyped',
  'completed',
  'tokensSaved',
  'streakDays',
  'topModel',
  'topProvider',
  'topSurface',
] as const;

export type PublicStatusMetric = (typeof PUBLIC_STATUS_METRICS)[number];
export type PublicStatusValues = Partial<Record<PublicStatusMetric, string | number>>;

export type PublishPublicStatusInput = {
  accountId: string;
  slug: string;
  displayName: string;
  headline?: string;
  avatarSeed?: string;
  selectedMetrics: PublicStatusValues;
};

const SLUG = /^[a-z0-9][a-z0-9-]{2,47}$/;
const ALLOWED = new Set<string>(PUBLIC_STATUS_METRICS);

export function normalizePublicStatusInput(input: PublishPublicStatusInput) {
  const accountId = input.accountId.trim();
  const slug = input.slug.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!accountId || !SLUG.test(slug))
    throw new Error('Use a 3–48 character lowercase profile link.');
  if (!displayName || displayName.length > 80)
    throw new Error('Display name must be 1–80 characters.');
  const headline = input.headline?.trim() || null;
  if (headline && headline.length > 160)
    throw new Error('Headline must be 160 characters or fewer.');
  const avatarSeed = input.avatarSeed?.trim() || null;
  if (avatarSeed && avatarSeed.length > 80) throw new Error('Avatar choice is too long.');

  const selectedMetrics: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input.selectedMetrics)) {
    if (!ALLOWED.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      selectedMetrics[key] = value;
    if (typeof value === 'string' && value.trim() && value.length <= 120)
      selectedMetrics[key] = value.trim();
  }
  return { accountId, slug, displayName, headline, avatarSeed, selectedMetrics };
}

export async function publishPublicStatusSnapshot(
  input: PublishPublicStatusInput,
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud sharing is not configured in this build.');
  const normalized = normalizePublicStatusInput(input);
  const { error } = await client.from('public_profile_status').upsert(
    {
      user_id: normalized.accountId,
      slug: normalized.slug,
      visible: true,
      display_name: normalized.displayName,
      headline: normalized.headline,
      avatar_seed: normalized.avatarSeed,
      selected_metrics: normalized.selectedMetrics as Json,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message || 'Could not publish this status card.');
  return normalized.slug;
}

export async function unpublishPublicStatusSnapshot(accountId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud sharing is not configured in this build.');
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) throw new Error('Sign in before changing a public status card.');
  const { error } = await client
    .from('public_profile_status')
    .update({ visible: false })
    .eq('user_id', normalizedAccountId);
  if (error) throw new Error(error.message || 'Could not hide this status card.');
}

export async function readPublicStatusCard(slug: string): Promise<PublicProfileStatusCard | null> {
  const client = getSupabaseClient();
  if (!client || !SLUG.test(slug)) return null;
  const { data, error } = await client
    .from('public_profile_status_cards')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Could not load this status card.');
  return data;
}
