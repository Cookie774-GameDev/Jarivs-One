import type { Chat } from '@/types/chat';
import type { TerminalSession } from '@/types/terminal';
import type { CaoTargetClaimRow } from '@/lib/db/schema';
import type { JarvisDexie } from '@/lib/db/database';
import type {
  CaoLiveTarget,
  CaoTargetIdentity,
  CaoTargetRegistry,
} from '@/lib/jarvis/executionJournal/caoTargetAuthority';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type RegistryRequest = Parameters<CaoTargetRegistry['claimExact']>[0];
type ReadRequest = Parameters<CaoTargetRegistry['readExact']>[0];
type RejectionReason = Exclude<
  Awaited<ReturnType<CaoTargetRegistry['claimExact']>>,
  { applied: true }
>['reason'];

type LiveRow =
  Readonly<{ kind: 'chat'; row: Chat }> | Readonly<{ kind: 'terminal'; row: TerminalSession }>;

function invalidRequest(input: ReadRequest, expiresAt?: number): boolean {
  if (
    !input ||
    !SAFE_ID.test(input.accountId) ||
    !SAFE_ID.test(input.workspaceId) ||
    !SAFE_ID.test(input.projectId) ||
    !SAFE_ID.test(input.runId) ||
    !SAFE_ID.test(input.leaseId) ||
    !Array.isArray(input.targets) ||
    input.targets.length === 0 ||
    input.targets.length > 32 ||
    (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt < 0))
  ) {
    return true;
  }
  const seen = new Set<string>();
  return input.targets.some((target) => {
    if (
      !target ||
      (target.kind !== 'chat' && target.kind !== 'terminal') ||
      !SAFE_ID.test(target.targetId)
    ) {
      return true;
    }
    const key = `${target.kind}\0${target.targetId}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function rowScope(row: LiveRow) {
  return {
    workspaceId: row.row.workspace_id as string,
    projectId: (row.row.project_id as string | undefined) ?? '',
  };
}

function rowRevision(row: LiveRow): number {
  return row.kind === 'chat' ? row.row.updated_at : row.row.last_active_at;
}

function rowLocked(row: LiveRow): boolean {
  return row.kind === 'chat' ? row.row.archived === true : row.row.status === 'exited';
}

function liveTarget(
  row: LiveRow,
  accountId: string,
  claim: CaoTargetClaimRow | undefined,
): CaoLiveTarget {
  return Object.freeze({
    kind: row.kind,
    targetId: row.row.id as string,
    accountId,
    workspaceId: row.row.workspace_id as string,
    projectId: (row.row.project_id as string | undefined) ?? '',
    revision: rowRevision(row),
    selected: true,
    locked: rowLocked(row),
    ...(claim ? { ownerLeaseId: claim.leaseId } : {}),
  });
}

async function readRows(
  database: JarvisDexie,
  targets: readonly CaoTargetIdentity[],
): Promise<(LiveRow | undefined)[]> {
  return Promise.all(
    targets.map(async (target) =>
      target.kind === 'chat'
        ? database.chats
            .get(target.targetId as never)
            .then((row) => (row ? ({ kind: 'chat', row } as const) : undefined))
        : database.terminal_sessions
            .get(target.targetId as never)
            .then((row) => (row ? ({ kind: 'terminal', row } as const) : undefined)),
    ),
  );
}

async function readClaims(
  database: JarvisDexie,
  targets: readonly CaoTargetIdentity[],
): Promise<(CaoTargetClaimRow | undefined)[]> {
  return Promise.all(
    targets.map((target) => database.cao_target_claims.get([target.kind, target.targetId])),
  );
}

function reject(reason: RejectionReason) {
  return Object.freeze({ applied: false as const, reason });
}

export function createProductionCaoTargetRegistry(
  database: JarvisDexie,
  now: () => number = Date.now,
): CaoTargetRegistry {
  if (!database || typeof database.transaction !== 'function' || typeof now !== 'function') {
    throw new Error('cao_target_registry_composition_invalid');
  }

  return Object.freeze({
    async claimExact(input: RegistryRequest) {
      const observedAt = now();
      if (
        invalidRequest(input, input.expiresAt) ||
        !Number.isSafeInteger(observedAt) ||
        observedAt < 0 ||
        input.expiresAt <= observedAt
      ) {
        throw new Error('cao_target_registry_request_invalid');
      }
      return database.transaction(
        'rw',
        database.workspaces,
        database.chats,
        database.terminal_sessions,
        database.cao_target_claims,
        async () => {
          const workspace = await database.workspaces.get(input.workspaceId as never);
          if (!workspace || workspace.owner_id !== input.accountId) return reject('scope_mismatch');
          const rows = await readRows(database, input.targets);
          if (rows.some((row) => !row)) return reject('missing');
          const concreteRows = rows as LiveRow[];
          if (
            concreteRows.some((row) => {
              const scope = rowScope(row);
              return scope.workspaceId !== input.workspaceId || scope.projectId !== input.projectId;
            })
          ) {
            return reject('scope_mismatch');
          }
          if (concreteRows.some(rowLocked)) return reject('locked');

          const claims = await readClaims(database, input.targets);
          for (let index = 0; index < claims.length; index += 1) {
            const claim = claims[index];
            if (!claim || claim.expiresAt <= observedAt) continue;
            const row = concreteRows[index]!;
            if (
              claim.accountId !== input.accountId ||
              claim.workspaceId !== input.workspaceId ||
              claim.projectId !== input.projectId
            ) {
              return reject('scope_mismatch');
            }
            if (claim.runId !== input.runId || claim.leaseId !== input.leaseId) {
              return reject('owned');
            }
            if (claim.targetRevision !== rowRevision(row)) return reject('revision_conflict');
          }

          for (let index = 0; index < input.targets.length; index += 1) {
            const target = input.targets[index]!;
            const row = concreteRows[index]!;
            const existing = claims[index];
            if (
              existing &&
              existing.expiresAt > observedAt &&
              existing.runId === input.runId &&
              existing.leaseId === input.leaseId
            ) {
              continue;
            }
            await database.cao_target_claims.put({
              kind: target.kind,
              targetId: target.targetId,
              accountId: input.accountId,
              workspaceId: input.workspaceId,
              projectId: input.projectId,
              runId: input.runId,
              leaseId: input.leaseId,
              targetRevision: rowRevision(row),
              claimedAt: observedAt,
              expiresAt: input.expiresAt,
            });
          }
          const committed = await readClaims(database, input.targets);
          return Object.freeze({
            applied: true as const,
            targets: Object.freeze(
              concreteRows.map((row, index) =>
                liveTarget(row, workspace.owner_id, committed[index]),
              ),
            ),
          });
        },
      );
    },

    async readExact(input: ReadRequest) {
      const observedAt = now();
      if (invalidRequest(input) || !Number.isSafeInteger(observedAt) || observedAt < 0) {
        throw new Error('cao_target_registry_request_invalid');
      }
      return database.transaction(
        'rw',
        database.workspaces,
        database.chats,
        database.terminal_sessions,
        database.cao_target_claims,
        async () => {
          const workspace = await database.workspaces.get(input.workspaceId as never);
          const rows = await readRows(database, input.targets);
          const claims = await readClaims(database, input.targets);
          const result: CaoLiveTarget[] = [];
          for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            if (!row) continue;
            const claim = claims[index];
            if (claim && claim.expiresAt <= observedAt) {
              await database.cao_target_claims.delete([claim.kind, claim.targetId]);
            }
            result.push(
              liveTarget(
                row,
                workspace?.owner_id ?? '',
                claim?.expiresAt && claim.expiresAt > observedAt ? claim : undefined,
              ),
            );
          }
          return Object.freeze(result);
        },
      );
    },

    async releaseExact(input: ReadRequest) {
      const observedAt = now();
      if (invalidRequest(input) || !Number.isSafeInteger(observedAt) || observedAt < 0) {
        throw new Error('cao_target_registry_request_invalid');
      }
      await database.transaction('rw', database.cao_target_claims, async () => {
        const claims = await readClaims(database, input.targets);
        if (
          claims.some(
            (claim) =>
              claim &&
              claim.expiresAt > observedAt &&
              (claim.accountId !== input.accountId ||
                claim.workspaceId !== input.workspaceId ||
                claim.projectId !== input.projectId ||
                claim.runId !== input.runId ||
                claim.leaseId !== input.leaseId),
          )
        ) {
          throw new Error('cao_target_release_conflict');
        }
        for (const claim of claims) {
          if (!claim) continue;
          if (
            claim.expiresAt <= observedAt ||
            (claim.accountId === input.accountId &&
              claim.workspaceId === input.workspaceId &&
              claim.projectId === input.projectId &&
              claim.runId === input.runId &&
              claim.leaseId === input.leaseId)
          ) {
            await database.cao_target_claims.delete([claim.kind, claim.targetId]);
          }
        }
      });
    },
  });
}
