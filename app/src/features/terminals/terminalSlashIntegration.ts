import {
  createVibespaceSlashCapture,
  type TerminalPromptEvidence,
  type VibespaceSlashCaptureResult,
} from './terminalCommandFoundation';
import {
  createTerminalPromptProtocolTracker,
  type TerminalPromptProtocolTracker,
} from './terminalPromptProtocol';

export type TerminalSlashRuntime = Readonly<{
  draftEmpty: boolean;
  interactiveProgram: boolean;
  passwordPrompt: boolean;
  sshSession: boolean;
}>;

export type TerminalSlashIntegration = Readonly<{
  observeOutput(chunk: string): TerminalPromptEvidence;
  updateRuntime(runtime: TerminalSlashRuntime): TerminalPromptEvidence;
  pushInput(data: string, runtime: TerminalSlashRuntime): VibespaceSlashCaptureResult;
  snapshot(): TerminalPromptEvidence;
}>;

const LOCAL_SHELL_EXECUTABLES = new Set([
  'bash',
  'cmd',
  'cmd.exe',
  'fish',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'sh',
  'wsl',
  'wsl.exe',
  'zsh',
]);
const UNSAFE_COMMAND_SYNTAX = /[\r\n;&|`<>$]/u;
const RUNTIME_KEYS = ['draftEmpty', 'interactiveProgram', 'passwordPrompt', 'sshSession'] as const;

export const TERMINAL_VIBESPACE_PALETTE_EVENT = 'jarvis:terminal:open-vibespace-palette';

function executableFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed || UNSAFE_COMMAND_SYNTAX.test(trimmed)) return null;
  const match = trimmed.startsWith('"')
    ? /^"([^"]+)"(?:\s|$)/u.exec(trimmed)
    : /^(\S+)/u.exec(trimmed);
  const executable = match?.[1];
  if (!executable) return null;
  const normalized = executable.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
}

function readRuntime(value: unknown): TerminalSlashRuntime {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid terminal slash runtime');
  }
  const prototype = Object.getPrototypeOf(value);
  const ownKeys = Reflect.ownKeys(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    ownKeys.length !== RUNTIME_KEYS.length ||
    ownKeys.some((key) => typeof key !== 'string' || !RUNTIME_KEYS.includes(key as never))
  ) {
    throw new Error('Invalid terminal slash runtime');
  }
  const runtime: Record<string, boolean> = Object.create(null);
  for (const key of RUNTIME_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'boolean'
    ) {
      throw new Error('Invalid terminal slash runtime');
    }
    runtime[key] = descriptor.value;
  }
  return Object.freeze(runtime) as TerminalSlashRuntime;
}

export function isSupportedLocalShellCommand(command: unknown): boolean {
  return (
    typeof command === 'string' && LOCAL_SHELL_EXECUTABLES.has(executableFromCommand(command) ?? '')
  );
}

export function isSshSessionCommand(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  const executable = executableFromCommand(command);
  return executable === 'ssh' || executable === 'ssh.exe';
}

export function openTerminalVibespacePalette(paneId?: string): boolean {
  if (
    typeof window === 'undefined' ||
    typeof paneId !== 'string' ||
    paneId.length < 1 ||
    paneId.length > 200 ||
    /[\u0000-\u001f\u007f]/u.test(paneId)
  ) {
    return false;
  }
  return window.dispatchEvent(
    new CustomEvent(TERMINAL_VIBESPACE_PALETTE_EVENT, {
      detail: Object.freeze({ paneId }),
    }),
  );
}

export function terminalPaletteRequestTargetsPane(event: Event, paneId?: string): boolean {
  if (
    typeof paneId !== 'string' ||
    paneId.length < 1 ||
    paneId.length > 200 ||
    /[\u0000-\u001f\u007f]/u.test(paneId) ||
    !(event instanceof CustomEvent)
  ) {
    return false;
  }
  const detail = event.detail;
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(detail, 'paneId');
  return (
    Reflect.ownKeys(detail).length === 1 &&
    descriptor?.enumerable === true &&
    'value' in descriptor &&
    descriptor.value === paneId
  );
}

export function createTerminalSlashIntegration(
  input: Readonly<{
    command: string | null | undefined;
  }>,
): TerminalSlashIntegration {
  const promptTracker: TerminalPromptProtocolTracker = createTerminalPromptProtocolTracker({
    localShell: isSupportedLocalShellCommand(input.command),
  });
  const capture = createVibespaceSlashCapture();
  const updateRuntime = (rawRuntime: TerminalSlashRuntime): TerminalPromptEvidence => {
    const runtime = readRuntime(rawRuntime);
    return promptTracker.setRuntimeGuards({
      interactiveProgram: runtime.interactiveProgram,
      passwordPrompt: runtime.passwordPrompt,
      sshSession: runtime.sshSession,
    });
  };

  return Object.freeze({
    observeOutput(chunk: string): TerminalPromptEvidence {
      return promptTracker.observeOutput(chunk);
    },

    updateRuntime,

    pushInput(data: string, rawRuntime: TerminalSlashRuntime): VibespaceSlashCaptureResult {
      const runtime = readRuntime(rawRuntime);
      const evidence = updateRuntime(runtime);
      return capture.push(
        data,
        runtime.draftEmpty
          ? evidence
          : Object.freeze({
              ...evidence,
              atPrompt: false,
            }),
      );
    },

    snapshot(): TerminalPromptEvidence {
      return promptTracker.snapshot();
    },
  });
}
