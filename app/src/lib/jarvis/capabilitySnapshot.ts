import type {
  JarvisCapabilityRef,
  JarvisCapabilitySnapshot,
  JarvisEntitlementSnapshot,
} from '@/lib/jarvis/contracts';
import { validateJarvisCapabilitySnapshot } from '@/lib/jarvis/contracts';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';

export interface CapabilitySnapshotInput {
  capturedAt: number;
  tools: readonly JarvisCapabilityRef[];
  plugins: readonly JarvisCapabilityRef[];
  mcps: readonly JarvisCapabilityRef[];
  terminals: readonly JarvisCapabilityRef[];
  agents: readonly JarvisCapabilityRef[];
  entitlements: JarvisEntitlementSnapshot;
}

export interface JarvisCapabilitySnapshotProvider {
  getForAccount(accountId: string): Promise<Readonly<JarvisCapabilitySnapshot>>;
}

export class CapabilityAccountUnavailableError extends Error {
  readonly code = 'capability_account_unavailable' as const;

  constructor() {
    super('Capability state is unavailable for the active account.');
    this.name = 'CapabilityAccountUnavailableError';
  }
}

export class JarvisCapabilitySnapshotError extends Error {
  readonly code = 'invalid_capability_snapshot' as const;

  constructor() {
    super('Invalid JARVIS capability snapshot.');
    this.name = 'JarvisCapabilitySnapshotError';
  }
}

function hasLiveEvidence(ref: JarvisCapabilityRef): boolean {
  return (
    typeof ref.evidenceRef === 'string' &&
    ref.evidenceRef.trim().length > 0 &&
    typeof ref.lastVerifiedAt === 'number' &&
    Number.isFinite(ref.lastVerifiedAt)
  );
}

function copyCapability(ref: JarvisCapabilityRef): JarvisCapabilityRef {
  const requiresEvidence = ref.state === 'connected' || ref.state === 'authenticated';
  const state = requiresEvidence && !hasLiveEvidence(ref) ? 'available' : ref.state;
  return {
    id: ref.id,
    state,
    operations: [...ref.operations],
    ...(ref.evidenceRef === undefined ? {} : { evidenceRef: ref.evidenceRef }),
    ...(ref.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: ref.lastVerifiedAt }),
  };
}

function copyCapabilityList(refs: readonly JarvisCapabilityRef[]): JarvisCapabilityRef[] {
  return refs
    .map(copyCapability)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function copyEntitlements(entitlements: JarvisEntitlementSnapshot): JarvisEntitlementSnapshot {
  return {
    source: entitlements.source,
    ...(entitlements.planId === undefined ? {} : { planId: entitlements.planId }),
    capabilities: [...entitlements.capabilities],
    ...(entitlements.verifiedAt === undefined ? {} : { verifiedAt: entitlements.verifiedAt }),
    ...(entitlements.expiresAt === undefined ? {} : { expiresAt: entitlements.expiresAt }),
  };
}

export function createJarvisCapabilitySnapshot(
  input: CapabilitySnapshotInput,
): Readonly<JarvisCapabilitySnapshot> {
  const snapshot: JarvisCapabilitySnapshot = {
    capturedAt: input.capturedAt,
    tools: copyCapabilityList(input.tools),
    plugins: copyCapabilityList(input.plugins),
    mcps: copyCapabilityList(input.mcps),
    terminals: copyCapabilityList(input.terminals),
    agents: copyCapabilityList(input.agents),
    entitlements: copyEntitlements(input.entitlements),
  };
  const validation = validateJarvisCapabilitySnapshot(snapshot);
  if (!validation.ok) throw new JarvisCapabilitySnapshotError();
  return deepFreezeJarvisCopy(snapshot);
}

export function createJarvisCapabilitySnapshotProvider(input: {
  getActiveAccountId(): string | undefined;
  resolveInputForActiveAccount(accountId: string): Promise<CapabilitySnapshotInput>;
}): JarvisCapabilitySnapshotProvider {
  return {
    async getForAccount(accountId: string): Promise<Readonly<JarvisCapabilitySnapshot>> {
      if (!accountId.trim() || input.getActiveAccountId() !== accountId) {
        throw new CapabilityAccountUnavailableError();
      }

      const resolved = await input.resolveInputForActiveAccount(accountId);
      if (input.getActiveAccountId() !== accountId) {
        throw new CapabilityAccountUnavailableError();
      }

      return createJarvisCapabilitySnapshot(resolved);
    },
  };
}
