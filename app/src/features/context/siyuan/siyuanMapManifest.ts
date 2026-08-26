import type { ContextMapRecord } from '../tree';
import type { EffortLabel } from '@/lib/ai/catalog/modelVariants';
import { canonicalSiyuanAuthorityRoot } from './siyuanPathAuthority';

export const SIYUAN_MAP_MANIFEST_VERSION = 1 as const;

export type SiyuanSummaryMode = 'none' | 'selected' | 'all';

export interface SiyuanSummaryPolicy {
  mode: SiyuanSummaryMode;
  selectedExtensions: string[];
  selectedPaths: string[];
}

export interface SiyuanSourcePolicy {
  readOnly: true;
  excludedPaths: string[];
}

export interface SiyuanSummaryModelProvenance {
  kind: 'none' | 'local' | 'cloud-approved';
  providerId?: string;
  connectionId?: string;
  modelId?: string;
}

export interface SiyuanCloudSummaryApproval {
  providerId: string;
  connectionId: string;
  modelId: string;
  effort?: EffortLabel;
  sourceRoot: string;
  summaryPolicyFingerprint: string;
  eligibleFileCount: number;
  eligibleSourceBytes: number;
  estimatedMaxSentBytes: number;
  privacyAcknowledged: true;
  approvedAt: number;
}

export interface SiyuanMapIndexCounts {
  indexed: number;
  excluded: number;
  unreadable: number;
  summarized: number;
}

export interface SiyuanMapManifest {
  version: typeof SIYUAN_MAP_MANIFEST_VERSION;
  projectId: string;
  mapId: string;
  sourceRoot: string;
  notebookId: string | null;
  rootDocumentId: string | null;
  revision: number;
  status: 'pending' | 'indexing' | 'ready' | 'paused' | 'error' | 'recycled';
  sourcePolicy: SiyuanSourcePolicy;
  summaryPolicy: SiyuanSummaryPolicy;
  summaryModel: SiyuanSummaryModelProvenance;
  cloudSummaryApproval: SiyuanCloudSummaryApproval | null;
  counts: SiyuanMapIndexCounts;
  nodeBindings: Record<string, string>;
  updatedAt: number;
}

export const SIYUAN_MANIFEST_BINDING_CACHE_LIMIT = 512;
const MAX_INDEX_COUNT = 500_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SAFE_ROUTE_VALUE = /^[^\u0000-\u001f\u007f]{1,256}$/u;
export const DEFAULT_SIYUAN_SUMMARY_EXTENSIONS = Object.freeze([
  'css',
  'html',
  'js',
  'json',
  'md',
  'py',
  'rs',
  'ts',
  'tsx',
  'txt',
]);

function cleanList(values: readonly string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en-US'))
    .slice(0, max);
}

export function normalizeSiyuanSummaryPolicy(
  policy: Readonly<Partial<SiyuanSummaryPolicy>> | undefined,
): SiyuanSummaryPolicy {
  const mode: SiyuanSummaryMode =
    policy?.mode === 'none' || policy?.mode === 'all' ? policy.mode : 'selected';
  return Object.freeze({
    mode,
    selectedExtensions: cleanList(
      policy?.selectedExtensions ?? (mode === 'selected' ? DEFAULT_SIYUAN_SUMMARY_EXTENSIONS : []),
      256,
    ),
    selectedPaths: cleanList(policy?.selectedPaths ?? [], 2_000),
  });
}

export function normalizeSiyuanSourcePolicy(
  policy: Readonly<Partial<SiyuanSourcePolicy>> | undefined,
): SiyuanSourcePolicy {
  return Object.freeze({
    readOnly: true as const,
    excludedPaths: cleanList(policy?.excludedPaths ?? [], 2_000),
  });
}

export function createSiyuanMapManifest(
  record: ContextMapRecord,
  projectId: string,
  summaryPolicy?: Readonly<Partial<SiyuanSummaryPolicy>>,
  sourcePolicy?: Readonly<Partial<SiyuanSourcePolicy>>,
  now = Date.now(),
): SiyuanMapManifest {
  const exactProjectId = projectId.trim();
  if (!SAFE_ID.test(exactProjectId) || !SAFE_ID.test(record.id)) {
    throw new Error('siyuan_map_manifest_scope_invalid');
  }
  const sourceRoot = record.rootDir.trim();
  if (!sourceRoot || /[\u0000-\u001f\u007f]/u.test(sourceRoot)) {
    throw new Error('siyuan_map_manifest_source_invalid');
  }
  return Object.freeze({
    version: SIYUAN_MAP_MANIFEST_VERSION,
    projectId: exactProjectId,
    mapId: record.id,
    sourceRoot,
    notebookId: null,
    rootDocumentId: null,
    revision: 1,
    status: record.status === 'deleted' ? 'recycled' : 'pending',
    sourcePolicy: normalizeSiyuanSourcePolicy(sourcePolicy),
    summaryPolicy: normalizeSiyuanSummaryPolicy(summaryPolicy),
    summaryModel: Object.freeze({ kind: 'none' as const }),
    cloudSummaryApproval: null,
    counts: Object.freeze({ indexed: 0, excluded: 0, unreadable: 0, summarized: 0 }),
    nodeBindings: Object.freeze({}),
    updatedAt: now,
  });
}

export function updateSiyuanMapManifest(
  manifest: SiyuanMapManifest,
  patch: Readonly<{
    notebookId?: string | null;
    rootDocumentId?: string | null;
    status?: SiyuanMapManifest['status'];
    counts?: Partial<SiyuanMapIndexCounts>;
    summaryModel?: SiyuanSummaryModelProvenance;
    cloudSummaryApproval?: SiyuanCloudSummaryApproval | null;
    sourcePolicy?: Readonly<Partial<SiyuanSourcePolicy>>;
    nodeBindings?: Readonly<Record<string, string>>;
  }>,
  now = Date.now(),
): SiyuanMapManifest {
  const bindings = patch.nodeBindings ?? manifest.nodeBindings;
  const entries = Object.entries(bindings);
  if (
    entries.length > SIYUAN_MANIFEST_BINDING_CACHE_LIMIT ||
    entries.some(([key, value]) => !key || !SAFE_ID.test(value))
  ) {
    throw new Error('siyuan_map_manifest_binding_invalid');
  }
  const counts = { ...manifest.counts, ...patch.counts };
  if (
    Object.values(counts).some(
      (value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_INDEX_COUNT,
    )
  ) {
    throw new Error('siyuan_map_manifest_counts_invalid');
  }
  const approvalCandidate =
    patch.cloudSummaryApproval === undefined
      ? manifest.cloudSummaryApproval
      : patch.cloudSummaryApproval;
  const normalizedApproval = normalizeSiyuanCloudSummaryApproval(approvalCandidate);
  if (approvalCandidate && !normalizedApproval) {
    throw new Error('siyuan_map_manifest_cloud_approval_invalid');
  }
  if (
    normalizedApproval &&
    canonicalSiyuanAuthorityRoot(normalizedApproval.sourceRoot) !==
      canonicalSiyuanAuthorityRoot(manifest.sourceRoot)
  ) {
    throw new Error('siyuan_map_manifest_cloud_approval_scope_invalid');
  }
  const approval =
    patch.sourcePolicy && patch.cloudSummaryApproval === undefined ? null : normalizedApproval;
  return Object.freeze({
    ...manifest,
    ...patch,
    sourcePolicy: normalizeSiyuanSourcePolicy(patch.sourcePolicy ?? manifest.sourcePolicy),
    cloudSummaryApproval: approval,
    revision: manifest.revision + 1,
    counts: Object.freeze(counts),
    nodeBindings: Object.freeze(Object.fromEntries(entries)),
    updatedAt: now,
  });
}

export function isValidSiyuanCloudSummaryApproval(
  approval: unknown,
): approval is SiyuanCloudSummaryApproval {
  if (!approval || typeof approval !== 'object') return false;
  const value = approval as Partial<SiyuanCloudSummaryApproval>;
  return (
    typeof value.providerId === 'string' &&
    SAFE_ROUTE_VALUE.test(value.providerId) &&
    typeof value.connectionId === 'string' &&
    SAFE_ROUTE_VALUE.test(value.connectionId) &&
    typeof value.modelId === 'string' &&
    SAFE_ROUTE_VALUE.test(value.modelId) &&
    (value.effort === undefined ||
      ['auto', 'minimal', 'low', 'medium', 'high', 'ultra', 'max'].includes(value.effort)) &&
    typeof value.sourceRoot === 'string' &&
    value.sourceRoot.length > 0 &&
    value.sourceRoot.length <= 4_096 &&
    !/[\u0000-\u001f\u007f]/u.test(value.sourceRoot) &&
    typeof value.summaryPolicyFingerprint === 'string' &&
    value.summaryPolicyFingerprint.length > 0 &&
    value.summaryPolicyFingerprint.length <= 32_768 &&
    !/[\u0000-\u001f\u007f]/u.test(value.summaryPolicyFingerprint) &&
    [value.eligibleFileCount, value.eligibleSourceBytes, value.estimatedMaxSentBytes].every(
      (count) => Number.isSafeInteger(count) && Number(count) >= 0,
    ) &&
    value.privacyAcknowledged === true &&
    Number.isSafeInteger(value.approvedAt) &&
    Number(value.approvedAt) > 0
  );
}

function normalizeSiyuanCloudSummaryApproval(approval: unknown): SiyuanCloudSummaryApproval | null {
  if (!isValidSiyuanCloudSummaryApproval(approval)) return null;
  return Object.freeze({
    providerId: approval.providerId,
    connectionId: approval.connectionId,
    modelId: approval.modelId,
    effort: approval.effort ?? 'auto',
    sourceRoot: approval.sourceRoot,
    summaryPolicyFingerprint: approval.summaryPolicyFingerprint,
    eligibleFileCount: approval.eligibleFileCount,
    eligibleSourceBytes: approval.eligibleSourceBytes,
    estimatedMaxSentBytes: approval.estimatedMaxSentBytes,
    privacyAcknowledged: true,
    approvedAt: approval.approvedAt,
  });
}

function storageKey(projectId: string, mapId: string): string {
  if (!SAFE_ID.test(projectId) || !SAFE_ID.test(mapId)) {
    throw new Error('siyuan_map_manifest_scope_invalid');
  }
  return `vibespace-siyuan-map-manifest-v1:${projectId}:${mapId}`;
}

export function writeSiyuanMapManifest(manifest: SiyuanMapManifest): void {
  localStorage.setItem(storageKey(manifest.projectId, manifest.mapId), JSON.stringify(manifest));
}

export function readSiyuanMapManifest(projectId: string, mapId: string): SiyuanMapManifest | null {
  const raw = localStorage.getItem(storageKey(projectId, mapId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SiyuanMapManifest;
    if (
      parsed.version !== SIYUAN_MAP_MANIFEST_VERSION ||
      parsed.projectId !== projectId ||
      parsed.mapId !== mapId ||
      !parsed.sourceRoot ||
      !parsed.summaryPolicy ||
      !parsed.counts ||
      !parsed.nodeBindings ||
      !Number.isSafeInteger(parsed.revision) ||
      parsed.revision < 1 ||
      !Number.isSafeInteger(parsed.updatedAt) ||
      !['pending', 'indexing', 'ready', 'paused', 'error', 'recycled'].includes(parsed.status) ||
      (parsed.notebookId !== null && !SAFE_ID.test(parsed.notebookId)) ||
      (parsed.rootDocumentId !== null && !SAFE_ID.test(parsed.rootDocumentId))
    ) {
      return null;
    }
    const storedApproval = normalizeSiyuanCloudSummaryApproval(parsed.cloudSummaryApproval);
    const cloudSummaryApproval =
      storedApproval &&
      canonicalSiyuanAuthorityRoot(storedApproval.sourceRoot) ===
        canonicalSiyuanAuthorityRoot(parsed.sourceRoot)
        ? storedApproval
        : null;
    const validated = updateSiyuanMapManifest(
      { ...parsed, cloudSummaryApproval },
      {},
      parsed.updatedAt,
    );
    return Object.freeze({
      ...validated,
      sourcePolicy: normalizeSiyuanSourcePolicy(parsed.sourcePolicy),
      summaryPolicy: normalizeSiyuanSummaryPolicy(parsed.summaryPolicy),
      cloudSummaryApproval,
      revision: parsed.revision,
      updatedAt: parsed.updatedAt,
    });
  } catch {
    return null;
  }
}
