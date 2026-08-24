export type StabilityDiagnostic =
  | { type: 'renderer-heartbeat'; at: number }
  | { type: 'resource-pressure'; at: number; usedBytes: number; limitBytes: number }
  | { type: 'terminal-output-trimmed'; at: number; droppedCharacters: number };

export function createStabilityDiagnostics(limit = 128) {
  const capacity = Math.max(0, Math.floor(limit));
  const entries = new Array<StabilityDiagnostic>(capacity);
  let firstIndex = 0;
  let size = 0;

  return {
    record(entry: StabilityDiagnostic) {
      if (capacity === 0) return;
      const stored = Object.freeze({ ...entry }) as StabilityDiagnostic;
      if (size < capacity) {
        entries[(firstIndex + size) % capacity] = stored;
        size += 1;
      } else {
        entries[firstIndex] = stored;
        firstIndex = (firstIndex + 1) % capacity;
      }
    },
    snapshot(): readonly StabilityDiagnostic[] {
      return Array.from({ length: size }, (_, offset) => ({
        ...entries[(firstIndex + offset) % capacity],
      }));
    },
  };
}

export const stabilityDiagnostics = createStabilityDiagnostics();
