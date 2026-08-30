import type { AssistantIntent, AssistantResult } from '@/features/assistant/intents';
import { executeIntent } from '@/features/assistant/execute';
import {
  enqueueTerminalCommandBatch,
  type TerminalCommand,
} from '@/features/terminals/terminalCommandQueue';
import { getTerminalCliPreset } from '@/features/terminals/terminalCliPresets';
import type { TerminalRef } from '@/features/terminals/terminalRefs';
import { useUIStore } from '@/stores/ui';
import { readLiveTargetSnapshot } from './targetSnapshot';
import { resolveTerminalTarget } from './terminalTargetResolver';
import type { InstantCommand, InstantResult, LiveTerminalTarget } from './types';

type ShellCommandInput = Omit<Extract<TerminalCommand, { kind: 'shell' }>, 'id' | 'kind'>;

export type InstantCommandDependencies = Readonly<{
  executeLegacy: (intent: AssistantIntent) => Promise<AssistantResult>;
  enqueueBatch: (commands: readonly ShellCommandInput[]) => readonly string[];
  routeToTerminal: () => void;
  openModelPicker: () => void;
  readTargets: () => Promise<LiveTerminalTarget[]>;
}>;

const defaultDependencies: InstantCommandDependencies = {
  executeLegacy: executeIntent,
  enqueueBatch: enqueueTerminalCommandBatch,
  routeToTerminal: () => useUIStore.getState().setRoute('terminal'),
  openModelPicker: () => {
    useUIStore.getState().setSettingsOpen(true);
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('jarvis:settings:tab', { detail: { tab: 'providers' } }),
      );
    }, 0);
  },
  readTargets: readLiveTargetSnapshot,
};

function targetRef(target: LiveTerminalTarget): TerminalRef {
  return {
    paneId: target.paneId,
    sessionId: target.sessionId,
    projectId: target.projectId,
    ...(target.label ? { label: target.label } : {}),
    ...(target.provider || target.command ? { command: target.provider ?? target.command } : {}),
    ...(target.agentSlug ? { agentSlug: target.agentSlug } : {}),
    expectedProcess: target.processIdentity,
  };
}

export async function executeInstantCommand(
  command: InstantCommand,
  dependencies: InstantCommandDependencies = defaultDependencies,
): Promise<InstantResult> {
  if (command.kind === 'legacy') {
    const result = await dependencies.executeLegacy(command.intent);
    return { ok: result.ok, code: result.ok ? 'legacy' : 'legacy_failed', message: result.message };
  }
  if (command.kind === 'open-model-picker') {
    dependencies.openModelPicker();
    return { ok: true, code: 'opened', message: 'Opened provider and model selection.' };
  }
  try {
    if (command.kind === 'open-agent-cli') {
      const preset = getTerminalCliPreset(command.provider);
      if (!preset || !Number.isInteger(command.count) || command.count < 1 || command.count > 10) {
        return { ok: false, code: 'queue_failed', message: 'That terminal CLI is not supported.' };
      }
      dependencies.enqueueBatch(
        Array.from({ length: command.count }, (_, index) => ({
          command: preset.startupText,
          label: index === 0 ? command.provider : `${command.provider} ${index + 1}`,
          target: 'new' as const,
        })),
      );
      dependencies.routeToTerminal();
      return {
        ok: true,
        code: 'queued',
        message: `Queued ${command.count} ${command.provider} terminal${command.count === 1 ? '' : 's'}.`,
      };
    }

    const resolution = resolveTerminalTarget(command.target, await dependencies.readTargets());
    if (resolution.kind === 'missing') {
      return {
        ok: false,
        code: 'target_missing',
        message: 'No verified live terminal matches that target.',
      };
    }
    if (resolution.kind === 'ambiguous') {
      return {
        ok: false,
        code: 'target_ambiguous',
        message: 'More than one live terminal matches that target.',
      };
    }
    const targets = resolution.kind === 'one' ? [resolution.target] : resolution.targets;
    dependencies.enqueueBatch([
      { command: command.payload, target: 'refs', refs: targets.map(targetRef) },
    ]);
    dependencies.routeToTerminal();
    return {
      ok: true,
      code: 'queued',
      message: `Queued command for ${targets.length} terminal${targets.length === 1 ? '' : 's'}.`,
    };
  } catch {
    return {
      ok: false,
      code: 'queue_failed',
      message: 'The terminal command could not be queued.',
    };
  }
}
