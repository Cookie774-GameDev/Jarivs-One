import type {
  SecondBrainApplyReceipt,
  SecondBrainChange,
  SecondBrainTarget,
} from './nightlySecondBrain';
import type { ProductionSiyuanRlmPort } from './siyuanRlmProduction';

export interface SiyuanManagedProposal {
  target: SecondBrainTarget;
  content: string;
  provenance: readonly string[];
  confidence: number;
}

type ManagedSpec = {
  title: string;
  path: string;
  marker: string;
};

const MANAGED_SPECS: Readonly<Record<SecondBrainTarget, ManagedSpec>> = Object.freeze({
  context_map: Object.freeze({
    title: 'VibeSpace Project Context',
    path: '/VibeSpace Managed/Project Context',
    marker: '<!-- vibespace-managed-key:project-context -->',
  }),
  user_md: Object.freeze({
    title: 'VibeSpace User Profile',
    path: '/VibeSpace Managed/User Profile',
    marker: '<!-- vibespace-managed-key:user-profile -->',
  }),
  related_markdown: Object.freeze({
    title: 'VibeSpace Working Context',
    path: '/VibeSpace Managed/Working Context',
    marker: '<!-- vibespace-managed-key:working-context -->',
  }),
});

function normalized(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function sourcePointer(id: string): string {
  return id
    .replace(/[\u0000-\u001f,]/gu, ' ')
    .trim()
    .slice(0, 256);
}

export function siyuanManagedMarkdown(
  target: SecondBrainTarget,
  before: string,
  fact: string,
  provenance: readonly string[],
): string {
  const spec = MANAGED_SPECS[target];
  const cleanFact = fact.trim().replace(/\r\n?/gu, '\n').replace(/\n+/gu, ' ').slice(0, 2_000);
  if (!cleanFact || normalized(before).includes(normalized(cleanFact))) return before;
  const cleanSources = [...new Set(provenance.map(sourcePointer).filter(Boolean))];
  if (cleanSources.length === 0) return before;
  const base = before.trim() || `# ${spec.title}\n\n${spec.marker}`;
  return `${base}\n\n- ${cleanFact}\n  - Sources: ${cleanSources.join(', ')}\n`;
}

export async function proposeSiyuanManagedChanges(input: {
  projectId: string;
  proposals: readonly SiyuanManagedProposal[];
  port: ProductionSiyuanRlmPort;
  now?: number;
}): Promise<readonly SecondBrainChange[]> {
  const now = input.now ?? Date.now();
  const changes: SecondBrainChange[] = [];
  for (const [index, proposal] of input.proposals.entries()) {
    const spec = MANAGED_SPECS[proposal.target];
    const document = await input.port.readManagedDocument(input.projectId, {
      query: spec.title,
      marker: spec.marker,
    });
    const before = document?.markdown ?? '';
    const after = siyuanManagedMarkdown(
      proposal.target,
      before,
      proposal.content,
      proposal.provenance,
    );
    if (after === before) continue;
    changes.push(
      Object.freeze({
        id: `second-brain-change-${now}-${index}`,
        target: proposal.target,
        backend: 'siyuan' as const,
        ...(document ? { targetBlockId: document.id } : {}),
        path: spec.path,
        before,
        after,
        provenance: Object.freeze([...proposal.provenance]),
        confidence: proposal.confidence,
      }),
    );
  }
  return Object.freeze(changes);
}

function assertSiyuanChange(change: SecondBrainChange): ManagedSpec {
  if (change.backend !== 'siyuan') throw new Error('siyuan_managed_change_backend_invalid');
  const spec = MANAGED_SPECS[change.target];
  if (change.path !== spec.path || !change.after.includes(spec.marker)) {
    throw new Error('siyuan_managed_change_target_invalid');
  }
  return spec;
}

async function applyOne(
  projectId: string,
  change: SecondBrainChange,
  port: ProductionSiyuanRlmPort,
): Promise<SecondBrainChange> {
  assertSiyuanChange(change);
  if (change.before) {
    if (!change.targetBlockId) throw new Error('siyuan_managed_block_missing');
    const document = await port.updateManagedDocument(
      projectId,
      change.targetBlockId,
      change.before,
      change.after,
    );
    if (!document.markdown.includes(MANAGED_SPECS[change.target].marker)) {
      await port.updateManagedDocument(projectId, document.id, document.markdown, change.before);
      throw new Error('siyuan_managed_document_authority_invalid');
    }
    return Object.freeze({ ...change, targetBlockId: document.id, after: document.markdown });
  }
  if (change.targetBlockId) throw new Error('siyuan_managed_create_identity_invalid');
  const document = await port.createManagedDocument(projectId, change.path, change.after);
  if (!document.markdown.includes(MANAGED_SPECS[change.target].marker)) {
    await port.deleteManagedDocument(projectId, document.id, document.markdown);
    throw new Error('siyuan_managed_document_authority_invalid');
  }
  return Object.freeze({ ...change, targetBlockId: document.id, after: document.markdown });
}

async function rollbackOne(
  projectId: string,
  change: SecondBrainChange,
  port: ProductionSiyuanRlmPort,
): Promise<void> {
  const spec = assertSiyuanChange(change);
  const current = await port.readManagedDocument(projectId, {
    query: spec.title,
    marker: spec.marker,
  });
  if (!current || current.markdown !== change.after) throw new Error('siyuan_conflict');
  if (change.before) {
    await port.updateManagedDocument(projectId, current.id, change.after, change.before);
  } else {
    await port.deleteManagedDocument(projectId, current.id, change.after);
  }
}

async function restoreOne(
  projectId: string,
  change: SecondBrainChange,
  port: ProductionSiyuanRlmPort,
): Promise<void> {
  const spec = assertSiyuanChange(change);
  const current = await port.readManagedDocument(projectId, {
    query: spec.title,
    marker: spec.marker,
  });
  if (change.before) {
    if (!current || current.markdown !== change.before) throw new Error('siyuan_conflict');
    await port.updateManagedDocument(projectId, current.id, change.before, change.after);
  } else {
    if (current) throw new Error('siyuan_conflict');
    await port.createManagedDocument(projectId, change.path, change.after);
  }
}

export async function applySiyuanManagedChanges(input: {
  projectId: string;
  changes: readonly SecondBrainChange[];
  port: ProductionSiyuanRlmPort;
}): Promise<SecondBrainApplyReceipt> {
  if (input.changes.length === 0) return { changes: Object.freeze([]), snapshotCreated: false };
  for (const change of input.changes) assertSiyuanChange(change);
  await input.port.createManagedSnapshot(
    input.projectId,
    `Nightly managed context ${new Date().toISOString().slice(0, 10)}`,
  );
  const applied: SecondBrainChange[] = [];
  try {
    for (const change of input.changes)
      applied.push(await applyOne(input.projectId, change, input.port));
  } catch (cause) {
    let rollbackFailure: unknown;
    for (const change of [...applied].reverse()) {
      try {
        await rollbackOne(input.projectId, change, input.port);
      } catch (error) {
        rollbackFailure ??= error;
      }
    }
    if (rollbackFailure) throw new Error('siyuan_managed_apply_and_rollback_failed');
    throw cause;
  }
  return Object.freeze({ changes: Object.freeze(applied), snapshotCreated: true });
}

export async function rollbackSiyuanManagedChanges(input: {
  projectId: string;
  changes: readonly SecondBrainChange[];
  port: ProductionSiyuanRlmPort;
}): Promise<void> {
  if (input.changes.length === 0) return;
  for (const change of input.changes) assertSiyuanChange(change);
  await input.port.createManagedSnapshot(
    input.projectId,
    `Before Nightly rollback ${new Date().toISOString().slice(0, 10)}`,
  );
  const rolledBack: SecondBrainChange[] = [];
  try {
    for (const change of input.changes) {
      await rollbackOne(input.projectId, change, input.port);
      rolledBack.push(change);
    }
  } catch (cause) {
    let restoreFailure: unknown;
    for (const change of [...rolledBack].reverse()) {
      try {
        await restoreOne(input.projectId, change, input.port);
      } catch (error) {
        restoreFailure ??= error;
      }
    }
    if (restoreFailure) throw new Error('siyuan_managed_rollback_and_restore_failed');
    throw cause;
  }
}
