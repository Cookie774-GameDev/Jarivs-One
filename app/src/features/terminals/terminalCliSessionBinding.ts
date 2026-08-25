import {
  buildExactCliResume,
  TERMINAL_CLI_SESSION_ADAPTERS,
  type TerminalCliAdapterId,
  type TerminalCliResumeCapability,
} from './terminalCliSessionRegistry';

export const TERMINAL_CLI_SESSION_BINDINGS_KEY = 'vibespace.terminal-cli-session-bindings.v1';
const MAX_BINDINGS = 100;

export type TerminalCliSessionCaptureMethod =
  | 'pre-post-inventory'
  | 'process-evidence'
  | 'provider-event'
  | 'legacy-migration';

export type TerminalCliSessionVerificationState = 'verified' | 'unverified' | 'unsupported';

export interface TerminalCliSessionBinding {
  readonly version: 1;
  readonly adapterId: TerminalCliAdapterId;
  readonly executable: string;
  readonly detectedVersion: string | null;
  readonly providerSessionId: string | null;
  readonly canonicalWorkingDirectory: string;
  readonly paneId: string;
  readonly projectId: string;
  readonly captureMethod: TerminalCliSessionCaptureMethod;
  readonly verifiedAt: number | null;
  readonly verificationState: TerminalCliSessionVerificationState;
  readonly resumeCapability: TerminalCliResumeCapability;
}

export interface TerminalCliSessionBindingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const ADAPTER_BY_ID = new Map(
  TERMINAL_CLI_SESSION_ADAPTERS.map((adapter) => [adapter.id, adapter] as const),
);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SAFE_EXECUTABLE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const CAPTURE_METHODS = new Set<TerminalCliSessionCaptureMethod>([
  'pre-post-inventory',
  'process-evidence',
  'provider-event',
  'legacy-migration',
]);
const VERIFICATION_STATES = new Set<TerminalCliSessionVerificationState>([
  'verified',
  'unverified',
  'unsupported',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalAbsolutePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 1024) {
    return false;
  }
  const normalized = value.replaceAll('\\', '/');
  const absolute = normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized);
  return absolute && !normalized.split('/').some((segment) => segment === '..');
}

function nullableBoundedString(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) return undefined;
  return value;
}

function normalizeBinding(value: unknown): TerminalCliSessionBinding | null {
  const candidate = record(value);
  if (!candidate || candidate.version !== 1) return null;
  const adapterId = candidate.adapterId as TerminalCliAdapterId;
  const adapter = ADAPTER_BY_ID.get(adapterId);
  if (!adapter) return null;
  if (
    typeof candidate.executable !== 'string' ||
    !SAFE_EXECUTABLE.test(candidate.executable) ||
    !adapter.executables.includes(candidate.executable) ||
    !canonicalAbsolutePath(candidate.canonicalWorkingDirectory) ||
    typeof candidate.paneId !== 'string' ||
    !SAFE_IDENTIFIER.test(candidate.paneId) ||
    typeof candidate.projectId !== 'string' ||
    !SAFE_IDENTIFIER.test(candidate.projectId) ||
    typeof candidate.captureMethod !== 'string' ||
    !CAPTURE_METHODS.has(candidate.captureMethod as TerminalCliSessionCaptureMethod) ||
    typeof candidate.verificationState !== 'string' ||
    !VERIFICATION_STATES.has(candidate.verificationState as TerminalCliSessionVerificationState) ||
    candidate.resumeCapability !== adapter.resumeCapability
  ) {
    return null;
  }

  const detectedVersion = nullableBoundedString(candidate.detectedVersion, 128);
  if (detectedVersion === undefined) return null;
  const verificationState = candidate.verificationState as TerminalCliSessionVerificationState;
  const verifiedAt = candidate.verifiedAt;
  const providerSessionId = nullableBoundedString(candidate.providerSessionId, 256);
  if (providerSessionId === undefined) return null;

  if (verificationState === 'verified') {
    if (
      !providerSessionId ||
      typeof verifiedAt !== 'number' ||
      !Number.isSafeInteger(verifiedAt) ||
      verifiedAt <= 0
    ) {
      return null;
    }
    if (adapter.resumeCapability === 'exact-id') {
      const argv = buildExactCliResume(adapterId, providerSessionId);
      if (!argv.ok) return null;
    } else if (!SAFE_IDENTIFIER.test(providerSessionId)) {
      return null;
    }
  } else if (providerSessionId !== null || verifiedAt !== null) {
    return null;
  }

  return {
    version: 1,
    adapterId,
    executable: candidate.executable,
    detectedVersion,
    providerSessionId,
    canonicalWorkingDirectory: candidate.canonicalWorkingDirectory,
    paneId: candidate.paneId,
    projectId: candidate.projectId,
    captureMethod: candidate.captureMethod as TerminalCliSessionCaptureMethod,
    verifiedAt: verifiedAt as number | null,
    verificationState,
    resumeCapability: adapter.resumeCapability,
  };
}

export function loadTerminalCliSessionBindings(
  storage: TerminalCliSessionBindingStorage,
): TerminalCliSessionBinding[] {
  try {
    const envelope = record(
      JSON.parse(storage.getItem(TERMINAL_CLI_SESSION_BINDINGS_KEY) ?? 'null'),
    );
    if (!envelope || envelope.version !== 1 || !Array.isArray(envelope.bindings)) return [];
    return envelope.bindings
      .slice(-MAX_BINDINGS)
      .map(normalizeBinding)
      .filter((binding): binding is TerminalCliSessionBinding => binding !== null);
  } catch {
    return [];
  }
}

export function persistVerifiedTerminalCliSessionBinding(
  storage: TerminalCliSessionBindingStorage,
  value: TerminalCliSessionBinding,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'binding_invalid' | 'storage_failed' } {
  const binding = normalizeBinding(value);
  if (!binding || binding.verificationState !== 'verified') {
    return { ok: false, reason: 'binding_invalid' };
  }
  const next = [
    ...loadTerminalCliSessionBindings(storage).filter((row) => row.paneId !== binding.paneId),
    binding,
  ].slice(-MAX_BINDINGS);
  try {
    storage.setItem(
      TERMINAL_CLI_SESSION_BINDINGS_KEY,
      JSON.stringify({ version: 1, bindings: next }),
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'storage_failed' };
  }
}

const LEGACY_COMMAND_ADAPTERS: Readonly<Record<string, TerminalCliAdapterId>> = {
  claude: 'claude-code',
  codex: 'openai-codex',
  opencode: 'opencode',
  grok: 'grok-build',
  gemini: 'gemini-cli',
  copilot: 'github-copilot-cli',
  qwen: 'qwen-code',
  'kiro-cli': 'kiro-cli',
  kiro: 'kiro-cli',
};

/**
 * Converts only safe structural metadata from an older terminal row. A legacy
 * `sessionId` is a VibeSpace PTY identity and is intentionally discarded.
 */
export function migrateTerminalCliSessionBindingRecord(
  value: unknown,
): TerminalCliSessionBinding | null {
  const legacy = record(value);
  if (
    !legacy ||
    typeof legacy.command !== 'string' ||
    typeof legacy.paneId !== 'string' ||
    !SAFE_IDENTIFIER.test(legacy.paneId) ||
    typeof legacy.projectId !== 'string' ||
    !SAFE_IDENTIFIER.test(legacy.projectId) ||
    !canonicalAbsolutePath(legacy.cwd)
  ) {
    return null;
  }
  const executable = legacy.command.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
  const adapterId = LEGACY_COMMAND_ADAPTERS[executable];
  const adapter = adapterId ? ADAPTER_BY_ID.get(adapterId) : undefined;
  if (!adapter || !adapter.executables.includes(executable)) return null;
  return {
    version: 1,
    adapterId,
    executable,
    detectedVersion: null,
    providerSessionId: null,
    canonicalWorkingDirectory: legacy.cwd,
    paneId: legacy.paneId,
    projectId: legacy.projectId,
    captureMethod: 'legacy-migration',
    verifiedAt: null,
    verificationState: 'unverified',
    resumeCapability: adapter.resumeCapability,
  };
}
