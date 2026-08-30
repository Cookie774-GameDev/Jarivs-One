import { resolveStableEntity, type StableEntity } from './entityCommands';
import type { InstantResult } from '../types';

export type ResourceFamily = 'tool' | 'skill' | 'plugin' | 'file' | 'context' | 'project' | 'chat';

export type ResourceCommandRequest = Readonly<{
  id: string;
  family: ResourceFamily;
  selector?: string;
  args?: Readonly<Record<string, unknown>>;
  confirmation?: Readonly<{ commandId: string; targetId: string }>;
  approval?: Readonly<{ commandId: string; targetId: string }>;
}>;

export type ResourceAuthorityReceipt = Readonly<{
  status: 'completed' | 'queued' | 'rejected';
  receiptId: string;
}>;

export type ResourceCommandPort = Readonly<{
  list: (family: ResourceFamily) => Promise<readonly StableEntity[]>;
  validate: (entityId: string, args: Readonly<Record<string, unknown>>) => Promise<boolean>;
  execute: (
    request: ResourceCommandRequest & Readonly<{ entityId?: string }>,
  ) => Promise<ResourceAuthorityReceipt>;
}>;

const READ_FILE_COMMANDS = new Set(['files.open', 'files.search', 'file.reveal', 'file.open']);
const SENSITIVE_KEY = /(?:api.?key|secret|token|credential|password|billing)/iu;
const RAW_CONTEXT_KEY = /(?:transcript|conversation|raw.?message|hidden.?reasoning)/iu;
const ALLOWED_COMMANDS: Readonly<Record<ResourceFamily, ReadonlySet<string>>> = Object.freeze({
  tool: new Set(['tool.open', 'tool.run', 'tool.stop']),
  skill: new Set(['skill.open', 'skill.enable', 'skill.disable']),
  plugin: new Set(['plugin.open', 'plugin.connect', 'plugin.disconnect', 'plugin.status']),
  file: READ_FILE_COMMANDS,
  context: new Set([
    'context.open',
    'context.map.create',
    'context.map.recenter',
    'context.give_terminals',
  ]),
  project: new Set([
    'project.create',
    'project.open',
    'project.rename',
    'project.archive',
    'project.list',
  ]),
  chat: new Set(['chat.create', 'chat.open', 'chat.rename', 'chat.list', 'chat.delete']),
});
const TARGETLESS_COMMANDS = new Set([
  'project.create',
  'project.list',
  'chat.create',
  'chat.list',
  'context.map.create',
]);
const CONFIRM_COMMANDS = new Set(['project.archive', 'chat.delete']);
const APPROVAL_COMMANDS = new Set([
  'tool.run',
  'tool.stop',
  'plugin.connect',
  'plugin.disconnect',
  'context.give_terminals',
]);

function containsCredentialMaterial(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => SENSITIVE_KEY.test(key) || containsCredentialMaterial(nested),
  );
}

function containsRawContext(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => RAW_CONTEXT_KEY.test(key) || containsRawContext(nested),
  );
}

async function publish(
  request: ResourceCommandRequest & Readonly<{ entityId?: string }>,
  port: ResourceCommandPort,
): Promise<InstantResult> {
  const receipt = await port.execute(request);
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

export async function executeResourceCommand(
  request: ResourceCommandRequest,
  port: ResourceCommandPort,
): Promise<InstantResult> {
  if (!ALLOWED_COMMANDS[request.family].has(request.id)) {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'That resource command is not allowed.',
    };
  }
  if (containsCredentialMaterial(request.args)) {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'Credentials must use the existing secure connection surface.',
    };
  }
  if (request.family === 'context' && containsRawContext(request.args)) {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'Context commands accept references, not raw transcripts.',
    };
  }
  if (TARGETLESS_COMMANDS.has(request.id)) return publish(request, port);
  if (!request.selector?.trim()) {
    return { ok: false, code: 'target_missing', message: 'Name one exact resource.' };
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
  if (
    CONFIRM_COMMANDS.has(request.id) &&
    (request.confirmation?.commandId !== request.id ||
      request.confirmation.targetId !== resolution.entity.id)
  ) {
    return {
      ok: false,
      code: 'confirmation_required',
      message: 'Confirm this exact resource action before it runs.',
    };
  }
  if (
    APPROVAL_COMMANDS.has(request.id) &&
    (request.approval?.commandId !== request.id ||
      request.approval.targetId !== resolution.entity.id)
  ) {
    return {
      ok: false,
      code: 'confirmation_required',
      message: 'Approve this exact resource action before it runs.',
    };
  }
  return publish({ ...request, entityId: resolution.entity.id }, port);
}
