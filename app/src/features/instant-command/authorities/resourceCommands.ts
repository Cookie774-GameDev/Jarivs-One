import { resolveStableEntity, type StableEntity } from './entityCommands';
import type { InstantResult } from '../types';

export type ResourceFamily = 'tool' | 'skill' | 'plugin' | 'file' | 'context' | 'project' | 'chat';

export type ResourceCommandRequest = Readonly<{
  id: string;
  family: ResourceFamily;
  selector: string;
  args?: Readonly<Record<string, unknown>>;
}>;

export type ResourceAuthorityReceipt = Readonly<{
  status: 'completed' | 'queued' | 'rejected';
  receiptId: string;
}>;

export type ResourceCommandPort = Readonly<{
  list: (family: ResourceFamily) => Promise<readonly StableEntity[]>;
  validate: (entityId: string, args: Readonly<Record<string, unknown>>) => Promise<boolean>;
  execute: (
    request: ResourceCommandRequest & Readonly<{ entityId: string }>,
  ) => Promise<ResourceAuthorityReceipt>;
}>;

const READ_FILE_COMMANDS = new Set(['files.open', 'files.search', 'file.reveal', 'file.open']);
const SENSITIVE_KEY = /(?:api.?key|secret|token|credential|password|billing)/iu;

function containsCredentialMaterial(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => SENSITIVE_KEY.test(key) || containsCredentialMaterial(nested),
  );
}

export async function executeResourceCommand(
  request: ResourceCommandRequest,
  port: ResourceCommandPort,
): Promise<InstantResult> {
  if (request.family === 'file' && !READ_FILE_COMMANDS.has(request.id)) {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'Only read-only file commands are available.',
    };
  }
  if (containsCredentialMaterial(request.args)) {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'Credentials must use the existing secure connection surface.',
    };
  }
  const resolution = resolveStableEntity(await port.list(request.family), request.selector);
  if (resolution.status === 'missing') {
    return { ok: false, code: 'target_missing', message: 'No matching resource is available.' };
  }
  if (resolution.status === 'ambiguous') {
    return {
      ok: false,
      code: 'target_ambiguous',
      message: `That name is ambiguous (${resolution.candidateIds.join(', ')}).`,
    };
  }
  if (
    request.id === 'tool.run' &&
    !(await port.validate(resolution.entity.id, request.args ?? {}))
  ) {
    return { ok: false, code: 'queue_failed', message: 'Tool input does not match its schema.' };
  }
  const receipt = await port.execute({ ...request, entityId: resolution.entity.id });
  if (receipt.status === 'rejected') {
    return {
      ok: false,
      code: 'queue_failed',
      message: `Resource command rejected (${receipt.receiptId}).`,
    };
  }
  return {
    ok: true,
    code: receipt.status === 'queued' ? 'queued' : 'opened',
    message: `Resource command ${receipt.status} (${receipt.receiptId}).`,
  };
}
