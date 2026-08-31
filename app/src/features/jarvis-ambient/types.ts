export const JARVIS_AMBIENT_STATES = [
  'idle',
  'listening',
  'speaking',
  'working',
  'needs',
  'done',
  'error',
] as const;

export type JarvisAmbientState = (typeof JARVIS_AMBIENT_STATES)[number];

export type JarvisAmbientSource =
  'voice' | 'approval' | 'question' | 'plan' | 'task' | 'agent' | 'command';

export type JarvisAmbientSnapshot = Readonly<{
  revision: number;
  state: JarvisAmbientState;
  source: JarvisAmbientSource;
  observedAt: number;
  energy: number;
  transientUntil?: number;
}>;

export function isJarvisAmbientSnapshot(value: unknown): value is JarvisAmbientSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<JarvisAmbientSnapshot>;
  return (
    Number.isSafeInteger(candidate.revision) &&
    (candidate.revision ?? -1) >= 0 &&
    JARVIS_AMBIENT_STATES.includes(candidate.state as JarvisAmbientState) &&
    ['voice', 'approval', 'question', 'plan', 'task', 'agent', 'command'].includes(
      candidate.source ?? '',
    ) &&
    Number.isFinite(candidate.observedAt) &&
    (candidate.observedAt ?? -1) >= 0 &&
    Number.isFinite(candidate.energy) &&
    (candidate.energy ?? -1) >= 0 &&
    (candidate.energy ?? 2) <= 1 &&
    (candidate.transientUntil === undefined ||
      (Number.isFinite(candidate.transientUntil) && candidate.transientUntil >= 0))
  );
}
