export const MAX_PENDING_TERMINAL_OUTPUT_CHARACTERS = 262_144;

interface PendingTerminalBatch {
  displayData: string;
  transcriptData: string;
  size: number;
}

export interface DrainedTerminalOutput {
  displayData: string;
  transcriptData: string;
  droppedCharacters: number;
}

export function createTerminalRenderQueue(maxCharacters = MAX_PENDING_TERMINAL_OUTPUT_CHARACTERS) {
  const batches: PendingTerminalBatch[] = [];
  let batchHead = 0;
  let size = 0;
  let droppedCharacters = 0;

  return {
    enqueue(displayData: string, transcriptData: string) {
      if (!displayData) return;
      const batch = {
        displayData,
        transcriptData,
        size: Math.max(displayData.length, transcriptData.length),
      };
      if (batch.size > maxCharacters) {
        droppedCharacters += displayData.length;
        return;
      }
      batches.push(batch);
      size += batch.size;

      while (size > maxCharacters && batches.length - batchHead > 1) {
        const dropped = batches[batchHead++];
        if (!dropped) break;
        size -= dropped.size;
        droppedCharacters += dropped.displayData.length;
      }
      if (batchHead >= 1_024 && batchHead * 2 >= batches.length) {
        batches.splice(0, batchHead);
        batchHead = 0;
      }
    },
    drain(): DrainedTerminalOutput | null {
      if (batchHead >= batches.length && droppedCharacters === 0) return null;
      const pending = batches.slice(batchHead);
      const drained = {
        displayData: pending.map((batch) => batch.displayData).join(''),
        transcriptData: pending.map((batch) => batch.transcriptData).join(''),
        droppedCharacters,
      };
      batches.length = 0;
      batchHead = 0;
      size = 0;
      droppedCharacters = 0;
      return drained;
    },
    isEmpty() {
      return batchHead >= batches.length && droppedCharacters === 0;
    },
    clear() {
      batches.length = 0;
      batchHead = 0;
      size = 0;
      droppedCharacters = 0;
    },
  };
}
