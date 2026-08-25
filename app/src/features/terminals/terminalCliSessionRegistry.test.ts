import { describe, expect, it } from 'vitest';

import {
  buildExactCliResume,
  TERMINAL_CLI_SESSION_ADAPTERS,
  type TerminalCliAdapterId,
} from './terminalCliSessionRegistry';

const EXPECTED_IDS = [
  'claude-code',
  'openai-codex',
  'opencode',
  'grok-build',
  'gemini-cli',
  'github-copilot-cli',
  'aider',
  'qwen-code',
  'kiro-cli',
  'cursor-agent',
  'continue-cli',
  'pi-coding-agent',
  'goose-cli',
  'amp-cli',
  'cline-cli',
  'kilo-code-cli',
  'crush',
  'plandex',
  'factory-droid',
  'kimi-cli',
] as const satisfies readonly TerminalCliAdapterId[];

const UUID = '019bc371-82cf-7d82-ad0b-96d026aaca73';

describe('20-CLI session registry', () => {
  it('contains exactly the approved real CLI catalog with unique identities and primary references', () => {
    expect(TERMINAL_CLI_SESSION_ADAPTERS.map((adapter) => adapter.id)).toEqual(EXPECTED_IDS);
    expect(new Set(TERMINAL_CLI_SESSION_ADAPTERS.map((adapter) => adapter.id)).size).toBe(20);
    for (const adapter of TERMINAL_CLI_SESSION_ADAPTERS) {
      expect(adapter.executables.length).toBeGreaterThan(0);
      expect(adapter.officialDocs).toMatch(/^https:\/\//u);
      expect(adapter.failureBehavior).toMatch(/never|does not|requires|required|unavailable/i);
      expect(adapter.testedVersion).toBeNull();
    }
  });

  it.each([
    ['claude-code', 'claude-session_abc-123', 'claude', ['--resume', 'claude-session_abc-123']],
    ['openai-codex', UUID, 'codex', ['resume', UUID]],
    ['opencode', 'ses_abc123XYZ', 'opencode', ['--session', 'ses_abc123XYZ']],
    ['grok-build', UUID, 'grok', ['--resume', UUID]],
    ['gemini-cli', UUID, 'gemini', ['--resume', UUID]],
    ['github-copilot-cli', UUID, 'copilot', [`--resume=${UUID}`]],
    ['qwen-code', UUID, 'qwen', ['--resume', UUID]],
    ['kiro-cli', UUID, 'kiro-cli', ['chat', '--resume-id', UUID]],
  ] as const)(
    'builds direct argument vectors for verified %s exact-ID resume',
    (adapterId, sessionId, executable, args) => {
      expect(buildExactCliResume(adapterId, sessionId)).toEqual({
        ok: true,
        executable,
        arguments: args,
      });
    },
  );

  it('never generates an automatic command for interactive/latest/unsupported contracts', () => {
    for (const adapter of TERMINAL_CLI_SESSION_ADAPTERS) {
      if (adapter.resumeCapability === 'exact-id') continue;
      expect(buildExactCliResume(adapter.id, UUID)).toEqual({
        ok: false,
        reason: `exact_resume_${adapter.resumeCapability}`,
      });
    }
  });

  it.each([
    '',
    ' ',
    '--last',
    'latest',
    '../escape',
    'id with spaces',
    'abc;calc',
    'a'.repeat(257),
  ])('rejects unsafe or ambiguous session id %j without producing argv', (sessionId) => {
    for (const adapterId of [
      'claude-code',
      'openai-codex',
      'opencode',
      'grok-build',
      'gemini-cli',
      'github-copilot-cli',
      'qwen-code',
      'kiro-cli',
    ] as const) {
      expect(buildExactCliResume(adapterId, sessionId)).toEqual({
        ok: false,
        reason: 'session_id_invalid',
      });
    }
  });

  it('keeps machine-readable listing commands bounded and excludes latest-session selectors', () => {
    for (const adapter of TERMINAL_CLI_SESSION_ADAPTERS) {
      const args = adapter.safeSessionListing?.arguments ?? [];
      expect(args).not.toContain('--last');
      expect(args).not.toContain('--continue');
      expect(args).not.toContain('latest');
      expect(args.every((argument) => !/[;&|`$]/u.test(argument))).toBe(true);
    }
  });
});
