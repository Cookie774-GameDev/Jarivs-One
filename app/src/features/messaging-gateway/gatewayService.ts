import type {
  ConversationEndpoint,
  GatewayConversationLink,
  GatewayDecision,
  GatewayGroupPolicy,
  GatewayIdentityAddress,
  GatewayIdentityLink,
  GatewayPairingRecord,
  GatewayRole,
  GatewayScope,
  MessagingAdapter,
  MessagingAttachment,
  MessagingCapabilities,
  MessagingPlatform,
  NormalizedInboundMessage,
  NormalizedOutboundMessage,
  VerifiedInboundEvent,
} from './contracts';
import {
  createInMemoryMessagingGatewayRepository,
  type InMemoryMessagingGatewayRepository,
} from './repository';

export type MessagingGatewayErrorCode =
  | 'invalid_input'
  | 'pairing_denied'
  | 'pairing_expired'
  | 'pairing_rate_limited'
  | 'capability_denied'
  | 'unsupported';

const ERROR_MESSAGES: Readonly<Record<MessagingGatewayErrorCode, string>> = Object.freeze({
  invalid_input: 'Messaging gateway input is invalid.',
  pairing_denied: 'Messaging gateway pairing was denied.',
  pairing_expired: 'Messaging gateway pairing expired.',
  pairing_rate_limited: 'Messaging gateway pairing is temporarily rate limited.',
  capability_denied: 'Messaging gateway capability was denied.',
  unsupported: 'Messaging gateway capability is unsupported.',
});

export class MessagingGatewayError extends Error {
  readonly code: MessagingGatewayErrorCode;

  constructor(code: MessagingGatewayErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'MessagingGatewayError';
    this.code = code;
  }
}

export interface MessagingGatewayServiceOptions {
  repository?: InMemoryMessagingGatewayRepository;
  pairingCodeGenerator?: () => string;
  digestPairingCode?: (code: string) => Promise<string>;
  pairingTtlMs?: number;
  pairingAttemptLimit?: number;
  pairingAttemptWindowMs?: number;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const SAFE_LABEL = /^[^\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]{1,200}$/u;
const SCOPES = new Set<GatewayScope>([
  'status_read',
  'slash_command',
  'model_switch',
  'costly_operation',
  'memory_read',
  'project_read',
  'file_read',
  'tool_action',
]);
const ROLES = new Set<GatewayRole>([
  'owner_admin',
  'approved_user',
  'readonly_status',
  'group_participant',
  'blocked',
]);
const PLATFORMS = new Set<MessagingPlatform>([
  'phone',
  'sms',
  'telegram',
  'discord',
  'slack',
  'email',
  'whatsapp',
  'signal',
  'native',
  'cli',
]);

function fail(code: MessagingGatewayErrorCode): never {
  throw new MessagingGatewayError(code);
}

function safeId(value: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return fail('invalid_input');
  return value;
}

function safeLabel(value: string): string {
  const trimmed = value.trim();
  if (!SAFE_LABEL.test(trimmed)) return fail('invalid_input');
  return trimmed;
}

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return fail('invalid_input');
  return value;
}

function safeScopes(values: readonly string[]): readonly GatewayScope[] {
  if (!Array.isArray(values) || values.length > SCOPES.size) return fail('invalid_input');
  const scopes = [...new Set(values)];
  if (scopes.some((scope) => !SCOPES.has(scope as GatewayScope))) return fail('invalid_input');
  return Object.freeze(scopes.sort()) as readonly GatewayScope[];
}

function normalizeAddress(address: GatewayIdentityAddress): GatewayIdentityAddress {
  if (!PLATFORMS.has(address.platform)) return fail('invalid_input');
  return Object.freeze({
    ownerId: safeId(address.ownerId),
    platform: address.platform,
    platformWorkspaceId: safeId(address.platformWorkspaceId),
    platformUserId: safeId(address.platformUserId),
  });
}

function normalizeEndpoint(endpoint: ConversationEndpoint): ConversationEndpoint {
  if (!PLATFORMS.has(endpoint.platform)) return fail('invalid_input');
  const threadId = endpoint.threadId === null ? null : safeId(endpoint.threadId);
  if (!['dm', 'channel', 'thread', 'group'].includes(endpoint.conversationKind)) {
    return fail('invalid_input');
  }
  if (endpoint.conversationKind === 'thread' && threadId === null) return fail('invalid_input');
  return Object.freeze({
    platform: endpoint.platform,
    platformWorkspaceId: safeId(endpoint.platformWorkspaceId),
    conversationId: safeId(endpoint.conversationId),
    threadId,
    conversationKind: endpoint.conversationKind,
  });
}

function safeNonNegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return fail('invalid_input');
  return value;
}

function validateCapabilities(capabilities: MessagingCapabilities): MessagingCapabilities {
  if (
    ![
      'supported',
      'experimental',
      'self_hosted',
      'external_bridge_required',
      'unsupported',
    ].includes(capabilities.support) ||
    ![false, 'platform', 'commonmark'].includes(capabilities.markdown) ||
    !Number.isSafeInteger(capabilities.maxTextLength) ||
    capabilities.maxTextLength < 1 ||
    !Number.isSafeInteger(capabilities.maxFileBytes) ||
    capabilities.maxFileBytes < 0
  ) {
    return fail('invalid_input');
  }
  return Object.freeze({ ...capabilities });
}

function validateAttachment(attachment: MessagingAttachment): MessagingAttachment {
  if (!['image', 'file', 'audio', 'voice_note'].includes(attachment.kind)) {
    return fail('invalid_input');
  }
  return Object.freeze({
    attachmentId: safeId(attachment.attachmentId),
    kind: attachment.kind,
    mimeType: safeLabel(attachment.mimeType),
    sizeBytes: safeNonNegativeInteger(attachment.sizeBytes),
  });
}

const ROLE_SCOPES: Readonly<Record<GatewayRole, ReadonlySet<GatewayScope>>> = Object.freeze({
  owner_admin: new Set<GatewayScope>(SCOPES),
  approved_user: new Set<GatewayScope>(SCOPES),
  readonly_status: new Set<GatewayScope>(['status_read']),
  group_participant: new Set<GatewayScope>(['status_read', 'slash_command']),
  blocked: new Set<GatewayScope>(),
});

const EMPTY_CONTEXT = Object.freeze({
  projectId: null,
  profileId: null,
  privateMemoryAllowed: false,
});

function defaultPairingCode(): string {
  const bytes = new Uint8Array(24);
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) return fail('unsupported');
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{1,8}/gu)?.join('-') ?? fail('unsupported');
}

async function defaultDigest(code: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fail('unsupported');
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(code)));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function createMessagingGatewayService(options: MessagingGatewayServiceOptions = {}) {
  const repository = options.repository ?? createInMemoryMessagingGatewayRepository();
  const generatePairingCode = options.pairingCodeGenerator ?? defaultPairingCode;
  const digestPairingCode = options.digestPairingCode ?? defaultDigest;
  const pairingTtlMs = options.pairingTtlMs ?? 5 * 60_000;
  const pairingAttemptLimit = options.pairingAttemptLimit ?? 5;
  const pairingAttemptWindowMs = options.pairingAttemptWindowMs ?? 10 * 60_000;
  const adapters = new Map<MessagingPlatform, MessagingAdapter>();
  if (!Number.isSafeInteger(pairingTtlMs) || pairingTtlMs < 30_000 || pairingTtlMs > 15 * 60_000) {
    throw new TypeError('Invalid messaging gateway pairing TTL.');
  }
  if (
    !Number.isSafeInteger(pairingAttemptLimit) ||
    pairingAttemptLimit < 1 ||
    pairingAttemptLimit > 20 ||
    !Number.isSafeInteger(pairingAttemptWindowMs) ||
    pairingAttemptWindowMs < 1_000 ||
    pairingAttemptWindowMs > 24 * 60 * 60_000
  ) {
    throw new TypeError('Invalid messaging gateway pairing attempt policy.');
  }

  return Object.freeze({
    resolveIdentity(address: GatewayIdentityAddress): GatewayIdentityLink | null {
      return repository.identityLink(normalizeAddress(address));
    },

    async startPairing(
      input: GatewayIdentityAddress & {
        displayLabel: string;
        profileId: string;
        requestedScopes: readonly string[];
        now: number;
      },
    ): Promise<Readonly<{ pairingId: string; code: string; expiresAt: number }>> {
      const address = normalizeAddress(input);
      if (address.platform === 'email') return fail('unsupported');
      const now = safeTime(input.now);
      const code = safeLabel(generatePairingCode());
      const record: GatewayPairingRecord = Object.freeze({
        id: repository.nextPairingId(),
        ...address,
        displayLabel: safeLabel(input.displayLabel),
        profileId: safeId(input.profileId),
        requestedScopes: safeScopes(input.requestedScopes),
        codeDigest: await digestPairingCode(code),
        status: 'issued',
        createdAt: now,
        expiresAt: now + pairingTtlMs,
      });
      repository.savePairing(record);
      return Object.freeze({ pairingId: record.id, code, expiresAt: record.expiresAt });
    },

    async redeemPairing(
      input: GatewayIdentityAddress & { code: string; now: number },
    ): Promise<GatewayPairingRecord> {
      const address = normalizeAddress(input);
      const now = safeTime(input.now);
      const pairing = repository.activePairingFor(address);
      if (pairing === null) return fail('pairing_denied');
      if (now >= pairing.expiresAt) return fail('pairing_expired');
      if (pairing.status !== 'issued') return fail('pairing_denied');
      if (
        repository.pairingAttemptCount(address, now - pairingAttemptWindowMs) >= pairingAttemptLimit
      ) {
        return fail('pairing_rate_limited');
      }
      const digest = await digestPairingCode(safeLabel(input.code));
      if (!constantTimeEqual(digest, pairing.codeDigest)) {
        repository.recordPairingAttempt(address, now);
        return fail('pairing_denied');
      }
      const redeemed = Object.freeze({
        ...pairing,
        status: 'pending_approval' as const,
        redeemedAt: now,
      });
      repository.savePairing(redeemed);
      return redeemed;
    },

    async approvePairing(input: {
      pairingId: string;
      ownerId: string;
      role: GatewayRole;
      approvedScopes: readonly string[];
      now: number;
    }): Promise<GatewayIdentityLink> {
      const pairing = repository.pairingById(safeId(input.pairingId));
      const ownerId = safeId(input.ownerId);
      const now = safeTime(input.now);
      if (
        pairing === null ||
        pairing.ownerId !== ownerId ||
        pairing.status !== 'pending_approval' ||
        now >= pairing.expiresAt ||
        !ROLES.has(input.role) ||
        input.role === 'blocked'
      ) {
        return fail('pairing_denied');
      }
      const approvedScopes = safeScopes(input.approvedScopes);
      if (approvedScopes.some((scope) => !pairing.requestedScopes.includes(scope))) {
        return fail('pairing_denied');
      }
      const link: GatewayIdentityLink = Object.freeze({
        id: repository.nextIdentityId(),
        ownerId,
        platform: pairing.platform,
        platformWorkspaceId: pairing.platformWorkspaceId,
        platformUserId: pairing.platformUserId,
        displayLabel: pairing.displayLabel,
        profileId: pairing.profileId,
        trustLevel: input.role === 'owner_admin' ? 'admin' : 'approved',
        role: input.role,
        scopes: approvedScopes,
        createdAt: now,
      });
      repository.saveIdentityLink(link);
      repository.savePairing(Object.freeze({ ...pairing, status: 'approved', approvedAt: now }));
      return link;
    },

    revokeIdentity(input: { identityLinkId: string; ownerId: string; now: number }): void {
      if (
        !repository.revokeIdentityLink(
          safeId(input.identityLinkId),
          safeId(input.ownerId),
          safeTime(input.now),
        )
      ) {
        return fail('pairing_denied');
      }
    },

    authorizeAction(input: {
      identity: GatewayIdentityAddress;
      action: GatewayScope;
    }): Readonly<{ allowed: boolean; code: string }> {
      const identity = repository.identityLink(normalizeAddress(input.identity));
      if (identity === null) return Object.freeze({ allowed: false, code: 'unknown_identity' });
      if (!SCOPES.has(input.action)) return Object.freeze({ allowed: false, code: 'scope_denied' });
      if (!ROLE_SCOPES[identity.role].has(input.action)) {
        return Object.freeze({ allowed: false, code: 'role_denied' });
      }
      if (!identity.scopes.includes(input.action)) {
        return Object.freeze({ allowed: false, code: 'scope_denied' });
      }
      return Object.freeze({ allowed: true, code: 'authorized' });
    },

    endpointFromMessage(message: NormalizedInboundMessage): ConversationEndpoint {
      return normalizeEndpoint(message);
    },

    linkConversation(input: {
      ownerId: string;
      endpoint: ConversationEndpoint;
      gatewayConversationId: string;
      projectId: string | null;
      profileId: string | null;
      now: number;
    }): GatewayConversationLink {
      const link = Object.freeze({
        ownerId: safeId(input.ownerId),
        endpoint: normalizeEndpoint(input.endpoint),
        gatewayConversationId: safeId(input.gatewayConversationId),
        projectId: input.projectId === null ? null : safeId(input.projectId),
        profileId: input.profileId === null ? null : safeId(input.profileId),
        linkedAt: safeTime(input.now),
      });
      repository.saveConversationLink(link);
      return link;
    },

    recordReply(input: { ownerId: string; endpoint: ConversationEndpoint; now: number }): void {
      repository.recordReply(
        safeId(input.ownerId),
        normalizeEndpoint(input.endpoint),
        safeTime(input.now),
      );
    },

    authorizeNormalizedInbound(input: {
      ownerId: string;
      message: NormalizedInboundMessage;
      groupPolicy: GatewayGroupPolicy | null;
      now: number;
    }): GatewayDecision {
      const ownerId = safeId(input.ownerId);
      const now = safeTime(input.now);
      const message = input.message;
      const endpoint = normalizeEndpoint(message);
      safeId(message.id);
      safeTime(message.receivedAt);
      const duplicate = !repository.claimMessage(ownerId, endpoint, message.id);
      const identity = repository.identityLink(
        normalizeAddress({
          ownerId,
          platform: message.platform,
          platformWorkspaceId: message.platformWorkspaceId,
          platformUserId: message.platformUserId,
        }),
      );
      const gatewayConversationId = repository.conversationId(ownerId, endpoint);
      const link = repository.conversationLink(ownerId, endpoint);
      const isPrivate = endpoint.conversationKind === 'dm';
      const context = Object.freeze({
        projectId: identity?.scopes.includes('project_read') ? (link?.projectId ?? null) : null,
        profileId: isPrivate ? (link?.profileId ?? identity?.profileId ?? null) : null,
        privateMemoryAllowed:
          isPrivate === true && identity?.scopes.includes('memory_read') === true,
      });
      const decision = (status: GatewayDecision['status'], code: string): GatewayDecision =>
        Object.freeze({ status, code, gatewayConversationId, context });

      if (duplicate) return decision('duplicate', 'duplicate_message');
      if (identity === null || identity.role === 'blocked')
        return decision('denied', 'unknown_identity');
      if (isPrivate) return decision('authorized', 'authorized');
      const policy = input.groupPolicy;
      if (policy === null) return decision('denied', 'group_policy_required');
      const approvedChannels = policy.approvedChannelIds.map(safeId);
      const cooldownMs = safeNonNegativeInteger(policy.cooldownMs);
      if (policy.ignoreBots && message.isBot) return decision('ignored', 'bot_ignored');
      if (policy.replyOnlyWhenMentioned && !message.mentioned) {
        return decision('ignored', 'mention_required');
      }
      if (!approvedChannels.includes(endpoint.conversationId)) {
        return decision('ignored', 'channel_denied');
      }
      if (endpoint.conversationKind === 'thread' && !policy.replyToThreads) {
        return decision('ignored', 'thread_denied');
      }
      if (!message.usefulResponseExpected) return decision('ignored', 'not_useful');
      const lastReply = repository.lastReply(ownerId, endpoint);
      if (lastReply !== null && now - lastReply < cooldownMs) {
        return decision('ignored', 'cooldown_active');
      }
      return decision('authorized', 'authorized');
    },

    registerAdapter(adapter: MessagingAdapter): void {
      const id = adapter.id;
      if (!PLATFORMS.has(id)) return fail('invalid_input');
      validateCapabilities(adapter.capabilities);
      if (adapters.has(id)) return fail('invalid_input');
      adapters.set(id, Object.freeze(adapter));
    },

    exposedCapabilities(adapterId: MessagingPlatform): readonly string[] {
      const capabilities = adapters.get(adapterId)?.capabilities;
      if (!capabilities || capabilities.support === 'unsupported') return Object.freeze([]);
      const exposed: string[] = [];
      if (capabilities.text) exposed.push('text');
      if (capabilities.markdown) exposed.push('markdown');
      if (capabilities.images) exposed.push('images');
      if (capabilities.files) exposed.push('files');
      if (capabilities.audio) exposed.push('audio');
      if (capabilities.voiceNotes) exposed.push('voice_notes');
      if (capabilities.threads) exposed.push('threads');
      if (capabilities.reactions) exposed.push('reactions');
      if (capabilities.typing) exposed.push('typing');
      if (capabilities.progressiveUpdates) exposed.push('progressive_updates');
      return Object.freeze(exposed);
    },

    prepareOutbound(
      adapterId: MessagingPlatform,
      input: NormalizedOutboundMessage,
    ): NormalizedOutboundMessage {
      const capabilities = adapters.get(adapterId)?.capabilities;
      if (!capabilities || capabilities.support === 'unsupported') return fail('unsupported');
      const text = input.text;
      if (
        typeof text !== 'string' ||
        (!capabilities.text && text.length > 0) ||
        text.length > capabilities.maxTextLength ||
        (input.markdown && !capabilities.markdown) ||
        (input.threadId !== null && !capabilities.threads) ||
        (input.progressiveUpdate && !capabilities.progressiveUpdates)
      ) {
        return fail('capability_denied');
      }
      const attachments = input.attachments.map(validateAttachment);
      for (const attachment of attachments) {
        const supported =
          (attachment.kind === 'image' && capabilities.images) ||
          (attachment.kind === 'file' && capabilities.files) ||
          (attachment.kind === 'audio' && capabilities.audio) ||
          (attachment.kind === 'voice_note' && capabilities.voiceNotes);
        if (!supported || attachment.sizeBytes > capabilities.maxFileBytes) {
          return fail('capability_denied');
        }
      }
      return Object.freeze({
        idempotencyKey: safeId(input.idempotencyKey),
        conversationId: safeId(input.conversationId),
        threadId: input.threadId === null ? null : safeId(input.threadId),
        text,
        markdown: input.markdown,
        attachments: Object.freeze(attachments),
        progressiveUpdate: input.progressiveUpdate,
      });
    },

    async receiveVerifiedEvent(input: {
      ownerId: string;
      adapterId: MessagingPlatform;
      event: VerifiedInboundEvent;
      groupPolicy: GatewayGroupPolicy | null;
      now: number;
    }): Promise<readonly GatewayDecision[]> {
      const ownerId = safeId(input.ownerId);
      const adapter = adapters.get(input.adapterId);
      if (!adapter || adapter.capabilities.support === 'unsupported') return fail('unsupported');
      const eventId = safeId(input.event.id);
      safeTime(input.event.receivedAt);
      const priorCount = repository.claimEvent(ownerId, input.adapterId, eventId);
      if (priorCount !== null) {
        return Object.freeze(
          Array.from({ length: Math.max(priorCount, 1) }, () =>
            Object.freeze({
              status: 'duplicate' as const,
              code: 'duplicate_event',
              gatewayConversationId: null,
              context: EMPTY_CONTEXT,
            }),
          ),
        );
      }
      const messages = await adapter.receive(Object.freeze({ ...input.event, id: eventId }));
      repository.finishEvent(ownerId, input.adapterId, eventId, messages.length);
      return Object.freeze(
        messages.map((message) => {
          if (message.platform !== input.adapterId) return fail('invalid_input');
          return this.authorizeNormalizedInbound({
            ownerId,
            message,
            groupPolicy: input.groupPolicy,
            now: input.now,
          });
        }),
      );
    },
  });
}
