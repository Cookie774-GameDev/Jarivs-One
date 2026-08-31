import { resolveTerminalTarget } from '../terminalTargetResolver';
import type { InstantResult, LiveTerminalTarget, TerminalSelector } from '../types';

export type TerminalCommandRequest = Readonly<{
  id: string;
  slots: Readonly<Record<string, unknown>>;
  promptState?: 'ready' | 'approval' | 'question' | 'password' | 'ssh' | 'unknown';
  confirmation?: Readonly<{ commandId: string; targetId: string; nonce: string }>;
}>;

export type TerminalCommandAuthorityPort = Readonly<{
  readTargets: () => Promise<LiveTerminalTarget[]>;
  consumeConfirmation?: (
    confirmation: NonNullable<TerminalCommandRequest['confirmation']>,
  ) => Promise<boolean>;
  dispatch: (
    request: TerminalCommandRequest,
    targets: readonly LiveTerminalTarget[],
  ) => Promise<InstantResult>;
}>;

function failure(code: InstantResult['code'], message: string): InstantResult {
  return { ok: false, code, message };
}

const PROMPT_INTERLOCKS = new Set(['approval', 'question', 'password', 'ssh', 'unknown']);
const CONFIRM_COMMANDS = new Set([
  'terminal.restart',
  'terminal.stop',
  'terminal.close',
  'agent.stop',
]);

export async function executeTerminalCommand(
  request: TerminalCommandRequest,
  port: TerminalCommandAuthorityPort,
  signal?: AbortSignal,
): Promise<InstantResult> {
  try {
    if (signal?.aborted) return failure('queue_failed', 'The instant command deadline elapsed.');
    const targets = await port.readTargets();
    if (signal?.aborted) return failure('queue_failed', 'The instant command deadline elapsed.');

    if (request.id === 'terminal.list') {
      return {
        ok: true,
        code: 'opened',
        message:
          targets.length === 1
            ? '1 terminal is available.'
            : `${targets.length} terminals are available.`,
      };
    }

    const selector = request.slots.selector as TerminalSelector | undefined;
    if (!selector) return failure('target_missing', 'Name one exact terminal.');
    const resolution = resolveTerminalTarget(selector, targets);
    if (resolution.kind === 'missing')
      return failure('target_missing', 'No matching terminal is available.');
    if (resolution.kind === 'ambiguous') {
      return failure('target_ambiguous', 'That terminal selector matches more than one terminal.');
    }
    const selected = resolution.kind === 'many' ? resolution.targets : [resolution.target];

    if (request.id === 'terminal.status' || request.id === 'agent.status') {
      if (selected.length !== 1)
        return failure('target_ambiguous', 'Name one terminal for status.');
      const target = selected[0]!;
      const provider = target.provider
        ? ` (${target.provider[0]!.toUpperCase()}${target.provider.slice(1)},`
        : ' (';
      return {
        ok: true,
        code: 'opened',
        message: `Terminal ${target.ordinal} is available${provider} pane ${target.paneId}, session ${target.sessionId}).`,
      };
    }

    if (request.promptState && PROMPT_INTERLOCKS.has(request.promptState)) {
      return failure(
        'target_not_ready',
        `Terminal input is blocked by a ${request.promptState} prompt.`,
      );
    }
    if (CONFIRM_COMMANDS.has(request.id)) {
      const targetId = selected[0]?.sessionId;
      const confirmation = request.confirmation;
      if (
        selected.length !== 1 ||
        !confirmation ||
        confirmation.commandId !== request.id ||
        confirmation.targetId !== targetId ||
        !confirmation.nonce.trim() ||
        confirmation.nonce.length > 200 ||
        /[\u0000-\u001f\u007f]/u.test(confirmation.nonce)
      ) {
        return failure(
          'confirmation_required',
          'Confirm this exact terminal action before it runs.',
        );
      }
      if (!port.consumeConfirmation || !(await port.consumeConfirmation(confirmation))) {
        return failure(
          'confirmation_required',
          'That terminal confirmation is expired or already used.',
        );
      }
      if (signal?.aborted) return failure('queue_failed', 'The instant command deadline elapsed.');
    }
    if (signal?.aborted) return failure('queue_failed', 'The instant command deadline elapsed.');
    return await port.dispatch(request, selected);
  } catch {
    return failure('queue_failed', 'Terminal command failed.');
  }
}
