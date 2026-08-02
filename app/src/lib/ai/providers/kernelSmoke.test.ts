import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@/types';
import type { LLMRequest } from '../types';
import { KERNEL_SMOKE_SCENARIOS } from '@/lib/jarvis/smoke/scenarios';
import {
  activateKernelSmokeBinding,
  clearKernelSmokeBinding,
  getKernelSmokeDispatchPath,
  isKernelSmokeBindingActive,
  kernelSmokeProvider,
  KERNEL_SMOKE_PROVIDER_ID,
  recordKernelSmokeRouterDispatch,
  subscribeKernelSmokeDispatchPath,
} from './kernelSmoke';

const agent = {
  id: 'agent-smoke',
  name: 'Smoke',
  role: 'development fixture',
  system_prompt: '',
  model: { provider: KERNEL_SMOKE_PROVIDER_ID, model: 'kernel-smoke-v1' },
  tools: [],
  memory_scope: 'none',
  status: 'idle',
  builtin: false,
  created_at: 1,
  updated_at: 1,
} as unknown as Agent;

function request(text: string, overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    agent,
    messages: [{ role: 'user', content: text }],
    ...overrides,
  };
}

function trustBinding() {
  activateKernelSmokeBinding({
    nativePid: 42,
    cdpPort: 39177,
    profileSha256: 'a'.repeat(64),
    nonce: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
}

describe('kernelSmokeProvider', () => {
  afterEach(() => {
    clearKernelSmokeBinding();
    vi.restoreAllMocks();
  });

  it('uses a dedicated provider identity and stays unavailable before native binding', () => {
    expect(KERNEL_SMOKE_PROVIDER_ID).toBe('vibespace-kernel-smoke');
    expect(kernelSmokeProvider.id).toBe(KERNEL_SMOKE_PROVIDER_ID);
    expect(kernelSmokeProvider.isAvailable()).toBe(false);
    expect(isKernelSmokeBindingActive()).toBe(false);

    trustBinding();
    expect(kernelSmokeProvider.isAvailable()).toBe(true);
    expect(isKernelSmokeBindingActive()).toBe(true);
  });

  it('uses the most recent exact scenario while preserving downstream Hive worker prompts', async () => {
    trustBinding();
    const scenario = KERNEL_SMOKE_SCENARIOS.hive_dispatch;

    await expect(
      kernelSmokeProvider.run(
        request('', {
          messages: [
            { role: 'user', content: scenario.safeTextFixture },
            { role: 'assistant', content: 'Hive smoke response.' },
            { role: 'user', content: 'Continue to the next Hive step (verify).' },
          ],
        }),
      ),
    ).resolves.toMatchObject({ text: 'Hive smoke response.' });

    await expect(
      kernelSmokeProvider.run(
        request('', {
          messages: [
            { role: 'user', content: scenario.safeTextFixture },
            {
              role: 'user',
              content: KERNEL_SMOKE_SCENARIOS.provider_failure.safeTextFixture,
            },
          ],
        }),
      ),
    ).rejects.toThrow('kernel_smoke_provider_failure');
  });

  it('accepts only the exact fixed catalog text and streams deterministic deltas', async () => {
    trustBinding();
    const scenario = KERNEL_SMOKE_SCENARIOS.transport_provider_success;
    const chunks = vi.fn();

    const response = await kernelSmokeProvider.run(
      request(scenario.safeTextFixture, { onChunk: chunks }),
    );

    const expectedText = scenario.streams.provider.semanticEvents
      .filter((event) => event.kind === 'text_delta')
      .map((event) => event.text)
      .join('');
    expect(response).toMatchObject({
      provider: KERNEL_SMOKE_PROVIDER_ID,
      model: 'kernel-smoke-v1',
      text: expectedText,
      finish_reason: 'stop',
      usage: { cost_usd: 0 },
    });
    expect(chunks).toHaveBeenLastCalledWith({ delta: '', done: true });

    await expect(kernelSmokeProvider.run(request(` ${scenario.safeTextFixture}`))).rejects.toThrow(
      'kernel_smoke_scenario_unrecognized',
    );
    await expect(kernelSmokeProvider.run(request(scenario.id))).rejects.toThrow(
      'kernel_smoke_scenario_unrecognized',
    );
  });

  it('publishes only the router-owned protected/unprotected dispatch classification', async () => {
    trustBinding();
    const listener = vi.fn();
    const unsubscribe = subscribeKernelSmokeDispatchPath(listener);

    recordKernelSmokeRouterDispatch('unprotected');
    expect(getKernelSmokeDispatchPath()).toBe('unprotected');
    expect(listener).toHaveBeenCalledOnce();

    await kernelSmokeProvider.run(
      request(KERNEL_SMOKE_SCENARIOS.transport_provider_success.safeTextFixture, {
        protectedAttempt: {
          accountId: 'account-1',
          runId: 'run-1',
          requestId: 'request-1',
          attemptNumber: 1,
        },
      }),
    );
    expect(getKernelSmokeDispatchPath()).toBe('unprotected');
    expect(listener).toHaveBeenCalledOnce();

    recordKernelSmokeRouterDispatch('protected');
    expect(getKernelSmokeDispatchPath()).toBe('protected');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('reports the intended provider failure without emitting false completion', async () => {
    trustBinding();
    const chunks = vi.fn();
    const scenario = KERNEL_SMOKE_SCENARIOS.provider_failure;

    await expect(
      kernelSmokeProvider.run(request(scenario.safeTextFixture, { onChunk: chunks })),
    ).rejects.toThrow('kernel_smoke_provider_failure');
    expect(chunks).not.toHaveBeenCalledWith({ delta: '', done: true });
  });

  it('fails scheduled attempt one before observation and succeeds only from trusted attempt two', async () => {
    trustBinding();
    const scenario = KERNEL_SMOKE_SCENARIOS.schedule_transport_retry;
    const firstChunks = vi.fn();
    const firstObservations = vi.fn();

    await expect(
      kernelSmokeProvider.run(
        request(scenario.safeTextFixture, {
          protectedAttempt: {
            accountId: 'account-1',
            runId: 'run-1',
            requestId: 'request-1',
            attemptNumber: 1,
          },
          onChunk: firstChunks,
          onResponseObservation: firstObservations,
        }),
      ),
    ).rejects.toThrow('kernel_smoke_scheduled_transport_failure');
    expect(firstChunks).not.toHaveBeenCalled();
    expect(firstObservations).not.toHaveBeenCalled();

    const second = await kernelSmokeProvider.run(
      request(scenario.safeTextFixture, {
        protectedAttempt: {
          accountId: 'account-1',
          runId: 'run-1',
          requestId: 'request-2',
          attemptNumber: 2,
        },
      }),
    );
    expect(second.text).toBe('Scheduled retry succeeded.');

    await expect(kernelSmokeProvider.run(request(scenario.safeTextFixture))).rejects.toThrow(
      'kernel_smoke_attempt_binding_invalid',
    );
  });

  it('emits registered actions only through the real protected response block', async () => {
    trustBinding();
    const response = await kernelSmokeProvider.run(
      request(KERNEL_SMOKE_SCENARIOS.approval_confirm.safeTextFixture),
    );

    expect(response.text).toBe(
      '```action\n' +
        '{"id":"terminal.create","params":{},"rationale":"Execute the fixed development smoke fixture."}\n' +
        '```',
    );
  });

  it('holds voice_turn_stop on the genuine AbortSignal and never emits later success', async () => {
    trustBinding();
    const controller = new AbortController();
    const chunks = vi.fn();
    const scenario = KERNEL_SMOKE_SCENARIOS.voice_turn_stop;
    const pending = kernelSmokeProvider.run(
      request(scenario.safeTextFixture, { signal: controller.signal, onChunk: chunks }),
    );

    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(chunks).not.toHaveBeenCalledWith({ delta: '', done: true });
  });

  it('completes one live-evidence run and holds the second as orphanable active work', async () => {
    trustBinding();
    const scenario = KERNEL_SMOKE_SCENARIOS.live_evidence_restart;
    await expect(kernelSmokeProvider.run(request(scenario.safeTextFixture))).resolves.toMatchObject(
      {
        finish_reason: 'stop',
      },
    );

    const controller = new AbortController();
    const second = kernelSmokeProvider.run(
      request(scenario.safeTextFixture, { signal: controller.signal }),
    );
    await Promise.resolve();
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects dispatch immediately after trusted binding is cleared', async () => {
    trustBinding();
    clearKernelSmokeBinding();

    await expect(
      kernelSmokeProvider.run(
        request(KERNEL_SMOKE_SCENARIOS.transport_provider_success.safeTextFixture),
      ),
    ).rejects.toThrow('kernel_smoke_binding_unavailable');
  });
});
