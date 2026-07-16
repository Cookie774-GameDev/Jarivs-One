export type JarvisContextMapKind =
  | 'architecture'
  | 'feature'
  | 'action'
  | 'route'
  | 'service'
  | 'provider'
  | 'plugin'
  | 'mcp'
  | 'project-file'
  | 'agent'
  | 'permission'
  | 'dependency';

export interface JarvisContextMapEntry {
  kind: JarvisContextMapKind;
  id: string;
  label: string;
  keywords: string[];
  detail: string;
  available?: boolean;
  updatedAt?: number;
}

interface SourceContribution {
  fingerprint: string;
  entries: JarvisContextMapEntry[];
}

const REQUIRED_KINDS: JarvisContextMapKind[] = [
  'architecture', 'feature', 'action', 'route', 'service', 'provider',
  'plugin', 'mcp', 'project-file', 'agent', 'permission', 'dependency',
];

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [];
}

/**
 * Small source-aware cache for generated app/project maps. A caller fingerprints
 * each source (file, registry, plugin list, agent snapshot) and only changed
 * contributions are re-indexed.
 */
export class JarvisContextMapIndex {
  private readonly sources = new Map<string, SourceContribution>();
  private revisionValue = 0;

  get revision(): number {
    return this.revisionValue;
  }

  kinds(): JarvisContextMapKind[] {
    return [...REQUIRED_KINDS];
  }

  updateSource(sourceId: string, fingerprint: string, entries: readonly JarvisContextMapEntry[]): {
    changed: boolean;
    revision: number;
  } {
    const current = this.sources.get(sourceId);
    if (current?.fingerprint === fingerprint) return { changed: false, revision: this.revisionValue };
    const normalized = entries.map((entry) => ({
      ...entry,
      keywords: [...new Set(entry.keywords.map((keyword) => keyword.toLowerCase()))],
      updatedAt: entry.updatedAt ?? Date.now(),
    }));
    this.sources.set(sourceId, { fingerprint, entries: normalized });
    this.revisionValue += 1;
    return { changed: true, revision: this.revisionValue };
  }

  removeSource(sourceId: string): boolean {
    const removed = this.sources.delete(sourceId);
    if (removed) this.revisionValue += 1;
    return removed;
  }

  entries(kind?: JarvisContextMapKind): JarvisContextMapEntry[] {
    const all = [...this.sources.values()].flatMap((source) => source.entries);
    return kind ? all.filter((entry) => entry.kind === kind) : all;
  }

  search(query: string, options: { kinds?: JarvisContextMapKind[]; limit?: number } = {}): JarvisContextMapEntry[] {
    const queryWords = words(query);
    const allowedKinds = options.kinds ? new Set(options.kinds) : null;
    return this.entries()
      .filter((entry) => !allowedKinds || allowedKinds.has(entry.kind))
      .map((entry, index) => {
        const label = `${entry.kind} ${entry.id} ${entry.label}`.toLowerCase();
        const detail = `${entry.detail} ${entry.keywords.join(' ')}`.toLowerCase();
        const score = queryWords.reduce((sum, word) =>
          sum + (label.includes(word) ? 3 : 0) + (detail.includes(word) ? 1 : 0), 0);
        return { entry, score, index };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, options.limit ?? 12)
      .map(({ entry }) => entry);
  }
}
