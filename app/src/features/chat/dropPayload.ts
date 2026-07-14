import { CONTEXT_MIME, parseContextAttachment } from '@/features/context/tree';
import {
  MAX_RESOURCE_PAYLOAD_CHARS,
  normalizeResourceReference,
  type ResourceReference,
} from '@/lib/resourceInteraction';

export const FILE_MIME = 'application/x-jarvis-file';
export const TERMINAL_MIME = 'application/x-jarvis-terminal';

export type ChatDropKind = 'context' | 'terminal' | 'file';

export type ChatDropPayload =
  | { kind: 'terminal'; raw: string }
  | ResourceReference;

type DataTransferLike = {
  types: readonly string[];
  getData(type: string): string;
};

function hasType(types: readonly string[], type: string): boolean {
  return Array.from(types).includes(type);
}

export function getChatDragKind(types: readonly string[]): ChatDropKind | null {
  if (hasType(types, CONTEXT_MIME)) return 'context';
  if (hasType(types, TERMINAL_MIME)) return 'terminal';
  if (hasType(types, FILE_MIME)) return 'file';
  return null;
}

export function getChatDropPayload(dataTransfer: DataTransferLike): ChatDropPayload | null {
  const { types } = dataTransfer;

  if (hasType(types, CONTEXT_MIME)) {
    const raw = dataTransfer.getData(CONTEXT_MIME);
    const attachment = parseContextAttachment(raw);
    if (attachment) {
      const resource = normalizeResourceReference({
        kind: 'context',
        name: attachment.title,
        raw,
        ...(attachment.path ? { path: attachment.path } : {}),
      });
      if (resource) return resource;
    }
  }

  if (hasType(types, TERMINAL_MIME)) {
    const raw = dataTransfer.getData(TERMINAL_MIME);
    if (
      raw.trim()
      && raw.length <= MAX_RESOURCE_PAYLOAD_CHARS
      && !/[\u0000-\u001f\u007f-\u009f]/.test(raw)
    ) return { kind: 'terminal', raw };
  }

  if (hasType(types, FILE_MIME)) {
    const path = dataTransfer.getData(FILE_MIME).trim();
    const resource = normalizeResourceReference({
      kind: 'file',
      name: path.split(/[\\/]/).pop() || path,
      path,
    });
    if (resource) return resource;
  }

  return null;
}
