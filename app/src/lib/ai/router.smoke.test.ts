import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@/types';
import type { CompiledJarvisPrompt } from '@/lib/jarvis/contracts';
import { KERNEL_SMOKE_SCENARIOS } from '@/lib/jarvis/smoke/scenarios';

vi.mock('@/lib/jarvis/smoke/config', () => ({ isKernelSmokeEnabled: () => true }));

import {
  activateKernelSmokeBinding,
  clearKernelSmokeBinding,
  getKernelSmokeDispatchPath,
  KERNEL_SMOKE_PROVIDER_ID,
} from './providers/kernelSmoke';
import { CODEX_CLI_DEFINITION } from './adapters/codex';
import {
  CLI_BRIDGE_EVENT,
  createCliProviderAdapter,
  type CliBridgeEvent,
  type CliStartRequest,
} from './adapters/cliBridge';
import { runAgent } from './router';

const agent = {
  id: 'agent-smoke',
  slug: 'smoke',
  name: 'Smoke',
  description: 'Development smoke fixture',
  system_prompt: '',
  model: { provider: KERNEL_SMOKE_PROVIDER_ID, model: 'kernel-smoke-v1' },
  tools_allowed: [],
  memory_scope: 'none',
  capabilities: [],
  builtin: false,
  created_at: 1,
  updated_at: 1,
} as unknown as Agent;

const compiledPrompt: Readonly<CompiledJarvisPrompt> = Object.freeze({
  schemaVersion: 1,
  layers: [],
  systemText: 'FIXED SMOKE SYSTEM CONTRACT',
  promptHash: 'b'.repeat(64),
  identityVersion: 1,
  profileRevisionId: 'profile-1',
  diagnostics: { totalChars: 27, omittedSourceRefs: [], warnings: [] },
});

describe('kernel smoke router integration', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset().mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    clearKernelSmokeBinding();
  });

  it('keeps ordinary CLI adapter identities unchanged when smoke is enabled', () => {
    expect(createCliProviderAdapter(CODEX_CLI_DEFINITION).id).toBe('codex-cli');
  });

  it('routes the gated native connection and preserves trusted scheduled attempt identity', async () => {
    activateKernelSmokeBinding({
      nativePid: 42,
      cdpPort: 39177,
      profileSha256: 'a'.repeat(64),
      nonce: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const protectedAttempt = Object.freeze({
      accountId: 'account-1',
      runId: 'run-1',
      requestId: 'request-2',
      attemptNumber: 2,
    });

    await expect(
      runAgent({
        agent,
        messages: [
          {
            role: 'user',
            content: KERNEL_SMOKE_SCENARIOS.schedule_transport_retry.safeTextFixture,
          },
        ],
        connectionId: 'vibespace-kernel-smoke-native',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
      }),
    ).resolves.toMatchObject({
      provider: KERNEL_SMOKE_PROVIDER_ID,
      model: 'kernel-smoke-v1',
      text: 'Scheduled retry succeeded.',
    });
  });

  it('publishes protected router dispatch evidence for the external CLI smoke connection', async () => {
    activateKernelSmokeBinding({
      nativePid: 42,
      cdpPort: 39177,
      profileSha256: 'a'.repeat(64),
      nonce: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    let emitBridgeEvent: ((event: { payload: CliBridgeEvent }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      expect(eventName).toBe(CLI_BRIDGE_EVENT);
      emitBridgeEvent = handler as (event: { payload: CliBridgeEvent }) => void;
      return () => undefined;
    });
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'cli_bridge_scan') {
        return {
          executables: [
            {
              executableId: 'kernel-smoke-cli-1',
              requestedName: 'vibespace_kernel_smoke_cli',
              executablePath: 'C:\\isolated\\vibespace_kernel_smoke_cli.exe',
            },
          ],
        };
      }
      if (command === 'cli_bridge_probe') {
        return {
          exitCode: 0,
          stdout: { data: 'vibespace-kernel-smoke 1.0.0', truncated: false },
          stderr: { data: '', truncated: false },
          timedOut: false,
        };
      }
      if (command === 'cli_bridge_start') {
        const request = (args as { request: CliStartRequest }).request;
        emitBridgeEvent?.({
          payload: {
            requestId: request.requestId,
            stream: 'stdout',
            data: '{"type":"text","delta":"CLI smoke complete."}\n{"type":"done","finish_reason":"stop"}\n',
            exitCode: null,
            status: 'data',
          },
        });
        emitBridgeEvent?.({
          payload: {
            requestId: request.requestId,
            stream: 'status',
            data: '',
            exitCode: 0,
            status: 'completed',
          },
        });
        return undefined;
      }
      throw new Error(`Unexpected Tauri command: ${command}`);
    });
    const protectedAttempt = Object.freeze({
      accountId: 'account-1',
      runId: 'run-cli-1',
      requestId: 'request-cli-1',
      attemptNumber: 1,
    });

    await expect(
      runAgent({
        agent,
        messages: [
          {
            role: 'user',
            content: KERNEL_SMOKE_SCENARIOS.transport_cli_success.safeTextFixture,
          },
        ],
        connectionId: 'vibespace-kernel-smoke-cli',
        compiledPrompt,
        requestId: protectedAttempt.requestId,
        protectedAttempt,
      }),
    ).resolves.toMatchObject({
      provider: KERNEL_SMOKE_PROVIDER_ID,
      model: 'kernel-smoke-v1',
      text: 'CLI smoke complete.',
    });
    expect(getKernelSmokeDispatchPath()).toBe('protected');
  });
});
