import type {
  ConversationEndpoint,
  GatewayConversationLink,
  GatewayIdentityAddress,
  GatewayIdentityLink,
  GatewayPairingRecord,
  MessagingPlatform,
} from './contracts';

function identityKey(address: GatewayIdentityAddress): string {
  return JSON.stringify([
    address.ownerId,
    address.platform,
    address.platformWorkspaceId,
    address.platformUserId,
  ]);
}

function endpointKey(ownerId: string, endpoint: ConversationEndpoint): string {
  return JSON.stringify([
    ownerId,
    endpoint.platform,
    endpoint.platformWorkspaceId,
    endpoint.conversationId,
    endpoint.threadId,
    endpoint.conversationKind,
  ]);
}

export class InMemoryMessagingGatewayRepository {
  readonly #identityLinks = new Map<string, GatewayIdentityLink>();
  readonly #pairings = new Map<string, GatewayPairingRecord>();
  readonly #conversationLinks = new Map<string, GatewayConversationLink>();
  readonly #defaultConversations = new Map<string, string>();
  readonly #pairingAttempts = new Map<string, number[]>();
  readonly #claimedMessages = new Set<string>();
  readonly #claimedEvents = new Map<string, number>();
  readonly #lastReplies = new Map<string, number>();
  #nextPairingId = 1;
  #nextIdentityId = 1;
  #nextConversationId = 1;

  nextPairingId(): string {
    const id = `pairing:${this.#nextPairingId}`;
    this.#nextPairingId += 1;
    return id;
  }

  nextIdentityId(): string {
    const id = `gateway-identity:${this.#nextIdentityId}`;
    this.#nextIdentityId += 1;
    return id;
  }

  savePairing(record: GatewayPairingRecord): void {
    this.#pairings.set(record.id, record);
  }

  pairingById(pairingId: string): GatewayPairingRecord | null {
    return this.#pairings.get(pairingId) ?? null;
  }

  activePairingFor(address: GatewayIdentityAddress): GatewayPairingRecord | null {
    let selected: GatewayPairingRecord | null = null;
    for (const pairing of this.#pairings.values()) {
      if (
        identityKey(pairing) === identityKey(address) &&
        pairing.status !== 'approved' &&
        pairing.status !== 'revoked' &&
        (selected === null || pairing.createdAt > selected.createdAt)
      ) {
        selected = pairing;
      }
    }
    return selected;
  }

  saveIdentityLink(link: GatewayIdentityLink): void {
    this.#identityLinks.set(identityKey(link), link);
  }

  identityLink(address: GatewayIdentityAddress): GatewayIdentityLink | null {
    const link = this.#identityLinks.get(identityKey(address)) ?? null;
    return link !== null && link.revokedAt === undefined ? link : null;
  }

  revokeIdentityLink(identityLinkId: string, ownerId: string, now: number): boolean {
    for (const [key, link] of this.#identityLinks) {
      if (link.id === identityLinkId && link.ownerId === ownerId && link.revokedAt === undefined) {
        this.#identityLinks.set(key, Object.freeze({ ...link, revokedAt: now }));
        return true;
      }
    }
    return false;
  }

  pairingAttemptCount(address: GatewayIdentityAddress, since: number): number {
    const key = identityKey(address);
    const recent = (this.#pairingAttempts.get(key) ?? []).filter((time) => time >= since);
    this.#pairingAttempts.set(key, recent);
    return recent.length;
  }

  recordPairingAttempt(address: GatewayIdentityAddress, now: number): void {
    const key = identityKey(address);
    this.#pairingAttempts.set(key, [...(this.#pairingAttempts.get(key) ?? []), now]);
  }

  saveConversationLink(link: GatewayConversationLink): void {
    this.#conversationLinks.set(endpointKey(link.ownerId, link.endpoint), link);
  }

  conversationLink(
    ownerId: string,
    endpoint: ConversationEndpoint,
  ): GatewayConversationLink | null {
    return this.#conversationLinks.get(endpointKey(ownerId, endpoint)) ?? null;
  }

  conversationId(ownerId: string, endpoint: ConversationEndpoint): string {
    const key = endpointKey(ownerId, endpoint);
    const explicit = this.#conversationLinks.get(key);
    if (explicit) return explicit.gatewayConversationId;
    const existing = this.#defaultConversations.get(key);
    if (existing) return existing;
    const id = `gateway-conversation:${this.#nextConversationId}`;
    this.#nextConversationId += 1;
    this.#defaultConversations.set(key, id);
    return id;
  }

  claimMessage(ownerId: string, endpoint: ConversationEndpoint, messageId: string): boolean {
    const key = JSON.stringify([endpointKey(ownerId, endpoint), messageId]);
    if (this.#claimedMessages.has(key)) return false;
    this.#claimedMessages.add(key);
    return true;
  }

  claimEvent(ownerId: string, adapterId: MessagingPlatform, eventId: string): number | null {
    const key = JSON.stringify([ownerId, adapterId, eventId]);
    const existing = this.#claimedEvents.get(key);
    if (existing !== undefined) return existing;
    this.#claimedEvents.set(key, -1);
    return null;
  }

  finishEvent(ownerId: string, adapterId: MessagingPlatform, eventId: string, count: number): void {
    this.#claimedEvents.set(JSON.stringify([ownerId, adapterId, eventId]), count);
  }

  lastReply(ownerId: string, endpoint: ConversationEndpoint): number | null {
    return this.#lastReplies.get(endpointKey(ownerId, endpoint)) ?? null;
  }

  recordReply(ownerId: string, endpoint: ConversationEndpoint, now: number): void {
    this.#lastReplies.set(endpointKey(ownerId, endpoint), now);
  }

  allIdentityLinksForPlatform(platform: MessagingPlatform): readonly GatewayIdentityLink[] {
    return Object.freeze(
      [...this.#identityLinks.values()].filter(
        (link) => link.platform === platform && link.revokedAt === undefined,
      ),
    );
  }
}

export function createInMemoryMessagingGatewayRepository(): InMemoryMessagingGatewayRepository {
  return new InMemoryMessagingGatewayRepository();
}
