import type { FoundryRealArtifactSummary } from './nativeBridge';

export interface LocalAdapterRecord {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly jobId: string;
  readonly artifactManifestSha256: string;
  readonly adapterFileCount: number;
  readonly metrics: Record<string, unknown>;
  readonly trainingConfig: Record<string, unknown>;
  readonly status: 'candidate' | 'archived';
  readonly verifiedAt: string;
}

export interface LocalAdapterStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const STORAGE_KEY = 'vibespace.model-foundry.real-adapters.v1';

function parse(raw: string | null): LocalAdapterRecord[] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is LocalAdapterRecord => Boolean(item) && typeof item === 'object'
      && (item as LocalAdapterRecord).schemaVersion === 1
      && typeof (item as LocalAdapterRecord).projectId === 'string'
      && typeof (item as LocalAdapterRecord).jobId === 'string'
      && typeof (item as LocalAdapterRecord).artifactManifestSha256 === 'string'
      && ((item as LocalAdapterRecord).status === 'candidate' || (item as LocalAdapterRecord).status === 'archived'));
  } catch { return []; }
}

export class LocalAdapterRegistry {
  constructor(private readonly storage: LocalAdapterStorage, private readonly now: () => string) {}
  list(projectId: string): readonly LocalAdapterRecord[] { return parse(this.storage.getItem(STORAGE_KEY)).filter((record) => record.projectId === projectId); }
  upsert(projectId: string, jobId: string, artifact: FoundryRealArtifactSummary): LocalAdapterRecord {
    const record: LocalAdapterRecord = { schemaVersion: 1, projectId, jobId, artifactManifestSha256: artifact.manifestSha256, adapterFileCount: Object.keys(artifact.adapterFiles).length, metrics: artifact.metrics, trainingConfig: artifact.trainingConfig, status: 'candidate', verifiedAt: this.now() };
    const records = parse(this.storage.getItem(STORAGE_KEY));
    this.storage.setItem(STORAGE_KEY, JSON.stringify([...records.filter((item) => item.projectId !== projectId || item.jobId !== jobId), record]));
    return record;
  }
  archive(projectId: string, jobId: string): readonly LocalAdapterRecord[] {
    const records = parse(this.storage.getItem(STORAGE_KEY)).map((record) => record.projectId === projectId && record.jobId === jobId ? { ...record, status: 'archived' as const } : record);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records.filter((record) => record.projectId === projectId);
  }
}
