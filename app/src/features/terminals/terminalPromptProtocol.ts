import type { TerminalPromptEvidence } from './terminalCommandFoundation';

export type TerminalRuntimeGuards = Readonly<{
  interactiveProgram: boolean;
  passwordPrompt: boolean;
  sshSession: boolean;
}>;

export type TerminalPromptProtocolTracker = Readonly<{
  observeOutput(chunk: string): TerminalPromptEvidence;
  setRuntimeGuards(guards: TerminalRuntimeGuards): TerminalPromptEvidence;
  snapshot(): TerminalPromptEvidence;
}>;

const CONTROL_SEQUENCE =
  /\u001b\]133;([ABCD])(?:;[^\u0007\u001b]*)?(?:\u0007|\u001b\\)|\u001b\[\?(47|1047|1049)([hl])/gu;
const MAX_CONTROL_TAIL = 256;

function readBooleanRecord(
  value: unknown,
  keys: readonly string[],
  errorMessage: string,
): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(errorMessage);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(errorMessage);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new Error(errorMessage);
  }

  const copy: Record<string, boolean> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'boolean'
    ) {
      throw new Error(errorMessage);
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function incompleteControlTail(value: string): string {
  const oscIndex = value.lastIndexOf('\u001b]133;');
  if (oscIndex >= 0) {
    const oscCandidate = value.slice(oscIndex);
    if (
      !oscCandidate.includes('\u0007') &&
      !oscCandidate.includes('\u001b\\') &&
      oscCandidate.length <= MAX_CONTROL_TAIL
    ) {
      return oscCandidate;
    }
  }

  const escapeIndex = value.lastIndexOf('\u001b');
  if (escapeIndex < 0) return '';

  const candidate = value.slice(escapeIndex);
  const couldBeOsc133 = '\u001b]133;'.startsWith(candidate);
  const couldBeAlternateScreen =
    '\u001b[?47h'.startsWith(candidate) ||
    '\u001b[?47l'.startsWith(candidate) ||
    '\u001b[?1047h'.startsWith(candidate) ||
    '\u001b[?1047l'.startsWith(candidate) ||
    '\u001b[?1049h'.startsWith(candidate) ||
    '\u001b[?1049l'.startsWith(candidate);
  if (!couldBeOsc133 && !couldBeAlternateScreen) return '';
  return candidate.length <= MAX_CONTROL_TAIL ? candidate : '';
}

export function createTerminalPromptProtocolTracker(
  input: Readonly<{ localShell: boolean }>,
): TerminalPromptProtocolTracker {
  const config = readBooleanRecord(input, ['localShell'], 'Invalid terminal prompt tracker config');
  let promptProtocol: TerminalPromptEvidence['promptProtocol'] = 'none';
  let atPrompt = false;
  let alternateScreen = false;
  let interactiveProgram = false;
  const localShell = config.localShell;
  let passwordPrompt = false;
  let sshSession = false;
  let controlTail = '';

  const canBeAtPrompt = (): boolean =>
    localShell && !alternateScreen && !interactiveProgram && !passwordPrompt && !sshSession;

  const snapshot = (): TerminalPromptEvidence =>
    Object.freeze({
      promptProtocol,
      atPrompt: atPrompt && canBeAtPrompt(),
      alternateScreen,
      interactiveProgram,
      localShell,
      passwordPrompt,
      sshSession,
    });

  return Object.freeze({
    observeOutput(chunk: string): TerminalPromptEvidence {
      if (typeof chunk !== 'string') {
        throw new Error('Invalid terminal output chunk');
      }
      if (chunk.length === 0) return snapshot();

      const output = controlTail + chunk;
      controlTail = '';
      CONTROL_SEQUENCE.lastIndex = 0;
      for (const match of output.matchAll(CONTROL_SEQUENCE)) {
        const oscMarker = match[1];
        const alternateMode = match[3];
        if (oscMarker) {
          promptProtocol = 'osc133';
          atPrompt = oscMarker === 'B' && canBeAtPrompt();
        } else if (alternateMode) {
          alternateScreen = alternateMode === 'h';
          atPrompt = false;
        }
      }
      controlTail = incompleteControlTail(output);
      return snapshot();
    },

    setRuntimeGuards(guards: TerminalRuntimeGuards): TerminalPromptEvidence {
      const next = readBooleanRecord(
        guards,
        ['interactiveProgram', 'passwordPrompt', 'sshSession'],
        'Invalid terminal runtime guards',
      );
      interactiveProgram = next.interactiveProgram;
      passwordPrompt = next.passwordPrompt;
      sshSession = next.sshSession;
      if (!canBeAtPrompt()) atPrompt = false;
      return snapshot();
    },

    snapshot,
  });
}
