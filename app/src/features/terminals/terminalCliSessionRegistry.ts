export type TerminalCliAdapterId =
  | 'claude-code'
  | 'openai-codex'
  | 'opencode'
  | 'grok-build'
  | 'gemini-cli'
  | 'github-copilot-cli'
  | 'aider'
  | 'qwen-code'
  | 'kiro-cli'
  | 'cursor-agent'
  | 'continue-cli'
  | 'pi-coding-agent'
  | 'goose-cli'
  | 'amp-cli'
  | 'cline-cli'
  | 'kilo-code-cli'
  | 'crush'
  | 'plandex'
  | 'factory-droid'
  | 'kimi-cli';

export type TerminalCliResumeCapability =
  | 'exact-id'
  | 'interactive-only'
  | 'latest-only'
  | 'unsupported';

type SessionIdKind = 'uuid' | 'safe-opaque' | 'none';

export interface TerminalCliSessionAdapter {
  readonly id: TerminalCliAdapterId;
  readonly label: string;
  readonly executables: readonly string[];
  readonly platformSupport: string;
  readonly officialDocs: string;
  readonly evidenceCheckedAt: string;
  readonly testedVersion: string | null;
  readonly resumeCapability: TerminalCliResumeCapability;
  readonly sessionIdKind: SessionIdKind;
  readonly resumeArguments: readonly string[] | null;
  readonly safeSessionListing: {
    readonly executable: string;
    readonly arguments: readonly string[];
    readonly format: 'json' | 'text';
  } | null;
  readonly failureBehavior: string;
}

const VERIFIED_AT = '2026-08-24';

/**
 * Support catalog, not a popularity ranking. `testedVersion: null` is
 * deliberate: these contracts were validated against current official docs,
 * but no installed executable version was claimed or launched in this slice.
 */
export const TERMINAL_CLI_SESSION_ADAPTERS: readonly TerminalCliSessionAdapter[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    executables: ['claude'],
    platformSupport: 'Official CLI documentation; local platform version not yet verified.',
    officialDocs: 'https://docs.anthropic.com/en/docs/claude-code/cli-usage',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'safe-opaque',
    resumeArguments: ['--resume', '{sessionId}'],
    safeSessionListing: null,
    failureBehavior: 'A missing or rejected ID is surfaced; VibeSpace never retries latest.',
  },
  {
    id: 'openai-codex',
    label: 'OpenAI Codex CLI',
    executables: ['codex'],
    platformSupport: 'Official open-source CLI; local platform version not yet verified.',
    officialDocs:
      'https://github.com/openai/codex/blob/main/codex-rs/utils/cli/src/resume_command.rs',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'uuid',
    resumeArguments: ['resume', '{sessionId}'],
    safeSessionListing: null,
    failureBehavior:
      'Exact UUID failure is surfaced; --last and the interactive picker are never automatic fallbacks.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    executables: ['opencode'],
    platformSupport: 'Official CLI documentation; local platform version not yet verified.',
    officialDocs: 'https://opencode.ai/docs/cli/',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'safe-opaque',
    resumeArguments: ['--session', '{sessionId}'],
    safeSessionListing: {
      executable: 'opencode',
      arguments: ['session', 'list', '--format', 'json'],
      format: 'json',
    },
    failureBehavior: 'Exact session failure is surfaced; --continue is never substituted.',
  },
  {
    id: 'grok-build',
    label: 'Grok Build',
    executables: ['grok'],
    platformSupport: 'Official CLI documentation; local platform version not yet verified.',
    officialDocs: 'https://docs.x.ai/build/cli/reference',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'uuid',
    resumeArguments: ['--resume', '{sessionId}'],
    safeSessionListing: null,
    failureBehavior: 'Exact ID failure is surfaced; omitted-ID latest resume is never used.',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    executables: ['gemini'],
    platformSupport: 'Official open-source CLI; local platform version not yet verified.',
    officialDocs:
      'https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'uuid',
    resumeArguments: ['--resume', '{sessionId}'],
    safeSessionListing: {
      executable: 'gemini',
      arguments: ['--list-sessions'],
      format: 'text',
    },
    failureBehavior: 'Exact UUID failure is surfaced; index/latest resume is never substituted.',
  },
  {
    id: 'github-copilot-cli',
    label: 'GitHub Copilot CLI',
    executables: ['copilot'],
    platformSupport: 'Official GitHub CLI documentation; local platform version not yet verified.',
    officialDocs:
      'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'uuid',
    resumeArguments: ['--resume={sessionId}'],
    safeSessionListing: null,
    failureBehavior:
      'The full verified UUID is required; picker, prefix, name, continue, and session creation are never fallback paths.',
  },
  {
    id: 'aider',
    label: 'Aider',
    executables: ['aider'],
    platformSupport: 'Official documentation; deterministic provider session IDs not verified.',
    officialDocs: 'https://aider.chat/docs/usage.html',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'unsupported',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'Automatic provider-session resume is unavailable; transcript/layout restoration remains read-only.',
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    executables: ['qwen'],
    platformSupport: 'Official CLI documentation; local platform version not yet verified.',
    officialDocs: 'https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'uuid',
    resumeArguments: ['--resume', '{sessionId}'],
    safeSessionListing: {
      executable: 'qwen',
      arguments: ['sessions', 'ps', '--json'],
      format: 'json',
    },
    failureBehavior:
      'Exact session failure is surfaced; --continue and interactive selection are never substituted.',
  },
  {
    id: 'kiro-cli',
    label: 'Kiro CLI',
    executables: ['kiro-cli', 'kiro'],
    platformSupport: 'Official CLI documentation; local platform version not yet verified.',
    officialDocs: 'https://kiro.dev/docs/cli/reference/cli-commands/',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'exact-id',
    sessionIdKind: 'uuid',
    resumeArguments: ['chat', '--resume-id', '{sessionId}'],
    safeSessionListing: {
      executable: 'kiro-cli',
      arguments: ['chat', '--list-sessions', '--format', 'json'],
      format: 'json',
    },
    failureBehavior:
      'Exact UUID failure is surfaced; previous-session and picker paths are never automatic fallbacks.',
  },
  {
    id: 'cursor-agent',
    label: 'Cursor Agent',
    executables: ['agent', 'cursor-agent'],
    platformSupport:
      'Official CLI documentation; deterministic non-creating exact resume not verified.',
    officialDocs: 'https://cursor.com/docs/cli/reference/parameters',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'User interaction is required; VibeSpace does not guess or create a replacement session.',
  },
  {
    id: 'continue-cli',
    label: 'Continue CLI',
    executables: ['cn', 'continue'],
    platformSupport: 'Official CLI documentation; deterministic session resume not verified.',
    officialDocs: 'https://docs.continue.dev/cli/overview',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'unsupported',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'Automatic provider-session resume is unavailable; VibeSpace does not invent a command.',
  },
  {
    id: 'pi-coding-agent',
    label: 'Pi Coding Agent',
    executables: ['pi'],
    platformSupport: 'Official repository documentation; exact portable ID contract not verified.',
    officialDocs: 'https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'Interactive selection is required; VibeSpace never selects the newest session silently.',
  },
  {
    id: 'goose-cli',
    label: 'Goose CLI',
    executables: ['goose'],
    platformSupport: 'Official documentation; exact opaque-ID argv contract not verified.',
    officialDocs: 'https://block.github.io/goose/docs/guides/sessions/session-management/',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior: 'User selection is required; VibeSpace never resumes latest automatically.',
  },
  {
    id: 'amp-cli',
    label: 'Amp CLI',
    executables: ['amp'],
    platformSupport: 'Official manual; deterministic exact-ID resume not verified.',
    officialDocs: 'https://ampcode.com/manual',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'User selection is required; no automatic replacement conversation is started.',
  },
  {
    id: 'cline-cli',
    label: 'Cline CLI',
    executables: ['cline'],
    platformSupport: 'Official CLI documentation; deterministic exact-ID resume not verified.',
    officialDocs: 'https://docs.cline.bot/cline-cli/overview',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'unsupported',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'Automatic provider-session resume is unavailable; VibeSpace does not invent a command.',
  },
  {
    id: 'kilo-code-cli',
    label: 'Kilo Code CLI',
    executables: ['kilo'],
    platformSupport: 'Official documentation; deterministic exact-ID resume not verified.',
    officialDocs: 'https://kilo.ai/docs/cli',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'unsupported',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'Automatic provider-session resume is unavailable; VibeSpace does not invent a command.',
  },
  {
    id: 'crush',
    label: 'Crush',
    executables: ['crush'],
    platformSupport:
      'Official repository documentation; deterministic exact-ID resume not verified.',
    officialDocs: 'https://github.com/charmbracelet/crush',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior: 'User selection is required; VibeSpace never resumes latest automatically.',
  },
  {
    id: 'plandex',
    label: 'Plandex',
    executables: ['plandex'],
    platformSupport: 'Official CLI documentation; plan/session identity requires user authority.',
    officialDocs: 'https://docs.plandex.ai/cli-reference',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'User selection is required; VibeSpace never guesses the active plan or latest session.',
  },
  {
    id: 'factory-droid',
    label: 'Factory Droid',
    executables: ['droid'],
    platformSupport:
      'Official CLI documentation; deterministic non-creating exact resume not verified.',
    officialDocs: 'https://docs.factory.ai/cli',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior:
      'User selection is required; VibeSpace never creates or selects a replacement session.',
  },
  {
    id: 'kimi-cli',
    label: 'Kimi CLI',
    executables: ['kimi'],
    platformSupport:
      'Official repository documentation; deterministic exact-ID resume not verified.',
    officialDocs: 'https://github.com/MoonshotAI/kimi-cli',
    evidenceCheckedAt: VERIFIED_AT,
    testedVersion: null,
    resumeCapability: 'interactive-only',
    sessionIdKind: 'none',
    resumeArguments: null,
    safeSessionListing: null,
    failureBehavior: 'User selection is required; VibeSpace never resumes latest automatically.',
  },
] as const;

const ADAPTER_BY_ID = new Map(
  TERMINAL_CLI_SESSION_ADAPTERS.map((adapter) => [adapter.id, adapter] as const),
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_OPAQUE_PATTERN = /^(?!-)(?!latest$)[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/u;

function validSessionId(kind: SessionIdKind, value: string): boolean {
  if (!value || value !== value.trim() || value.length > 256) return false;
  if (kind === 'uuid') return UUID_PATTERN.test(value);
  if (kind === 'safe-opaque') return SAFE_OPAQUE_PATTERN.test(value);
  return false;
}

export type ExactCliResumeBuildResult =
  | { readonly ok: true; readonly executable: string; readonly arguments: readonly string[] }
  | {
      readonly ok: false;
      readonly reason:
        | 'adapter_unknown'
        | 'session_id_invalid'
        | `exact_resume_${Exclude<TerminalCliResumeCapability, 'exact-id'>}`;
    };

export function buildExactCliResume(
  adapterId: TerminalCliAdapterId,
  sessionId: string,
): ExactCliResumeBuildResult {
  const adapter = ADAPTER_BY_ID.get(adapterId);
  if (!adapter) return { ok: false, reason: 'adapter_unknown' };
  if (adapter.resumeCapability !== 'exact-id') {
    const capability: Exclude<TerminalCliResumeCapability, 'exact-id'> = adapter.resumeCapability;
    return { ok: false, reason: `exact_resume_${capability}` };
  }
  if (!adapter.resumeArguments) return { ok: false, reason: 'adapter_unknown' };
  if (!validSessionId(adapter.sessionIdKind, sessionId)) {
    return { ok: false, reason: 'session_id_invalid' };
  }
  return {
    ok: true,
    executable: adapter.executables[0]!,
    arguments: adapter.resumeArguments.map((argument) =>
      argument.replace('{sessionId}', sessionId),
    ),
  };
}
