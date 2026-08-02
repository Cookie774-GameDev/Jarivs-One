export type MessagingPlatform =
  | 'phone'
  | 'sms'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'email'
  | 'whatsapp'
  | 'signal'
  | 'native'
  | 'cli';

export type GatewayRole =
  | 'owner_admin'
  | 'approved_user'
  | 'readonly_status'
  | 'group_participant'
  | 'blocked';

export type GatewayScope =
  | 'status_read'
  | 'slash_command'
  | 'model_switch'
  | 'costly_operation'
  | 'memory_read'
  | 'project_read'
  | 'file_read'
  | 'tool_action';

export interface GatewayIdentityAddress {
  ownerId: string;
  platform: MessagingPlatform;
  platformWorkspaceId: string;
  platformUserId: string;
}

export interface GatewayIdentityLink extends GatewayIdentityAddress {
  id: string;
  displayLabel: string;
  profileId: string;
  trustLevel: 'unverified' | 'paired' | 'approved' | 'admin';
  role: GatewayRole;
  scopes: readonly GatewayScope[];
  createdAt: number;
  revokedAt?: number;
}

export interface GatewayPairingRecord extends GatewayIdentityAddress {
  id: string;
  displayLabel: string;
  profileId: string;
  requestedScopes: readonly GatewayScope[];
  codeDigest: string;
  status: 'issued' | 'pending_approval' | 'approved' | 'revoked';
  createdAt: number;
  expiresAt: number;
  redeemedAt?: number;
  approvedAt?: number;
}

export type MessagingSupportStatus =
  | 'supported'
  | 'experimental'
  | 'self_hosted'
  | 'external_bridge_required'
  | 'unsupported';

export interface MessagingCapabilities {
  support: MessagingSupportStatus;
  text: boolean;
  markdown: false | 'platform' | 'commonmark';
  images: boolean;
  files: boolean;
  audio: boolean;
  voiceNotes: boolean;
  threads: boolean;
  reactions: boolean;
  typing: boolean;
  progressiveUpdates: boolean;
  maxTextLength: number;
  maxFileBytes: number;
}

export interface MessagingAttachment {
  attachmentId: string;
  kind: 'image' | 'file' | 'audio' | 'voice_note';
  mimeType: string;
  sizeBytes: number;
}

export type ConversationKind = 'dm' | 'channel' | 'thread' | 'group';

export interface ConversationEndpoint {
  platform: MessagingPlatform;
  platformWorkspaceId: string;
  conversationId: string;
  threadId: string | null;
  conversationKind: ConversationKind;
}

export interface VerifiedInboundEvent {
  id: string;
  receivedAt: number;
  payload: unknown;
}

export interface NormalizedInboundMessage extends ConversationEndpoint {
  id: string;
  platformUserId: string;
  displayLabel: string;
  text: string;
  attachments: readonly MessagingAttachment[];
  isBot: boolean;
  mentioned: boolean;
  usefulResponseExpected: boolean;
  receivedAt: number;
}

export interface NormalizedOutboundMessage {
  idempotencyKey: string;
  conversationId: string;
  threadId: string | null;
  text: string;
  markdown: boolean;
  attachments: readonly MessagingAttachment[];
  progressiveUpdate: boolean;
}

export interface DeliveryReceipt {
  platform: MessagingPlatform;
  conversationId: string;
  messageId: string;
  deliveredAt: number;
}

export interface OutboundPatch {
  messageId: string;
  text: string;
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'degraded';
  detail?: string;
}

export interface MessagingAdapter {
  readonly id: MessagingPlatform;
  readonly capabilities: MessagingCapabilities;
  connect(): Promise<ConnectionState>;
  disconnect(): Promise<void>;
  receive(event: VerifiedInboundEvent): Promise<readonly NormalizedInboundMessage[]>;
  send(message: NormalizedOutboundMessage): Promise<DeliveryReceipt>;
  edit?(patch: OutboundPatch): Promise<DeliveryReceipt>;
  react?(conversationId: string, messageId: string, reaction: string): Promise<void>;
  setTyping?(conversationId: string, active: boolean): Promise<void>;
}

export interface GatewayConversationLink {
  ownerId: string;
  endpoint: ConversationEndpoint;
  gatewayConversationId: string;
  projectId: string | null;
  profileId: string | null;
  linkedAt: number;
}

export interface GatewayGroupPolicy {
  replyOnlyWhenMentioned: boolean;
  replyToThreads: boolean;
  approvedChannelIds: readonly string[];
  ignoreBots: boolean;
  cooldownMs: number;
}

export interface GatewayDecision {
  status: 'authorized' | 'ignored' | 'denied' | 'duplicate';
  code: string;
  gatewayConversationId: string | null;
  context: {
    projectId: string | null;
    profileId: string | null;
    privateMemoryAllowed: boolean;
  };
}
