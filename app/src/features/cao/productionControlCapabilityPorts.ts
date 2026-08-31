import {
  CAO_CONTROL_ACTIONS,
  type CaoControlAction,
  type CaoControlScope,
  type CaoResolvedControlTarget,
} from './controlCommand';
import type { CaoControlRecord } from './controlRuntime';
import type {
  CaoCanonicalActionCapabilities,
  CaoCanonicalActionCapability,
} from './productionControlActionAdapters';

const SAFE_RECEIPT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type CaoCanonicalControlAuthorityInput = CaoControlScope &
  Readonly<{
    requestId: string;
    runId: string;
    target: CaoResolvedControlTarget;
    signal: AbortSignal;
  }>;

export type CaoCanonicalControlAuthorityResult =
  | Readonly<{ status: 'completed'; receiptId: string }>
  | Readonly<{ status: 'failed' | 'cancelled' }>;

export type CaoCanonicalControlAuthority = Partial<
  Record<
    CaoControlAction,
    (input: CaoCanonicalControlAuthorityInput) => Promise<CaoCanonicalControlAuthorityResult>
  >
>;

export type CaoCanonicalControlAuthorities = Readonly<{
  chat: CaoCanonicalControlAuthority;
  terminal: CaoCanonicalControlAuthority;
}>;

function validResult(value: unknown): value is CaoCanonicalControlAuthorityResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.status === 'completed') {
    return Object.keys(result).length === 2 && SAFE_RECEIPT_ID.test(String(result.receiptId ?? ''));
  }
  return (
    (result.status === 'failed' || result.status === 'cancelled') &&
    Object.keys(result).length === 1
  );
}

function capability(
  action: CaoControlAction,
  kind: CaoResolvedControlTarget['kind'],
  authority: NonNullable<CaoCanonicalControlAuthority[CaoControlAction]>,
): CaoCanonicalActionCapability {
  return Object.freeze({
    async execute({
      record,
      target,
      signal,
    }: {
      record: CaoControlRecord;
      target: CaoResolvedControlTarget;
      signal: AbortSignal;
    }) {
      if (signal.aborted) return { status: 'cancelled' } as const;
      if (
        record.command.action !== action ||
        target.kind !== kind ||
        !record.targets.some(
          (candidate) =>
            candidate.kind === target.kind &&
            candidate.targetId === target.targetId &&
            candidate.revision === target.revision,
        )
      ) {
        return { status: 'failed' } as const;
      }
      try {
        const result = await authority({
          accountId: record.accountId,
          workspaceId: record.workspaceId,
          projectId: record.projectId,
          requestId: record.requestId,
          runId: record.runId,
          target: structuredClone(target),
          signal,
        });
        if (signal.aborted) return { status: 'cancelled' } as const;
        return validResult(result) ? Object.freeze(structuredClone(result)) : { status: 'failed' };
      } catch {
        return signal.aborted ? { status: 'cancelled' } : { status: 'failed' };
      }
    },
  });
}

export function createProductionCaoControlCapabilities(
  authorities: CaoCanonicalControlAuthorities,
): CaoCanonicalActionCapabilities {
  if (!authorities?.chat || !authorities.terminal) {
    throw new Error('cao_control_authorities_unavailable');
  }
  return Object.freeze(
    Object.fromEntries(
      CAO_CONTROL_ACTIONS.flatMap((action) => {
        const chat = authorities.chat[action];
        const terminal = authorities.terminal[action];
        const byKind = Object.freeze({
          ...(chat ? { chat: capability(action, 'chat', chat) } : {}),
          ...(terminal ? { terminal: capability(action, 'terminal', terminal) } : {}),
        });
        return Object.keys(byKind).length > 0 ? [[action, byKind] as const] : [];
      }),
    ),
  );
}
