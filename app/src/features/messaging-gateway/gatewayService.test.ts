import { describe, expect, it } from 'vitest';
import { MessagingGatewayError, createMessagingGatewayService } from './gatewayService';
import type {
  GatewayIdentityAddress,
  MessagingAdapter,
  MessagingCapabilities,
  NormalizedInboundMessage,
} from './contracts';

const address: GatewayIdentityAddress = {
  ownerId: 'owner-1',
  platform: 'discord',
  platformWorkspaceId: 'workspace-1',
  platformUserId: 'user-1',
};

async function approveIdentity(
  service: ReturnType<typeof createMessagingGatewayService>,
  patch: Partial<{
    identity: GatewayIdentityAddress;
    role: 'owner_admin' | 'approved_user' | 'readonly_status' | 'group_participant';
    scopes: readonly string[];
    now: number;
  }> = {},
) {
  const identity = patch.identity ?? address;
  const now = patch.now ?? 1_000;
  const scopes = patch.scopes ?? ['status_read'];
  const pairing = await service.startPairing({
    ...identity,
    displayLabel: 'Ada',
    profileId: 'profile-1',
    requestedScopes: scopes,
    now,
  });
  await service.redeemPairing({ ...identity, code: pairing.code, now: now + 1 });
  return service.approvePairing({
    pairingId: pairing.pairingId,
    ownerId: identity.ownerId,
    role: patch.role ?? 'readonly_status',
    approvedScopes: scopes,
    now: now + 2,
  });
}

const discordCapabilities: MessagingCapabilities = Object.freeze({
  support: 'supported',
  text: true,
  markdown: 'platform',
  images: true,
  files: true,
  audio: false,
  voiceNotes: false,
  threads: true,
  reactions: true,
  typing: true,
  progressiveUpdates: false,
  maxTextLength: 2_000,
  maxFileBytes: 8_000_000,
});

function inbound(patch: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    id: 'message-1',
    platform: 'discord',
    platformWorkspaceId: 'workspace-1',
    platformUserId: 'user-1',
    conversationId: 'channel-1',
    threadId: null,
    conversationKind: 'channel',
    displayLabel: 'Ada',
    text: 'status',
    attachments: [],
    isBot: false,
    mentioned: true,
    usefulResponseExpected: true,
    receivedAt: 10_000,
    ...patch,
  };
}

function adapter(messages: readonly NormalizedInboundMessage[]): MessagingAdapter {
  return {
    id: 'discord',
    capabilities: discordCapabilities,
    connect: async () => ({ status: 'connected' }),
    disconnect: async () => undefined,
    receive: async () => messages,
    send: async (message) => ({
      platform: 'discord',
      conversationId: message.conversationId,
      messageId: 'delivered-1',
      deliveredAt: 10_001,
    }),
  };
}

describe('messaging gateway pairing and identity', () => {
  it('denies unknown identities and authorizes only the exact explicitly approved pairing', async () => {
    const service = createMessagingGatewayService({
      pairingCodeGenerator: () => 'PAIR-7YQK-2M9P',
      digestPairingCode: async (code) => `digest:${code}`,
      pairingTtlMs: 60_000,
    });
    const identity = {
      ownerId: 'owner-1',
      platform: 'discord' as const,
      platformWorkspaceId: 'workspace-1',
      platformUserId: 'user-1',
    };

    expect(service.resolveIdentity(identity)).toBeNull();
    expect(
      service.resolveIdentity({
        ...identity,
        platformUserId: 'user-with-the-same-display-name',
      }),
    ).toBeNull();

    const pairing = await service.startPairing({
      ...identity,
      displayLabel: 'Ada',
      profileId: 'profile-1',
      requestedScopes: ['status_read'],
      now: 1_000,
    });
    expect(pairing).toEqual({
      pairingId: expect.stringMatching(/^pairing:/),
      code: 'PAIR-7YQK-2M9P',
      expiresAt: 61_000,
    });
    expect(service.resolveIdentity(identity)).toBeNull();

    await expect(
      service.redeemPairing({
        ...identity,
        code: 'WRONG-CODE',
        now: 2_000,
      }),
    ).rejects.toMatchObject({
      code: 'pairing_denied',
      message: 'Messaging gateway pairing was denied.',
    } satisfies Partial<MessagingGatewayError>);

    const pending = await service.redeemPairing({
      ...identity,
      code: pairing.code,
      now: 2_001,
    });
    expect(pending.status).toBe('pending_approval');
    expect(service.resolveIdentity(identity)).toBeNull();

    await expect(
      service.approvePairing({
        pairingId: pairing.pairingId,
        ownerId: 'different-owner',
        role: 'readonly_status',
        approvedScopes: ['status_read'],
        now: 2_002,
      }),
    ).rejects.toMatchObject({ code: 'pairing_denied' });

    const link = await service.approvePairing({
      pairingId: pairing.pairingId,
      ownerId: 'owner-1',
      role: 'readonly_status',
      approvedScopes: ['status_read'],
      now: 2_003,
    });
    expect(link).toMatchObject({
      ownerId: 'owner-1',
      platform: 'discord',
      platformWorkspaceId: 'workspace-1',
      platformUserId: 'user-1',
      displayLabel: 'Ada',
      profileId: 'profile-1',
      trustLevel: 'approved',
      role: 'readonly_status',
      scopes: ['status_read'],
    });
    expect(service.resolveIdentity(identity)).toEqual(link);
    expect(
      service.resolveIdentity({
        ...identity,
        platformUserId: 'user-with-the-same-display-name',
      }),
    ).toBeNull();
  });

  it('expires, rate-limits, prevents replay, disables email, and revokes fail closed', async () => {
    const service = createMessagingGatewayService({
      pairingCodeGenerator: () => 'PAIR-7YQK-2M9P',
      digestPairingCode: async (code) => `digest:${code}`,
      pairingTtlMs: 30_000,
      pairingAttemptLimit: 2,
      pairingAttemptWindowMs: 60_000,
    });
    const expired = await service.startPairing({
      ...address,
      displayLabel: 'Ada',
      profileId: 'profile-1',
      requestedScopes: ['status_read'],
      now: 1_000,
    });
    await expect(
      service.redeemPairing({ ...address, code: expired.code, now: expired.expiresAt + 1 }),
    ).rejects.toMatchObject({ code: 'pairing_expired' });

    const freshAddress = { ...address, platformUserId: 'user-2' };
    const fresh = await service.startPairing({
      ...freshAddress,
      displayLabel: 'Grace',
      profileId: 'profile-2',
      requestedScopes: ['status_read'],
      now: 40_000,
    });
    await expect(
      service.redeemPairing({ ...freshAddress, code: 'WRONG-1', now: 40_001 }),
    ).rejects.toMatchObject({ code: 'pairing_denied' });
    await expect(
      service.redeemPairing({ ...freshAddress, code: 'WRONG-2', now: 40_002 }),
    ).rejects.toMatchObject({ code: 'pairing_denied' });
    await expect(
      service.redeemPairing({ ...freshAddress, code: fresh.code, now: 40_003 }),
    ).rejects.toMatchObject({ code: 'pairing_rate_limited' });

    const approvedAddress = { ...address, platformUserId: 'user-3' };
    const link = await approveIdentity(service, { identity: approvedAddress, now: 110_000 });
    const activePairing = await service.startPairing({
      ...approvedAddress,
      displayLabel: 'Ada',
      profileId: 'profile-1',
      requestedScopes: ['status_read'],
      now: 111_000,
    });
    await service.redeemPairing({
      ...approvedAddress,
      code: activePairing.code,
      now: 111_001,
    });
    await expect(
      service.redeemPairing({
        ...approvedAddress,
        code: activePairing.code,
        now: 111_002,
      }),
    ).rejects.toMatchObject({ code: 'pairing_denied' });

    service.revokeIdentity({ identityLinkId: link.id, ownerId: 'owner-1', now: 112_000 });
    expect(service.resolveIdentity(approvedAddress)).toBeNull();

    await expect(
      service.startPairing({
        ...address,
        platform: 'email',
        displayLabel: 'Email User',
        profileId: 'profile-email',
        requestedScopes: ['status_read'],
        now: 120_000,
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('messaging gateway authorization and conversation isolation', () => {
  it('keeps every endpoint separate until an explicit owner-scoped link is created', async () => {
    const service = createMessagingGatewayService({
      pairingCodeGenerator: () => 'PAIR-7YQK-2M9P',
      digestPairingCode: async (code) => `digest:${code}`,
    });
    await approveIdentity(service);
    const dm = inbound({
      conversationKind: 'dm',
      conversationId: 'dm-1',
      threadId: null,
    });
    const thread = inbound({
      id: 'message-2',
      conversationKind: 'thread',
      conversationId: 'channel-1',
      threadId: 'thread-1',
    });
    const dmDecision = service.authorizeNormalizedInbound({
      ownerId: 'owner-1',
      message: dm,
      groupPolicy: null,
      now: 10_000,
    });
    const threadDecision = service.authorizeNormalizedInbound({
      ownerId: 'owner-1',
      message: thread,
      groupPolicy: {
        replyOnlyWhenMentioned: true,
        replyToThreads: true,
        approvedChannelIds: ['channel-1'],
        ignoreBots: true,
        cooldownMs: 0,
      },
      now: 10_001,
    });
    expect(dmDecision.gatewayConversationId).not.toBe(threadDecision.gatewayConversationId);
    expect(dmDecision.context).toEqual({
      projectId: null,
      profileId: 'profile-1',
      privateMemoryAllowed: false,
    });

    service.linkConversation({
      ownerId: 'owner-1',
      endpoint: service.endpointFromMessage(thread),
      gatewayConversationId: 'conversation-explicit',
      projectId: 'project-1',
      profileId: 'profile-group',
      now: 10_002,
    });
    const linked = service.authorizeNormalizedInbound({
      ownerId: 'owner-1',
      message: { ...thread, id: 'message-3' },
      groupPolicy: {
        replyOnlyWhenMentioned: true,
        replyToThreads: true,
        approvedChannelIds: ['channel-1'],
        ignoreBots: true,
        cooldownMs: 0,
      },
      now: 10_003,
    });
    expect(linked.gatewayConversationId).toBe('conversation-explicit');
    expect(linked.context).toEqual({
      projectId: null,
      profileId: null,
      privateMemoryAllowed: false,
    });
  });

  it('gates every privileged operation by both role and per-user scope', async () => {
    const service = createMessagingGatewayService({
      pairingCodeGenerator: () => 'PAIR-7YQK-2M9P',
      digestPairingCode: async (code) => `digest:${code}`,
    });
    await approveIdentity(service, {
      role: 'approved_user',
      scopes: ['status_read', 'slash_command', 'project_read'],
    });
    expect(service.authorizeAction({ identity: address, action: 'status_read' })).toEqual({
      allowed: true,
      code: 'authorized',
    });
    expect(service.authorizeAction({ identity: address, action: 'project_read' })).toEqual({
      allowed: true,
      code: 'authorized',
    });
    expect(service.authorizeAction({ identity: address, action: 'model_switch' })).toEqual({
      allowed: false,
      code: 'scope_denied',
    });
    expect(
      service.authorizeAction({
        identity: { ...address, platformUserId: 'unknown' },
        action: 'status_read',
      }),
    ).toEqual({ allowed: false, code: 'unknown_identity' });
  });
});

describe('messaging gateway adapter capabilities and inbound policy', () => {
  it('exposes and prepares only behavior the registered adapter truly supports', () => {
    const service = createMessagingGatewayService();
    service.registerAdapter(adapter([]));

    expect(service.exposedCapabilities('discord')).toEqual([
      'text',
      'markdown',
      'images',
      'files',
      'threads',
      'reactions',
      'typing',
    ]);
    expect(() =>
      service.prepareOutbound('discord', {
        idempotencyKey: 'outbound-1',
        conversationId: 'channel-1',
        threadId: null,
        text: 'x'.repeat(2_001),
        markdown: false,
        attachments: [],
        progressiveUpdate: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'capability_denied' }));
    expect(() =>
      service.prepareOutbound('discord', {
        idempotencyKey: 'outbound-2',
        conversationId: 'channel-1',
        threadId: null,
        text: 'voice',
        markdown: false,
        attachments: [
          {
            attachmentId: 'attachment-1',
            kind: 'voice_note',
            mimeType: 'audio/ogg',
            sizeBytes: 1_000,
          },
        ],
        progressiveUpdate: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'capability_denied' }));
  });

  it('normalizes once and enforces bot, mention, channel, thread, cooldown, and usefulness policy', async () => {
    const service = createMessagingGatewayService({
      pairingCodeGenerator: () => 'PAIR-7YQK-2M9P',
      digestPairingCode: async (code) => `digest:${code}`,
    });
    await approveIdentity(service, {
      role: 'group_participant',
      scopes: ['status_read'],
    });
    service.registerAdapter(
      adapter([
        inbound(),
        inbound({ id: 'bot', isBot: true }),
        inbound({ id: 'unmentioned', mentioned: false }),
        inbound({ id: 'wrong-channel', conversationId: 'channel-2' }),
        inbound({ id: 'thread', threadId: 'thread-1', conversationKind: 'thread' }),
        inbound({ id: 'not-useful', usefulResponseExpected: false }),
      ]),
    );
    const policy = {
      replyOnlyWhenMentioned: true,
      replyToThreads: false,
      approvedChannelIds: ['channel-1'],
      ignoreBots: true,
      cooldownMs: 10_000,
    };

    const first = await service.receiveVerifiedEvent({
      ownerId: 'owner-1',
      adapterId: 'discord',
      event: { id: 'event-1', receivedAt: 10_000, payload: Object.freeze({}) },
      groupPolicy: policy,
      now: 10_000,
    });
    expect(first.map(({ status, code }) => ({ status, code }))).toEqual([
      { status: 'authorized', code: 'authorized' },
      { status: 'ignored', code: 'bot_ignored' },
      { status: 'ignored', code: 'mention_required' },
      { status: 'ignored', code: 'channel_denied' },
      { status: 'ignored', code: 'thread_denied' },
      { status: 'ignored', code: 'not_useful' },
    ]);
    service.recordReply({
      ownerId: 'owner-1',
      endpoint: service.endpointFromMessage(inbound()),
      now: 10_001,
    });
    const cooldown = service.authorizeNormalizedInbound({
      ownerId: 'owner-1',
      message: inbound({ id: 'cooldown', receivedAt: 10_002 }),
      groupPolicy: policy,
      now: 10_002,
    });
    expect(cooldown).toMatchObject({ status: 'ignored', code: 'cooldown_active' });

    const duplicate = await service.receiveVerifiedEvent({
      ownerId: 'owner-1',
      adapterId: 'discord',
      event: { id: 'event-1', receivedAt: 10_003, payload: Object.freeze({}) },
      groupPolicy: policy,
      now: 10_003,
    });
    expect(duplicate.every((decision) => decision.status === 'duplicate')).toBe(true);
  });
});
