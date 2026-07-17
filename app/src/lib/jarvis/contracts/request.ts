import type { LLMMessage } from '@/lib/ai';
import type { JarvisIdentitySnapshot } from '@/lib/jarvis/identity';
import type { JarvisProfileSnapshot } from '@/lib/jarvis/profiles/types';
import type { JarvisCapabilitySnapshot, JarvisModelSnapshot } from './capability';
import type { JarvisOutputContract, JarvisResponseMode } from './response';
import type { JarvisContextPack } from './source';

export interface JarvisRequestEnvelope {
  schemaVersion: 1;
  requestId: string;
  runId: string;
  accountId: string;
  workspaceId?: string;
  projectId?: string;
  chatId?: string;
  parentRunId?: string;
  agent: { id: string; slug: string; builtin: boolean };
  surface: 'typed_chat' | 'voice' | 'schedule' | 'hive_final' | 'phone' | 'browser_chat';
  interactionMode: 'ask' | 'plan' | 'agent';
  responseModeHint?: JarvisResponseMode;
  userText: string;
  messageHistory: LLMMessage[];
  identity: JarvisIdentitySnapshot;
  profile: JarvisProfileSnapshot;
  capabilities: JarvisCapabilitySnapshot;
  model: JarvisModelSnapshot;
  context: JarvisContextPack;
  outputContract: JarvisOutputContract;
  createdAt: number;
}
