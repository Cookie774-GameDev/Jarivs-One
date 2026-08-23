export type RemoteJarvisPlatform = 'sms' | 'whatsapp' | 'telegram' | 'discord';
export type RemoteJarvisRole = 'user' | 'assistant';

export interface RemoteJarvisInbound {
  platform: RemoteJarvisPlatform;
  providerEventId: string;
  workspaceId: string;
  platformUserId: string;
  replyAddress: string;
  text: string;
}

export interface RemoteJarvisIdentity {
  id: string;
  userId: string;
  platform: RemoteJarvisPlatform;
  workspaceId: string;
  platformUserId: string;
  scopes: readonly string[];
}

export interface RemoteJarvisTurn {
  role: RemoteJarvisRole;
  text: string;
}

export type ClaimInboundResult =
  | { kind: 'claimed'; eventId: string; identity: RemoteJarvisIdentity }
  | { kind: 'duplicate'; eventId: string }
  | { kind: 'unauthorized' };

export interface RemoteJarvisDeps {
  claimInbound(message: RemoteJarvisInbound): Promise<ClaimInboundResult>;
  loadRecentTurns(identityId: string, limit: number): Promise<readonly RemoteJarvisTurn[]>;
  complete(request: {
    userId: string;
    eventId: string;
    messages: readonly { role: 'system' | RemoteJarvisRole; content: string }[];
    capabilities: readonly never[];
  }): Promise<{ text: string }>;
  saveTurn(identityId: string, role: RemoteJarvisRole, text: string): Promise<void>;
  deliver(message: RemoteJarvisInbound, text: string): Promise<void>;
  markEvent(eventId: string, status: 'completed' | 'failed' | 'forbidden'): Promise<void>;
}

export type RemoteJarvisResult =
  | { kind: 'replied'; eventId: string }
  | { kind: 'failed'; eventId: string }
  | { kind: 'forbidden'; eventId: string }
  | { kind: 'duplicate'; eventId: string }
  | { kind: 'unauthorized' }
  | { kind: 'ignored' };

const MAX_INBOUND_CHARS = 4_000;
const MAX_REPLY_CHARS = 3_000;
const HISTORY_LIMIT = 12;
const SAFE_RETRY = 'Jarvis is temporarily unavailable. Please try again.';
const REMOTE_SYSTEM_PROMPT =
  'You are Jarvis in a remote conversation only. Reply concisely and helpfully. ' +
  'You have no tools and must not claim to call, message, purchase, deploy, access credentials, ' +
  'control devices, or take any external action. Ask the user to open VibeSpace for actions that require approval.';

function cleanText(value: string, limit: number): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .trim()
    .slice(0, limit);
}

/**
 * Provider-neutral inbound coordinator. Provider handlers own signature
 * verification and payload parsing; this function owns authorization,
 * replay safety, bounded context, chat-only capability, and safe delivery.
 */
export async function handleRemoteJarvisMessage(
  deps: RemoteJarvisDeps,
  input: RemoteJarvisInbound,
): Promise<RemoteJarvisResult> {
  const text = cleanText(input.text, MAX_INBOUND_CHARS);
  if (!text) return { kind: 'ignored' };

  const message = { ...input, text };
  const claim = await deps.claimInbound(message);
  if (claim.kind === 'unauthorized') return { kind: 'unauthorized' };
  if (claim.kind === 'duplicate') return claim;

  const { eventId, identity } = claim;
  if (!identity.scopes.includes('chat')) {
    await deps.markEvent(eventId, 'forbidden');
    return { kind: 'forbidden', eventId };
  }

  try {
    const history = await deps.loadRecentTurns(identity.id, HISTORY_LIMIT);
    const messages: Array<{ role: 'system' | RemoteJarvisRole; content: string }> = [
      { role: 'system', content: REMOTE_SYSTEM_PROMPT },
      ...history.slice(-HISTORY_LIMIT).map((turn) => ({
        role: turn.role,
        content: cleanText(turn.text, MAX_INBOUND_CHARS),
      })),
      { role: 'user', content: text },
    ];

    await deps.saveTurn(identity.id, 'user', text);
    const completion = await deps.complete({
      userId: identity.userId,
      eventId,
      messages,
      capabilities: [],
    });
    const reply = cleanText(completion.text, MAX_REPLY_CHARS);
    if (!reply) throw new Error('empty_completion');

    await deps.deliver(message, reply);
    await deps.saveTurn(identity.id, 'assistant', reply);
    await deps.markEvent(eventId, 'completed');
    return { kind: 'replied', eventId };
  } catch {
    try {
      await deps.deliver(message, SAFE_RETRY);
    } catch {
      // The provider retry remains deduplicated by the claimed event.
    }
    try {
      await deps.markEvent(eventId, 'failed');
    } catch {
      // Never expose storage/provider errors to an untrusted webhook caller.
    }
    return { kind: 'failed', eventId };
  }
}
