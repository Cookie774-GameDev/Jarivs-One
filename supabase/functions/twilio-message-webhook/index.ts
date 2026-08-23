// Twilio SMS + WhatsApp inbound Jarvis webhook. Provider signature validation
// happens before pairing, storage, inference, or reply. Deploy with JWT
// verification disabled only because Twilio is authenticated here.

import {
  handleRemoteJarvisMessage,
  type RemoteJarvisInbound,
  type RemoteJarvisResult,
} from '../_shared/remoteJarvisMessaging.ts';
import { completeRemoteJarvis, type RemoteCompletionDeps } from '../_shared/remoteJarvisRuntime.ts';

export interface TwilioMessageWebhookDeps {
  publicWebhookUrl: string;
  verifySignature(
    signature: string | null,
    url: string,
    params: Record<string, string>,
  ): Promise<boolean>;
  redeemPairing(message: RemoteJarvisInbound, code: string): Promise<boolean>;
  revokeIdentity(message: RemoteJarvisInbound): Promise<void>;
  processMessage(
    message: RemoteJarvisInbound,
    deliver: (text: string) => Promise<void>,
  ): Promise<RemoteJarvisResult>;
}

const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const PAIRING = /^PAIR\s+([A-F0-9]{16})$/iu;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function twiml(message?: string): Response {
  const body = message ? `<Message>${escapeXml(message.slice(0, 3_000))}</Message>` : '';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

function normalizedMessage(params: Record<string, string>): RemoteJarvisInbound | null {
  const from = (params.From ?? '').trim();
  const to = (params.To ?? '').trim();
  const providerEventId = (params.MessageSid ?? params.SmsMessageSid ?? '').trim();
  if (!from || !to || !providerEventId) return null;
  return {
    platform: from.toLowerCase().startsWith('whatsapp:') ? 'whatsapp' : 'sms',
    providerEventId,
    workspaceId: to,
    platformUserId: from,
    replyAddress: from,
    text: params.Body ?? '',
  };
}

export async function handleTwilioMessageWebhook(
  deps: TwilioMessageWebhookDeps,
  req: Request,
): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);
  if (
    !(await deps.verifySignature(
      req.headers.get('x-twilio-signature'),
      deps.publicWebhookUrl,
      params,
    ))
  ) {
    return new Response('invalid signature', { status: 403 });
  }

  const message = normalizedMessage(params);
  if (!message) return new Response('invalid payload', { status: 400 });
  const command = message.text.trim().toUpperCase();
  if (OPT_OUT.has(command)) {
    await deps.revokeIdentity(message);
    return twiml('You have been unsubscribed. Reply START to opt back in.');
  }
  if (command === 'HELP') return twiml('VibeSpace Jarvis messaging. Reply STOP to unsubscribe.');

  const pairing = message.text.trim().match(PAIRING);
  if (pairing) {
    const linked = await deps.redeemPairing(message, pairing[1]!.toUpperCase());
    return twiml(
      linked
        ? 'This conversation is now linked to VibeSpace Jarvis.'
        : 'That pairing code is invalid, expired, or temporarily rate limited.',
    );
  }

  let reply = '';
  const result = await deps.processMessage(message, async (text) => {
    if (!reply) reply = text;
  });
  if (reply) return twiml(reply);
  if (result.kind === 'unauthorized') {
    return twiml('This conversation is not linked. Create a pairing code in VibeSpace first.');
  }
  if (result.kind === 'forbidden') {
    return twiml('Remote Jarvis access is limited to conversation only.');
  }
  return twiml();
}

async function verifySignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!authToken || !signature) return false;
  let signed = url;
  for (const key of Object.keys(params).sort()) signed += key + params[key];
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signed));
  const expected = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

const _Deno = (globalThis as Record<string, unknown>).Deno as
  | {
      serve: (handler: (req: Request) => Promise<Response>) => void;
      env: { get(name: string): string | undefined };
    }
  | undefined;

if (_Deno?.serve) {
  const url = _Deno.env.get('SUPABASE_URL')!;
  const serviceKey = _Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const twilioToken = _Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const deepseekKey = _Deno.env.get('DEEPSEEK_API_KEY') ?? '';
  const appVersion = _Deno.env.get('APP_VERSION') ?? '';
  const appBaseUrl = (_Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/u, '');
  const publicWebhookUrl = `${appBaseUrl}/functions/v1/twilio-message-webhook`;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.46.2');
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const identityUsers = new Map<string, string>();

  async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  const completionDeps: RemoteCompletionDeps = {
    async getAppAccess(userId) {
      const { data, error } = await admin.rpc('get_remote_jarvis_app_access', {
        p_user_id: userId,
        p_app_version: appVersion || null,
      });
      return error ? null : data;
    },
    isProviderConfigured: () => Boolean(deepseekKey),
    async isAppAdmin(userId) {
      const { data, error } = await admin.rpc('is_app_admin', { p_user_id: userId });
      if (error || typeof data !== 'boolean') throw new Error('admin_lookup_failed');
      return data;
    },
    async rateLimitHit(userId, windowStart, chars, max) {
      const { data, error } = await admin.rpc('message_rate_limit_hit', {
        p_user_id: userId,
        p_window_start: windowStart,
        p_chars: chars,
        p_max_requests: max,
      });
      return error || typeof data?.limited !== 'boolean' ? null : data;
    },
    async reserveBudget(userId, estimateUsd) {
      const { data, error } = await admin.rpc('reserve_message_budget', {
        p_user_id: userId,
        p_estimate_usd: estimateUsd,
      });
      return error || typeof data?.ok !== 'boolean' ? null : data;
    },
    async settleBudget(userId, reserved, actual) {
      const { error } = await admin.rpc('settle_message_budget', {
        p_user_id: userId,
        p_reserved: reserved,
        p_actual: actual,
      });
      if (error) throw new Error('budget_settlement_failed');
    },
    async recordEvent(userId, payload) {
      const { error } = await admin.rpc('record_usage_event', {
        p_kind: 'message',
        p_user_id: userId,
        p_payload: payload,
      });
      if (error) throw new Error('usage_audit_failed');
    },
    async callProvider(messages) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${deepseekKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model: 'deepseek-chat', messages, stream: false }),
          signal: controller.signal,
        });
        let body: unknown = null;
        if (response.ok) {
          try {
            body = await response.json();
          } catch {
            // Malformed provider responses fail through the safe runtime path.
          }
        }
        return { ok: response.ok, status: response.status, body };
      } finally {
        clearTimeout(timer);
      }
    },
    now: () => new Date(),
  };

  function processMessage(
    message: RemoteJarvisInbound,
    deliver: (text: string) => Promise<void>,
  ): Promise<RemoteJarvisResult> {
    let deliveryUserId = '';
    const meteredDeliver = async (text: string) => {
      if (!deliveryUserId) throw new Error('delivery_identity_missing');
      const isUnicode = /[^\x00-\x7f]/u.test(text);
      const single = isUnicode ? 70 : 160;
      const multi = isUnicode ? 67 : 153;
      const segments = text.length <= single ? 1 : Math.ceil(text.length / multi);
      const estimatedCost = segments * 0.01;
      const { data: isAdmin, error: adminError } = await admin.rpc('is_app_admin', {
        p_user_id: deliveryUserId,
      });
      if (adminError || typeof isAdmin !== 'boolean') throw new Error('admin_lookup_failed');
      if (!isAdmin) {
        const { data: reservation, error: reserveError } = await admin.rpc('reserve_sms_budget', {
          p_user_id: deliveryUserId,
          p_estimate_usd: estimatedCost,
          p_count: segments,
        });
        if (reserveError || reservation?.ok !== true) throw new Error('remote_sms_budget_denied');
        const { error: settleError } = await admin.rpc('settle_sms_budget', {
          p_user_id: deliveryUserId,
          p_reserved: estimatedCost,
          p_actual: estimatedCost,
          p_count_delta: 0,
        });
        if (settleError) throw new Error('remote_sms_settlement_failed');
      }
      await admin.rpc('record_usage_event', {
        p_kind: 'sms',
        p_user_id: deliveryUserId,
        p_payload: {
          provider: 'twilio',
          channel: message.platform,
          segments,
          actual_cost_usd: isAdmin ? 0 : estimatedCost,
          status: 'ok',
        },
      });
      await deliver(text);
    };
    return handleRemoteJarvisMessage(
      {
        async claimInbound(input) {
          const { data: identity, error: identityError } = await admin
            .from('remote_messaging_identities')
            .select('id,user_id,platform,workspace_id,platform_user_id,scopes')
            .eq('platform', input.platform)
            .eq('workspace_id', input.workspaceId)
            .eq('platform_user_id', input.platformUserId)
            .eq('status', 'active')
            .maybeSingle();
          if (identityError) throw new Error('identity_lookup_failed');
          if (!identity) return { kind: 'unauthorized' } as const;
          deliveryUserId = identity.user_id;
          identityUsers.set(identity.id, identity.user_id);
          const { data: event, error: eventError } = await admin
            .from('remote_messaging_events')
            .insert({
              identity_id: identity.id,
              user_id: identity.user_id,
              platform: input.platform,
              workspace_id: input.workspaceId,
              provider_event_id: input.providerEventId,
              request_text_hash: await sha256(input.text),
            })
            .select('id')
            .single();
          if (eventError?.code === '23505') {
            const { data: existing } = await admin
              .from('remote_messaging_events')
              .select('id')
              .eq('platform', input.platform)
              .eq('workspace_id', input.workspaceId)
              .eq('provider_event_id', input.providerEventId)
              .single();
            if (!existing) throw new Error('event_dedup_lookup_failed');
            return { kind: 'duplicate', eventId: existing.id } as const;
          }
          if (eventError || !event) throw new Error('event_claim_failed');
          return {
            kind: 'claimed',
            eventId: event.id,
            identity: {
              id: identity.id,
              userId: identity.user_id,
              platform: identity.platform,
              workspaceId: identity.workspace_id,
              platformUserId: identity.platform_user_id,
              scopes: identity.scopes,
            },
          } as const;
        },
        async loadRecentTurns(identityId, limit) {
          const { data, error } = await admin
            .from('remote_messaging_turns')
            .select('role,content')
            .eq('identity_id', identityId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limit);
          if (error) throw new Error('history_lookup_failed');
          return (data ?? []).reverse().map((turn) => ({ role: turn.role, text: turn.content }));
        },
        complete: (request) => completeRemoteJarvis(completionDeps, request),
        async saveTurn(identityId, role, text) {
          const userId = identityUsers.get(identityId);
          if (!userId) throw new Error('identity_binding_missing');
          const { error } = await admin.from('remote_messaging_turns').insert({
            identity_id: identityId,
            user_id: userId,
            role,
            content: text,
          });
          if (error) throw new Error('turn_save_failed');
        },
        deliver: meteredDeliver,
        async markEvent(eventId, status) {
          const { error } = await admin
            .from('remote_messaging_events')
            .update({ status, completed_at: new Date().toISOString() })
            .eq('id', eventId);
          if (error) throw new Error('event_update_failed');
        },
      },
      message,
    );
  }

  const deps: TwilioMessageWebhookDeps = {
    publicWebhookUrl,
    verifySignature: (signature, webhookUrl, params) =>
      verifySignature(twilioToken, signature, webhookUrl, params),
    async redeemPairing(message, code) {
      const { data, error } = await admin.rpc('redeem_remote_messaging_pairing', {
        p_platform: message.platform,
        p_workspace_id: message.workspaceId,
        p_platform_user_id: message.platformUserId,
        p_reply_address: message.replyAddress,
        p_pairing_code: code,
      });
      return !error && Array.isArray(data) && data.length === 1;
    },
    async revokeIdentity(message) {
      await admin
        .from('remote_messaging_identities')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('platform', message.platform)
        .eq('workspace_id', message.workspaceId)
        .eq('platform_user_id', message.platformUserId);
    },
    processMessage,
  };

  _Deno.serve(async (req: Request) => {
    try {
      return await handleTwilioMessageWebhook(deps, req);
    } catch {
      return twiml('Jarvis is temporarily unavailable. Please try again.');
    }
  });
}
