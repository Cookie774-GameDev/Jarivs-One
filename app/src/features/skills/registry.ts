/**
 * Singleton skill / agent registry.
 *
 * Built-in presets + user custom skills come from `skillCatalog` /
 * `skillsStore`. Legacy bundled `.md` agents are still loaded from disk.
 */

import type { SkillLoadOptions, SkillManifest, SkillManifestSource } from './loader';
import { getUnifiedSkillManifests } from './skillCatalog';
import { loadAllAgents, loadAllSkills } from './loader';
import { readSkillsStore } from './skillsStore';
import { notifyDone } from '@/lib/notifications';

type Listener = (entries: SkillManifest[]) => void;

const entries = new Map<string, SkillManifest>();
const listeners = new Set<Listener>();
let loaded = false;
let discovered: SkillManifest[] = [];

const SOURCE_PRECEDENCE: Record<SkillManifestSource, number> = {
  builtin: 0,
  user: 1,
  project: 2,
};

function notify(): void {
  const arr = Array.from(entries.values());
  for (const fn of listeners) {
    try {
      fn(arr);
    } catch (err) {
      console.error('skillRegistry listener threw:', err);
    }
  }
}

function setEntries(arr: SkillManifest[]): void {
  entries.clear();
  for (const m of arr) entries.set(m.catalogId ?? m.name, m);
  notify();
}

function mergeSkills(catalog: SkillManifest[], local: SkillManifest[]): SkillManifest[] {
  const merged = new Map<string, SkillManifest>();
  for (const manifest of [...catalog, ...local]) {
    const key = (manifest.catalogId ?? manifest.name).toLowerCase();
    const current = merged.get(key);
    if (!current || SOURCE_PRECEDENCE[manifest.source] > SOURCE_PRECEDENCE[current.source]) {
      merged.set(key, manifest);
    }
  }
  return [...merged.values()];
}

function refreshFromCatalog(): SkillManifest[] {
  const skills = mergeSkills(
    getUnifiedSkillManifests(),
    discovered.filter((manifest) => manifest.kind === 'skill'),
  );
  const agents = discovered.filter((manifest) => manifest.kind === 'agent');
  const all = [...skills, ...agents];
  setEntries(all);
  return all;
}

export const skillRegistry = {
  /**
   * Seed the unified catalog (five presets + custom skills) and merge any
   * bundled agent manifests. Idempotent.
   */
  async loadFromDisk(opts?: SkillLoadOptions): Promise<SkillManifest[]> {
    const [skillsOnDisk, agents] = await Promise.all([loadAllSkills(opts), loadAllAgents(opts)]);
    discovered = [...skillsOnDisk, ...agents];
    const skills = mergeSkills(getUnifiedSkillManifests(), skillsOnDisk);
    const all = [...skills, ...agents];
    setEntries(all);
    loaded = true;
    return all;
  },

  /** Re-read catalog + agent manifests. */
  async reload(opts?: SkillLoadOptions): Promise<SkillManifest[]> {
    loaded = false;
    return skillRegistry.loadFromDisk(opts);
  },

  /** Refresh in-memory manifests after store edits (no disk IO). */
  refresh(): void {
    refreshFromCatalog();
  },

  list(kind?: 'skill' | 'agent'): SkillManifest[] {
    const arr = Array.from(entries.values());
    if (!kind) return arr;
    return arr.filter((m) => m.kind === kind);
  },

  getAll(): SkillManifest[] {
    return Array.from(entries.values());
  },

  get(name: string): SkillManifest | undefined {
    return entries.get(name);
  },

  toggle(name: string, enabled: boolean): void {
    const cur = entries.get(name);
    if (!cur || cur.kind !== 'skill') return;
    const store = readSkillsStore();
    if (cur.isPreset) {
      store.setSkillEnabled(name, enabled, 'preset');
    } else {
      store.setSkillEnabled(name, enabled, 'custom');
    }
    entries.set(name, { ...cur, enabled });
    notify();
    void notifyDone('skills', enabled ? 'Skill enabled' : 'Skill disabled', cur.title || cur.name);
  },

  setEnabled(name: string, enabled: boolean): void {
    skillRegistry.toggle(name, enabled);
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  isLoaded(): boolean {
    return loaded;
  },
};

export type { SkillManifest } from './loader';
