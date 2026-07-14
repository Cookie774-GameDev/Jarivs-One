// @ts-nocheck
// Stripe-signed webhook. Deploy with verify_jwt=false; Stripe does not send a
// Supabase JWT. Subscription writes are applied transactionally by migration
// 0031 and plans are always derived from the server-side price allowlist.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { buildSubscriptionRpcArgs } from '../_shared/billingSecurity.ts';
import { planForPriceId } from '../_shared/voice.ts';
import {
  invoicePaymentFailedForcesFree,
  subscriptionKeepsPaidAccess,
  subscriptionRevokesToFree,
} from '../_shared/subscriptionStatus.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function objectId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function planFromSubscription(sub: Stripe.Subscription): string | null {
  for (const item of sub.items?.data ?? []) {
    const plan = planForPriceId(item?.price?.id);
    if (plan) return plan;
  }
  return null;
}

async function recordFailure(
  db: ReturnType<typeof admin>,
  event: Stripe.Event,
  errorCode: string,
  customerId: string | null = null,
  subscriptionId: string | null = null,
): Promise<void> {
  const { error } = await db.rpc('record_stripe_event_failure', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: new Date(event.created * 1000).toISOString(),
    p_customer_id: customerId,
    p_subscription_id: subscriptionId,
    p_error_code: errorCode,
  });
  if (error) console.error('stripe_event_failure_record_failed');
}

async function applySubscription(
  db: ReturnType<typeof admin>,
  event: Stripe.Event,
  customerId: string,
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const keepsAccess = subscriptionKeepsPaidAccess(subscription.status);
  const revokesAccess = subscriptionRevokesToFree(subscription.status);
  if (!keepsAccess && !revokesAccess) {
    await recordFailure(db, event, 'unsupported_subscription_status', customerId, subscription.id);
    return false;
  }

  const plan = planFromSubscription(subscription);
  if (keepsAccess && !plan) {
    await recordFailure(db, event, 'unknown_price_id', customerId, subscription.id);
    return false;
  }

  const { error } = await db.rpc('apply_stripe_subscription_event',
    buildSubscriptionRpcArgs({
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      customerId,
      plan,
      subscription,
    }));
  if (error) {
    await recordFailure(db, event, 'subscription_apply_failed', customerId, subscription.id);
    return false;
  }
  return true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') return new Response('VibeSpace Stripe webhook up.\n', { status: 200 });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return new Response('Webhook not configured', { status: 500 });
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
    return new Response('Signature verification failed', { status: 400 });
  }

  const db = admin();
  try {
    let subscription: Stripe.Subscription | null = null;
    let customerId: string | null = null;
    let checkoutUserId: string | null = null;
    let checkoutSessionId: string | null = null;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        checkoutUserId = session.client_reference_id ?? null;
        checkoutSessionId = session.id;
        customerId = objectId(session.customer);
        const subscriptionId = objectId(session.subscription);
        if (customerId && subscriptionId) {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        subscription = event.data.object as Stripe.Subscription;
        customerId = objectId(subscription.customer);
        break;
      }
      case 'invoice.payment_failed': {
        if (invoicePaymentFailedForcesFree()) break;
        const invoice = event.data.object as Stripe.Invoice;
        customerId = objectId(invoice.customer);
        const subscriptionId = objectId(invoice.subscription);
        if (customerId && subscriptionId) {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        customerId = objectId(invoice.customer);
        const subscriptionId = objectId(invoice.subscription);
        if (customerId && subscriptionId) {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        }
        break;
      }
      default:
        return new Response('ok', { status: 200 });
    }

    if (!subscription || !customerId) {
      await recordFailure(db, event, 'missing_subscription_reference', customerId);
      return new Response('Event could not be applied', { status: 500 });
    }
    if (!await applySubscription(db, event, customerId, subscription)) {
      return new Response('Event could not be applied', { status: 500 });
    }
    if (checkoutUserId && checkoutSessionId) {
      const { data: completed, error: completionErr } = await db.rpc('complete_checkout_slot', {
        p_user_id: checkoutUserId,
        p_session_id: checkoutSessionId,
      });
      if (completionErr || completed !== true) {
        await recordFailure(
          db,
          event,
          'checkout_guard_cleanup_failed',
          customerId,
          subscription.id,
        );
        return new Response('Event could not be finalized', { status: 500 });
      }
    }
    return new Response('ok', { status: 200 });
  } catch {
    await recordFailure(db, event, 'webhook_processing_failed');
    return new Response('Handler failed', { status: 500 });
  }
});
