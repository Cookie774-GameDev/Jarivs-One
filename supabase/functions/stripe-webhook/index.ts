// @ts-nocheck
// stripe-webhook: verifies Stripe signatures, maps price IDs to plans server-side,
// and updates subscription state. Deploy with verify_jwt = false; Stripe signature
// verification is the authentication boundary.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { planForPriceId } from '../_shared/voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function planFromSubscription(sub: Stripe.Subscription): string | null {
  for (const item of sub.items?.data ?? []) {
    const plan = planForPriceId(item?.price?.id);
    if (plan) return plan;
  }
  return null;
}

async function applyPlan(customerId: string, plan: string, sub: Stripe.Subscription | null): Promise<void> {
  const db = admin();
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (profileErr) throw new Error('profile_lookup_failed');
  if (!profile?.id) throw new Error('profile_not_found');

  const { error: tierErr } = await db
    .from('profiles')
    .update({ tier: plan, updated_at: new Date().toISOString() })
    .eq('id', profile.id);
  if (tierErr) throw new Error('profile_update_failed');

  if (sub) {
    const { error: subErr } = await db.from('subscriptions').upsert({
      id: sub.id,
      user_id: profile.id,
      stripe_customer_id: customerId,
      status: sub.status,
      plan,
      price_id: sub.items?.data?.[0]?.price?.id ?? null,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString() : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    });
    if (subErr) throw new Error('subscription_upsert_failed');
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') return new Response('VibeSpace Stripe webhook up.\n', { status: 200 });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return new Response('Webhook unavailable', { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature', { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  const db = admin();
  const { error: insertErr } = await db.from('subscription_events').insert({
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
    processed: false,
  });

  if (insertErr) {
    const { data: existing, error: lookupErr } = await db
      .from('subscription_events')
      .select('processed')
      .eq('event_id', event.id)
      .maybeSingle();
    if (lookupErr) return new Response('Event state unavailable', { status: 500 });
    if (existing?.processed) return new Response('duplicate', { status: 200 });

    const { error: refreshErr } = await db
      .from('subscription_events')
      .update({ event_type: event.type, payload: event as unknown as Record<string, unknown> })
      .eq('event_id', event.id)
      .eq('processed', false);
    if (refreshErr) return new Response('Event state unavailable', { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (customerId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          const plan = planFromSubscription(sub);
          if (!plan) throw new Error('unknown_price');
          await applyPlan(customerId, plan, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (customerId) {
          if (sub.status === 'active' || sub.status === 'trialing') {
            const plan = planFromSubscription(sub);
            if (!plan) throw new Error('unknown_price');
            await applyPlan(customerId, plan, sub);
          } else if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'past_due') {
            await applyPlan(customerId, 'free', sub);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (customerId) await applyPlan(customerId, 'free', sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) await applyPlan(customerId, 'free', null);
        break;
      }
      default:
        break;
    }

    const { error: processedErr } = await db
      .from('subscription_events')
      .update({ processed: true })
      .eq('event_id', event.id);
    if (processedErr) throw new Error('event_finalize_failed');
    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('[stripe-webhook] handler failed', {
      event_id: event.id,
      event_type: event.type,
      code: error instanceof Error ? error.message : 'unknown',
    });
    return new Response('Handler failed', { status: 500 });
  }
});
