import type { JarvisDexie } from '@/lib/db';
import type { DeepReadonly, ContextGraphSnapshotV2 } from './contracts';
import { createContextGraphRepository } from './repository';
import type { ProductionSiyuanRlmPort, SiyuanManagedDocument } from './siyuanRlmProduction';

const MANIFEST_PREFIX = 'siyuan-shadow-migration:v1';
const MARKER_PREFIX = 'vibespace-siyuan-shadow:v1';
const MAX_MARKDOWN_BYTES = 900_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

export type SiyuanShadowMigrationStatus = 'prepared' | 'verified' | 'rolling_back' | 'rolled_back';

export interface SiyuanShadowMapping {
  mapId: string;
  knowledgeRevision: number;
  sourceDigest: string;
  marker: string;
  path: string;
  documentId: string;
  markdownDigest: string;
}

export interface SiyuanShadowMigrationManifest {
  version: 1;
  id: string;
  accountId: string;
  projectId: string;
  status: SiyuanShadowMigrationStatus;
  sourceDigest: string;
  mappings: SiyuanShadowMapping[];
  rollbackCompletedDocumentIds: string[];
  rollbackPendingDocumentId?: string;
  sourceRetained: true;
  snapshotCreated: boolean;
  rollbackSnapshotCreated: boolean;
  createdAt: number;
  updatedAt: number;
  verifiedAt?: number;
  rolledBackAt?: number;
}

export interface SiyuanShadowMigrationStore {
  listSnapshots(
    accountId: string,
    projectId: string,
  ): Promise<readonly DeepReadonly<ContextGraphSnapshotV2>[]>;
  readManifest(accountId: string, projectId: string): Promise<SiyuanShadowMigrationManifest | null>;
  writeManifest(manifest: SiyuanShadowMigrationManifest): Promise<void>;
}

export interface SiyuanShadowMigrationPort {
  readManagedDocument(
    projectId: string,
    lookup: { query: string; marker: string },
  ): Promise<SiyuanManagedDocument | null>;
  createManagedDocument(
    projectId: string,
    path: string,
    markdown: string,
  ): Promise<SiyuanManagedDocument>;
  getBlock(projectId: string, id: string): Promise<SiyuanManagedDocument>;
  deleteManagedDocument(projectId: string, id: string, expectedMarkdown: string): Promise<void>;
  createManagedSnapshot(projectId: string, memo: string): Promise<void>;
}

export interface SiyuanShadowMigrationPreview {
  mapCount: number;
  entityCount: number;
  edgeCount: number;
  provenanceCount: number;
  sourceDigest: string;
  markdownBytes: number;
}

interface ShadowPlan {
  mapId: string;
  knowledgeRevision: number;
  sourceDigest: string;
  marker: string;
  path: string;
  markdown: string;
  markdownDigest: string;
}

function fail(code: string): never {
  throw new Error(code);
}

function exactId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !ID.test(value)) fail(code);
  return value;
}

function exactDigest(value: unknown, code: string): string {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail(code);
  return value;
}

function safeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code);
  return value as number;
}

function plainRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], code: string) {
  const keys = Object.keys(record).sort();
  const expected = [...allowed].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(code);
  }
}

function parseMapping(value: unknown): SiyuanShadowMapping {
  const record = plainRecord(value, 'siyuan_shadow_manifest_invalid');
  exactKeys(
    record,
    [
      'mapId',
      'knowledgeRevision',
      'sourceDigest',
      'marker',
      'path',
      'documentId',
      'markdownDigest',
    ],
    'siyuan_shadow_manifest_invalid',
  );
  if (
    typeof record.marker !== 'string' ||
    !record.marker.startsWith(`${MARKER_PREFIX} `) ||
    typeof record.path !== 'string' ||
    !record.path.startsWith('/VibeSpace Shadow/')
  ) {
    fail('siyuan_shadow_manifest_invalid');
  }
  return {
    mapId: exactId(record.mapId, 'siyuan_shadow_manifest_invalid'),
    knowledgeRevision: safeInteger(record.knowledgeRevision, 'siyuan_shadow_manifest_invalid'),
    sourceDigest: exactDigest(record.sourceDigest, 'siyuan_shadow_manifest_invalid'),
    marker: record.marker,
    path: record.path,
    documentId: exactId(record.documentId, 'siyuan_shadow_manifest_invalid'),
    markdownDigest: exactDigest(record.markdownDigest, 'siyuan_shadow_manifest_invalid'),
  };
}

export function parseSiyuanShadowMigrationManifest(value: unknown): SiyuanShadowMigrationManifest {
  const record = plainRecord(value, 'siyuan_shadow_manifest_invalid');
  const optional = [
    ...(record.verifiedAt === undefined ? [] : ['verifiedAt']),
    ...(record.rolledBackAt === undefined ? [] : ['rolledBackAt']),
    ...(record.rollbackPendingDocumentId === undefined ? [] : ['rollbackPendingDocumentId']),
  ];
  exactKeys(
    record,
    [
      'version',
      'id',
      'accountId',
      'projectId',
      'status',
      'sourceDigest',
      'mappings',
      'rollbackCompletedDocumentIds',
      'sourceRetained',
      'snapshotCreated',
      'rollbackSnapshotCreated',
      'createdAt',
      'updatedAt',
      ...optional,
    ],
    'siyuan_shadow_manifest_invalid',
  );
  if (
    record.version !== 1 ||
    !['prepared', 'verified', 'rolling_back', 'rolled_back'].includes(String(record.status)) ||
    record.sourceRetained !== true ||
    typeof record.snapshotCreated !== 'boolean' ||
    typeof record.rollbackSnapshotCreated !== 'boolean' ||
    !Array.isArray(record.mappings) ||
    !Array.isArray(record.rollbackCompletedDocumentIds) ||
    record.mappings.length > 10_000
  ) {
    fail('siyuan_shadow_manifest_invalid');
  }
  const mappings = record.mappings.map(parseMapping);
  const rollbackCompletedDocumentIds = record.rollbackCompletedDocumentIds.map((value) =>
    exactId(value, 'siyuan_shadow_manifest_invalid'),
  );
  const rollbackPendingDocumentId =
    record.rollbackPendingDocumentId === undefined
      ? undefined
      : exactId(record.rollbackPendingDocumentId, 'siyuan_shadow_manifest_invalid');
  if (new Set(mappings.map(({ mapId }) => mapId)).size !== mappings.length) {
    fail('siyuan_shadow_manifest_invalid');
  }
  if (
    new Set(rollbackCompletedDocumentIds).size !== rollbackCompletedDocumentIds.length ||
    rollbackCompletedDocumentIds.some(
      (documentId) => !mappings.some((mapping) => mapping.documentId === documentId),
    ) ||
    (rollbackPendingDocumentId !== undefined &&
      (!mappings.some((mapping) => mapping.documentId === rollbackPendingDocumentId) ||
        rollbackCompletedDocumentIds.includes(rollbackPendingDocumentId))) ||
    ((record.status === 'prepared' || record.status === 'verified') &&
      (rollbackCompletedDocumentIds.length !== 0 || rollbackPendingDocumentId !== undefined)) ||
    (record.status === 'rolled_back' &&
      (rollbackCompletedDocumentIds.length !== mappings.length ||
        rollbackPendingDocumentId !== undefined))
  ) {
    fail('siyuan_shadow_manifest_invalid');
  }
  const createdAt = safeInteger(record.createdAt, 'siyuan_shadow_manifest_invalid');
  const updatedAt = safeInteger(record.updatedAt, 'siyuan_shadow_manifest_invalid');
  const verifiedAt =
    record.verifiedAt === undefined
      ? undefined
      : safeInteger(record.verifiedAt, 'siyuan_shadow_manifest_invalid');
  const rolledBackAt =
    record.rolledBackAt === undefined
      ? undefined
      : safeInteger(record.rolledBackAt, 'siyuan_shadow_manifest_invalid');
  if (
    updatedAt < createdAt ||
    (record.status === 'verified' && verifiedAt === undefined) ||
    (record.status === 'rolled_back' && rolledBackAt === undefined)
  ) {
    fail('siyuan_shadow_manifest_invalid');
  }
  return {
    version: 1,
    id: exactId(record.id, 'siyuan_shadow_manifest_invalid'),
    accountId: exactId(record.accountId, 'siyuan_shadow_manifest_invalid'),
    projectId: exactId(record.projectId, 'siyuan_shadow_manifest_invalid'),
    status: record.status as SiyuanShadowMigrationStatus,
    sourceDigest: exactDigest(record.sourceDigest, 'siyuan_shadow_manifest_invalid'),
    mappings,
    rollbackCompletedDocumentIds,
    ...(rollbackPendingDocumentId === undefined ? {} : { rollbackPendingDocumentId }),
    sourceRetained: true,
    snapshotCreated: record.snapshotCreated,
    rollbackSnapshotCreated: record.rollbackSnapshotCreated,
    createdAt,
    updatedAt,
    ...(verifiedAt === undefined ? {} : { verifiedAt }),
    ...(rolledBackAt === undefined ? {} : { rolledBackAt }),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalSnapshot(snapshot: DeepReadonly<ContextGraphSnapshotV2>) {
  return {
    schemaVersion: 1,
    map: {
      id: snapshot.map.id,
      projectId: snapshot.map.projectId,
      name: snapshot.map.name,
      status: snapshot.map.status,
      summary: snapshot.map.summary,
      knowledgeRevision: snapshot.map.knowledgeRevision,
      sourceIds: [...snapshot.map.sourceIds].sort(),
    },
    sources: [...snapshot.sources]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ accountId: _accountId, ...source }) => source),
    entities: [...snapshot.entities]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ accountId: _accountId, ...entity }) => entity),
    edges: [...snapshot.edges]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ accountId: _accountId, ...edge }) => edge),
    provenance: [...snapshot.provenance]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ accountId: _accountId, ...entry }) => entry),
  };
}

function heading(value: string): string {
  return value
    .replace(/[\r\n\u0000-\u001f\u007f]+/gu, ' ')
    .trim()
    .slice(0, 500);
}

function slug(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return clean.slice(0, 80) || 'context-map';
}

function jsonFence(json: string): string {
  const longest = Math.max(2, ...[...json.matchAll(/`+/gu)].map(([run]) => run.length));
  return '`'.repeat(longest + 1);
}

async function buildPlans(
  snapshots: readonly DeepReadonly<ContextGraphSnapshotV2>[],
  digestText: (value: string) => Promise<string>,
): Promise<{ plans: ShadowPlan[]; sourceDigest: string }> {
  const sorted = [...snapshots].sort((left, right) => left.map.id.localeCompare(right.map.id));
  const sourceJson = JSON.stringify(sorted.map(canonicalSnapshot));
  const sourceDigest = await digestText(sourceJson);
  const plans: ShadowPlan[] = [];
  for (const snapshot of sorted) {
    if (!snapshot.map.projectId) fail('siyuan_shadow_project_required');
    const canonical = canonicalSnapshot(snapshot);
    const json = JSON.stringify(canonical, null, 2);
    const mapDigest = await digestText(JSON.stringify(canonical));
    const marker = `${MARKER_PREFIX} project=${snapshot.map.projectId} map=${snapshot.map.id} revision=${snapshot.map.knowledgeRevision}`;
    const readable = snapshot.entities
      .slice(0, 10_000)
      .map(
        (entity) =>
          `- **${heading(entity.label)}** (${entity.kind})${entity.path ? ` — ${entity.path}` : ''}${entity.summary ? `: ${heading(entity.summary)}` : ''}`,
      )
      .join('\n');
    const fence = jsonFence(json);
    const markdown = `<!-- ${marker} -->\n# ${heading(snapshot.map.name)}\n\n> Read-only VibeSpace Context shadow. Original Context records remain authoritative.\n\n${readable || '_No projected entities._'}\n\n${fence}json\n${json}\n${fence}\n`;
    if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) {
      fail('siyuan_shadow_document_too_large');
    }
    plans.push({
      mapId: snapshot.map.id,
      knowledgeRevision: snapshot.map.knowledgeRevision,
      sourceDigest: mapDigest,
      marker,
      path: `/VibeSpace Shadow/${slug(snapshot.map.name)}-${slug(snapshot.map.id)}`,
      markdown,
      markdownDigest: await digestText(markdown),
    });
  }
  return { plans, sourceDigest };
}

export function createSiyuanShadowMigrationStore(
  database: JarvisDexie,
): SiyuanShadowMigrationStore {
  const graph = createContextGraphRepository(database);
  const key = (accountId: string, projectId: string) =>
    `${MANIFEST_PREFIX}:${accountId}:${projectId}`;
  return Object.freeze<SiyuanShadowMigrationStore>({
    async listSnapshots(accountId: string, projectId: string) {
      const maps = await graph.listMaps(accountId, projectId);
      const snapshots: DeepReadonly<ContextGraphSnapshotV2>[] = [];
      for (const map of maps) {
        const snapshot = await graph.getSnapshot(accountId, map.id);
        if (!snapshot) fail('siyuan_shadow_source_missing');
        snapshots.push(snapshot);
      }
      return Object.freeze(snapshots);
    },
    async readManifest(accountId: string, projectId: string) {
      const row = await database.settings.get(key(accountId, projectId));
      return row ? parseSiyuanShadowMigrationManifest(row.value) : null;
    },
    async writeManifest(manifest: SiyuanShadowMigrationManifest) {
      await database.settings.put({
        key: key(manifest.accountId, manifest.projectId),
        value: parseSiyuanShadowMigrationManifest(manifest),
        updated_at: manifest.updatedAt,
      });
    },
  });
}

export function createSiyuanShadowMigration(
  store: SiyuanShadowMigrationStore,
  port: SiyuanShadowMigrationPort | ProductionSiyuanRlmPort,
  options: { now?: () => number; digestText?: (value: string) => Promise<string> } = {},
) {
  const now = options.now ?? Date.now;
  const digestText = options.digestText ?? sha256;

  const inventory = async (accountId: string, projectId: string) => {
    exactId(accountId, 'siyuan_shadow_identity_invalid');
    exactId(projectId, 'siyuan_shadow_identity_invalid');
    const snapshots = await store.listSnapshots(accountId, projectId);
    if (snapshots.some((snapshot) => snapshot.map.projectId !== projectId)) {
      fail('siyuan_shadow_scope_invalid');
    }
    const built = await buildPlans(snapshots, digestText);
    return { snapshots, ...built };
  };

  const verifyMappings = async (
    projectId: string,
    plans: readonly ShadowPlan[],
    manifest: SiyuanShadowMigrationManifest,
  ) => {
    for (const mapping of manifest.mappings) {
      const plan = plans.find(({ mapId }) => mapId === mapping.mapId);
      if (!plan || plan.markdownDigest !== mapping.markdownDigest) {
        fail('siyuan_shadow_source_changed');
      }
      const document = await port.getBlock(projectId, mapping.documentId);
      if ((await digestText(document.markdown)) !== mapping.markdownDigest) {
        fail('siyuan_shadow_remote_conflict');
      }
    }
  };

  return Object.freeze({
    async preview(accountId: string, projectId: string): Promise<SiyuanShadowMigrationPreview> {
      const { snapshots, plans, sourceDigest } = await inventory(accountId, projectId);
      return Object.freeze({
        mapCount: snapshots.length,
        entityCount: snapshots.reduce((sum, snapshot) => sum + snapshot.entities.length, 0),
        edgeCount: snapshots.reduce((sum, snapshot) => sum + snapshot.edges.length, 0),
        provenanceCount: snapshots.reduce((sum, snapshot) => sum + snapshot.provenance.length, 0),
        sourceDigest,
        markdownBytes: plans.reduce(
          (sum, plan) => sum + new TextEncoder().encode(plan.markdown).byteLength,
          0,
        ),
      });
    },

    async project(accountId: string, projectId: string, allowShadowWrites: boolean) {
      if (!allowShadowWrites) fail('siyuan_shadow_write_not_approved');
      const { plans, sourceDigest } = await inventory(accountId, projectId);
      let manifest = await store.readManifest(accountId, projectId);
      if (manifest?.status === 'rolled_back') fail('siyuan_shadow_manifest_rolled_back');
      if (manifest?.status === 'rolling_back') fail('siyuan_shadow_rollback_in_progress');
      if (manifest && manifest.sourceDigest !== sourceDigest) fail('siyuan_shadow_source_changed');
      if (!manifest) {
        const timestamp = now();
        manifest = {
          version: 1,
          id: `siyuan-shadow-${sourceDigest.slice(0, 24)}`,
          accountId,
          projectId,
          status: 'prepared',
          sourceDigest,
          mappings: [],
          rollbackCompletedDocumentIds: [],
          sourceRetained: true,
          snapshotCreated: false,
          rollbackSnapshotCreated: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await store.writeManifest(manifest);
      }
      await verifyMappings(projectId, plans, manifest);
      if (manifest.status === 'verified') {
        return Object.freeze({ state: 'already_verified' as const, manifest });
      }
      if (!manifest.snapshotCreated) {
        await port.createManagedSnapshot(projectId, `VibeSpace shadow projection ${manifest.id}`);
        manifest = { ...manifest, snapshotCreated: true, updatedAt: now() };
        await store.writeManifest(manifest);
      }
      for (const plan of plans) {
        if (manifest.mappings.some(({ mapId }) => mapId === plan.mapId)) continue;
        const existing = await port.readManagedDocument(projectId, {
          query: plan.mapId,
          marker: plan.marker,
        });
        let document: SiyuanManagedDocument;
        if (existing) {
          if ((await digestText(existing.markdown)) !== plan.markdownDigest) {
            fail('siyuan_shadow_remote_conflict');
          }
          document = existing;
        } else {
          document = await port.createManagedDocument(projectId, plan.path, plan.markdown);
        }
        if ((await digestText(document.markdown)) !== plan.markdownDigest) {
          fail('siyuan_shadow_round_trip_mismatch');
        }
        manifest = {
          ...manifest,
          mappings: [
            ...manifest.mappings,
            {
              mapId: plan.mapId,
              knowledgeRevision: plan.knowledgeRevision,
              sourceDigest: plan.sourceDigest,
              marker: plan.marker,
              path: plan.path,
              documentId: document.id,
              markdownDigest: plan.markdownDigest,
            },
          ],
          updatedAt: now(),
        };
        await store.writeManifest(manifest);
      }
      const after = await inventory(accountId, projectId);
      if (after.sourceDigest !== sourceDigest)
        fail('siyuan_shadow_source_changed_during_projection');
      await verifyMappings(projectId, plans, manifest);
      if (manifest.mappings.length !== plans.length) fail('siyuan_shadow_mapping_incomplete');
      const verifiedAt = now();
      manifest = { ...manifest, status: 'verified', updatedAt: verifiedAt, verifiedAt };
      await store.writeManifest(manifest);
      return Object.freeze({ state: 'verified' as const, manifest });
    },

    async rollback(accountId: string, projectId: string) {
      const manifest = await store.readManifest(accountId, projectId);
      if (!manifest) fail('siyuan_shadow_manifest_missing');
      if (manifest.status === 'rolled_back') {
        return Object.freeze({ state: 'already_rolled_back' as const, manifest });
      }
      let rollingBack = manifest;
      if (!rollingBack.rollbackSnapshotCreated) {
        await port.createManagedSnapshot(projectId, `VibeSpace shadow rollback ${manifest.id}`);
        rollingBack = { ...rollingBack, rollbackSnapshotCreated: true, updatedAt: now() };
        await store.writeManifest(rollingBack);
      }
      if (rollingBack.rollbackPendingDocumentId) {
        const pendingId = rollingBack.rollbackPendingDocumentId;
        const pendingMapping = rollingBack.mappings.find(
          (mapping) => mapping.documentId === pendingId,
        );
        if (!pendingMapping) fail('siyuan_shadow_rollback_authority_missing');
        try {
          await port.getBlock(projectId, pendingId);
        } catch {
          const existing = await port.readManagedDocument(projectId, {
            query: pendingMapping.mapId,
            marker: pendingMapping.marker,
          });
          if (existing) fail('siyuan_shadow_remote_conflict');
          const { rollbackPendingDocumentId: _pending, ...withoutPending } = rollingBack;
          rollingBack = {
            ...withoutPending,
            rollbackCompletedDocumentIds: [...rollingBack.rollbackCompletedDocumentIds, pendingId],
            updatedAt: now(),
          };
          await store.writeManifest(rollingBack);
        }
      }
      const documents = new Map<string, SiyuanManagedDocument>();
      for (const mapping of rollingBack.mappings) {
        if (rollingBack.rollbackCompletedDocumentIds.includes(mapping.documentId)) continue;
        const document = await port.getBlock(projectId, mapping.documentId);
        if ((await digestText(document.markdown)) !== mapping.markdownDigest) {
          fail('siyuan_shadow_remote_conflict');
        }
        documents.set(mapping.documentId, document);
      }
      rollingBack = {
        ...rollingBack,
        status: 'rolling_back',
        updatedAt: now(),
      };
      await store.writeManifest(rollingBack);
      for (const mapping of [...rollingBack.mappings].reverse()) {
        if (rollingBack.rollbackCompletedDocumentIds.includes(mapping.documentId)) continue;
        const document = documents.get(mapping.documentId);
        if (!document) fail('siyuan_shadow_rollback_authority_missing');
        rollingBack = {
          ...rollingBack,
          rollbackPendingDocumentId: mapping.documentId,
          updatedAt: now(),
        };
        await store.writeManifest(rollingBack);
        await port.deleteManagedDocument(projectId, mapping.documentId, document.markdown);
        const { rollbackPendingDocumentId: _pending, ...withoutPending } = rollingBack;
        rollingBack = {
          ...withoutPending,
          rollbackCompletedDocumentIds: [
            ...rollingBack.rollbackCompletedDocumentIds,
            mapping.documentId,
          ],
          updatedAt: now(),
        };
        await store.writeManifest(rollingBack);
      }
      const rolledBackAt = now();
      const rolledBack: SiyuanShadowMigrationManifest = {
        ...rollingBack,
        status: 'rolled_back',
        updatedAt: rolledBackAt,
        rolledBackAt,
      };
      await store.writeManifest(rolledBack);
      return Object.freeze({ state: 'rolled_back' as const, manifest: rolledBack });
    },
  });
}
