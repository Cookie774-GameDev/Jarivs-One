// @ts-nocheck
// create-checkout-session: starts a Stripe Checkout for a selected plan.
// The client sends ONLY a plan id; the price is resolved server-side from secrets.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { json } from '../_shared/voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://vibespaceos.com').replace(/\/$/, '');

const PRICE_FOR_PLAN: Record<string, string | undefined> = {
  starter: Deno.env.get('STRIPE_STARTER_PRICE_ID') ?? Deno.env.get('STRIPE_PRICE_STARTER'),
  pro: Deno.env.get('STRIPE_PRO_PRICE_ID') ?? Deno.env.get('STRIPE_PRICE_PRO'),
  ultra: Deno.env.get('STRIPE_ULTRA_PRICE_ID') ?? Deno.env.get('STRIPE_PRICE_ULTRA'),
  apex: Deno.env.get('STRIPE_APEX_PRICE_ID') ?? Deno.env.get('STRIPE_PRICE_APEX'),
};

function isSafeAppBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: json({}, 200, origin).headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json({ error: 'billing_unconfigured' }, 503, origin);
  }
  if (!isSafeAppBaseUrl(APP_BASE_URL)) return json({ error: 'billing_redirect_unconfigured' }, 503, origin);

  const jwt = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: 'unauthorized' }, 401, origin);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401, origin);
  const user = userData.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }
  const plan = String(body.plan ?? '');
  const priceId = PRICE_FOR_PLAN[plan];
  if (!priceId) return json({ error: 'invalid_plan' }, 400, origin);

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileErr) throw new Error('profile_lookup_failed');

    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error: updateErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
      if (updateErr) throw new Error('customer_mapping_failed');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_BASE_URL}/billing/success`,
      cancel_url: `${APP_BASE_URL}/billing/cancel`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
      allow_promotion_codes: false,
    });

    if (!session.url) return json({ error: 'checkout_unavailable' }, 502, origin);
    return json({ url: session.url }, 200, origin);
  } catch (error) {
    console.error('[create-checkout-session] failed', {
      code: error instanceof Error ? error.message : 'unknown',
      user_id: user.id,
      plan,
    });
    return json({ error: 'checkout_failed' }, 502, origin);
  }
});
