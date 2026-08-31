export type JarvisInputEnergyListener = (energy: number) => void;

const listeners = new Set<JarvisInputEnergyListener>();
let currentEnergy = 0;

export function getJarvisInputEnergy(): number {
  return currentEnergy;
}

export function setJarvisInputEnergy(energy: number): void {
  const next = Number.isFinite(energy) ? Math.min(1, Math.max(0, energy)) : 0;
  if (next === currentEnergy) return;
  currentEnergy = next;
  for (const listener of listeners) listener(next);
}

export function subscribeJarvisInputEnergy(listener: JarvisInputEnergyListener): () => void {
  listeners.add(listener);
  listener(currentEnergy);
  return () => listeners.delete(listener);
}

export function resetJarvisInputEnergy(): void {
  setJarvisInputEnergy(0);
}
