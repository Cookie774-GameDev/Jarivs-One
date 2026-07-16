import {
  sanitizePersistedDraft,
  sanitizePersistedTerminalText,
} from './terminalContentSanitizer';

export const TERMINAL_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const MAX_TERMINAL_SNAPSHOT_BYTES = 512 * 1024;
export const MAX_TERMINAL_SNAPSHOT_LINES = 5_000;

interface TerminalBufferLineLike {
  translateToString(trimRight?: boolean): string;
}

export interface TerminalBufferLike {
  rows: number;
  cols: number;
  buffer: {
    active: {
      length: number;
      getLine(index: number): TerminalBufferLineLike | undefined;
    };
  };
}

export interface TerminalSnapshotPayload {
  schemaVersion: typeof TERMINAL_SNAPSHOT_SCHEMA_VERSION;
  projectId: string | null;
  paneId: string;
  text: string;
  rows: number;
  cols: number;
  updatedAt: number;
  command: string | null;
  interactive: boolean;
}

type TerminalSnapshotMetadata = Omit<
  TerminalSnapshotPayload,
  'schemaVersion' | 'text'
>;

export function createTerminalSnapshot(
  terminal: TerminalBufferLike,
  metadata: TerminalSnapshotMetadata,
): TerminalSnapshotPayload {
  const buffer = terminal.buffer.active;
  const start = Math.max(0, buffer.length - MAX_TERMINAL_SNAPSHOT_LINES);
  const lines: string[] = [];
  for (let index = start; index < buffer.length; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
  }
  const sanitized = sanitizePersistedTerminalText(lines.join('\n'), {
    maxBytes: MAX_TERMINAL_SNAPSHOT_BYTES,
    maxLines: MAX_TERMINAL_SNAPSHOT_LINES,
  });

  return {
    schemaVersion: TERMINAL_SNAPSHOT_SCHEMA_VERSION,
    ...metadata,
    command: metadata.command
      ? sanitizePersistedDraft(metadata.command) || null
      : null,
    text: sanitized.text,
  };
}

export function terminalSnapshotFingerprint(
  snapshot: TerminalSnapshotPayload,
): string {
  const stable = JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.projectId,
    paneId: snapshot.paneId,
    text: snapshot.text,
    rows: snapshot.rows,
    cols: snapshot.cols,
    command: snapshot.command,
    interactive: snapshot.interactive,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
