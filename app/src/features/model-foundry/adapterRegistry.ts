import type { FoundryRealArtifactSummary, FoundryRealEvaluationReport } from './nativeBridge';

export interface LocalAdapterRecord {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly jobId: string;
  readonly artifactManifestSha256: string;
  readonly adapterFileCount: number;
  readonly metrics: Record<string, unknown>;
  readonly trainingConfig: Record<string, unknown>;
  readonly status: 'candidate' | 'promoted' | 'archived';
  readonly verifiedAt: string;
  readonly evaluation?: { readonly artifactManifestSha256: string; readonly evaluatedAt: string; readonly report: FoundryRealEvaluationReport };
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
      && ((item as LocalAdapterRecord).status === 'candidate' || (item as LocalAdapterRecord).status === 'promoted' || (item as LocalAdapterRecord).status === 'archived'));
  } catch { return []; }
}

export class LocalAdapterRegistry {
  constructor(private readonly storage: LocalAdapterStorage, private readonly now: () => string) {}
  list(projectId: string): readonly LocalAdapterRecord[] { return parse(this.storage.getItem(STORAGE_KEY)).filter((record) => record.projectId === projectId); }
  upsert(projectId: string, jobId: string, artifact: FoundryRealArtifactSummary): LocalAdapterRecord {
    const records = parse(this.storage.getItem(STORAGE_KEY));
    const existing = records.find((item) => item.projectId === projectId && item.jobId === jobId && item.artifactManifestSha256 === artifact.manifestSha256);
    const record: LocalAdapterRecord = { schemaVersion: 1, projectId, jobId, artifactManifestSha256: artifact.manifestSha256, adapterFileCount: Object.keys(artifact.adapterFiles).length, metrics: artifact.metrics, trainingConfig: artifact.trainingConfig, status: existing?.status === 'promoted' ? 'promoted' : 'candidate', verifiedAt: this.now(), evaluation: existing?.evaluation };
    this.storage.setItem(STORAGE_KEY, JSON.stringify([...records.filter((item) => item.projectId !== projectId || item.jobId !== jobId), record]));
    return record;
  }
  recordEvaluation(projectId: string, jobId: string, artifactManifestSha256: string, report: FoundryRealEvaluationReport): readonly LocalAdapterRecord[] {
    const records = parse(this.storage.getItem(STORAGE_KEY)).map((record) => record.projectId === projectId && record.jobId === jobId && record.artifactManifestSha256 === artifactManifestSha256 ? { ...record, evaluation: { artifactManifestSha256, evaluatedAt: this.now(), report } } : record);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records.filter((record) => record.projectId === projectId);
  }
  promote(projectId: string, jobId: string): readonly LocalAdapterRecord[] {
    const current = parse(this.storage.getItem(STORAGE_KEY)).find((record) => record.projectId === projectId && record.jobId === jobId);
    if (!current || current.status === 'archived' || current.evaluation?.artifactManifestSha256 !== current.artifactManifestSha256 || current.evaluation.report.gate !== 'pass') throw new Error('A current passing local evaluation is required before approval.');
    const records = parse(this.storage.getItem(STORAGE_KEY)).map((record) => record.projectId !== projectId ? record : record.jobId === jobId ? { ...record, status: 'promoted' as const } : record.status === 'promoted' ? { ...record, status: 'candidate' as const } : record);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records.filter((record) => record.projectId === projectId);
  }
  archive(projectId: string, jobId: string): readonly LocalAdapterRecord[] {
    const records = parse(this.storage.getItem(STORAGE_KEY)).map((record) => record.projectId === projectId && record.jobId === jobId ? { ...record, status: 'archived' as const } : record);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(records));
    return records.filter((record) => record.projectId === projectId);
  }
}
