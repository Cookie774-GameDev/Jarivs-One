/**
 * Per-role briefing overrides for orchestrated terminal panes.
 *
 * When Jarvis runs `terminal.orchestrate` ("open 10 terminals, five as code
 * agents with prompt X, five as reviewers with prompt Y"), the custom prompt
 * for each role must reach the CLI through the proper background mechanism —
 * the AGENTS.md managed block written by `agentPromptDelivery` — instead of
 * being typed into the shell. This store keeps the approved briefing text per
 * (project, agent slug) so the delivery layer can append it to the agent's
 * prompt when panes with that role spawn.
 *
 * Storage is a tiny bounded localStorage map: entries are capped, prompts are
 * truncated, and corruption falls back to an empty map.
 */

const STORAGE_KEY = 'jarvis-terminal-role-briefings-v1';
const MAX_ENTRIES = 32;
const MAX_PROMPT_CHARS = 4000;

type BriefingMap = Record<string, string>;

function storageKeyFor(projectId: string | null | undefined, agentSlug: string): string {
  return `${projectId ?? 'global'}:${agentSlug.toLowerCase()}`;
}

function readMap(): BriefingMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: BriefingMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: BriefingMap): void {
  try {
    const entries = Object.entries(map).slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota or unavailable storage - briefings degrade to agent defaults.
  }
}

/** Record the approved briefing for panes carrying this role slug. */
export function setTerminalRoleBriefing(
  projectId: string | null | undefined,
  agentSlug: string,
  prompt: string,
): void {
  const slug = agentSlug.trim();
  const text = prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!slug || !text) return;
  const map = readMap();
  map[storageKeyFor(projectId, slug)] = text;
  writeMap(map);
}

/**
 * Briefing for this role, preferring the project-scoped entry and falling
 * back to a global one. Null when no orchestration set a custom prompt.
 */
export function getTerminalRoleBriefing(
  projectId: string | null | undefined,
  agentSlug: string,
): string | null {
  const slug = agentSlug.trim();
  if (!slug) return null;
  const map = readMap();
  return map[storageKeyFor(projectId, slug)] ?? map[storageKeyFor(null, slug)] ?? null;
}

/** Remove stored briefings - all of them, or just one project's. */
export function clearTerminalRoleBriefings(projectId?: string | null): void {
  if (projectId === undefined) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    return;
  }
  const map = readMap();
  const prefix = `${projectId ?? 'global'}:`;
  const next: BriefingMap = {};
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith(prefix)) next[key] = value;
  }
  writeMap(next);
}
