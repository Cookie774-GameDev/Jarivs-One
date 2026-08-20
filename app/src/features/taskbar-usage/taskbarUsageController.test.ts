import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_PROVIDER_REFRESH_MS,
  createAsyncUnlistenerRegistry,
  DISPLAY_REFRESH_MS,
  FOREGROUND_PROVIDER_REFRESH_MS,
  markCodexAccountUsageError,
  mergeCodexAccountUsageSnapshots,
} from './taskbarUsageController';
import { CODEX_CLI_CONNECTION, OPENCODE_CLI_CONNECTION } from '@/lib/ai/adapters/catalog';
import type { ProviderUsageSnapshot } from './providerUsageTypes';

const snapshot = (providerId: string, modelId?: string): ProviderUsageSnapshot => ({
  providerId,
  routeId: providerId,
  displayName: providerId,
  connected: true,
  hidden: false,
  activeRequests: 0,
  usageValue: 12,
  usageLimit: null,
  usageUnit: 'tokens',
  usagePercent: null,
  localUsageValue: 12,
  localUsageUnit: 'tokens',
  requestsPerMinute: null,
  updatedAt: 10,
  freshness: 'stale',
  source: 'terminal-session',
  ...(modelId ? { modelId } : {}),
});

describe('taskbar usage refresh policy', () => {
  it('updates visible timestamps every five seconds without polling providers every tick', () => {
    expect(DISPLAY_REFRESH_MS).toBe(5_000);
    expect(FOREGROUND_PROVIDER_REFRESH_MS).toBeGreaterThanOrEqual(60_000);
    expect(BACKGROUND_PROVIDER_REFRESH_MS).toBeGreaterThan(FOREGROUND_PROVIDER_REFRESH_MS);
  });
});

describe('shared Codex account usage overlay', () => {
  const account = {
    windows: [
      {
        label: '5h',
        usedPercent: 40,
        remainingPercent: 60,
        windowDurationMins: 300,
        resetsAt: 500,
      },
    ],
    creditsRemaining: null,
    planType: 'plus',
    tokens: null,
    updatedAt: 100,
    source: 'codex-app-server' as const,
    freshness: 'live' as const,
    availability: 'available' as const,
  };

  it('overlays only Codex and an exact OpenCode openai route while retaining bridge-local totals', () => {
    const openCodeOpenAi = { ...OPENCODE_CLI_CONNECTION, modelId: 'openai/gpt-5.6-luna' };
    const openCodeDeepSeek = {
      ...OPENCODE_CLI_CONNECTION,
      modelId: 'deepseek/deepseek-v4-flash',
    };
    const snapshots = [snapshot('openai-codex'), snapshot('opencode-cli', openCodeOpenAi.modelId)];
    const overlaid = mergeCodexAccountUsageSnapshots(
      snapshots,
      [CODEX_CLI_CONNECTION, openCodeOpenAi],
      account,
      150,
    );

    expect(overlaid).toEqual([
      expect.objectContaining({
        usageValue: 40,
        usagePercent: 40,
        localUsageValue: 12,
        accountUsageState: 'live',
        source: 'provider-api',
      }),
      expect.objectContaining({
        usageValue: 40,
        usagePercent: 40,
        localUsageValue: 12,
        accountUsageState: 'live',
      }),
    ]);
    expect(
      mergeCodexAccountUsageSnapshots(
        [snapshot('opencode-cli', openCodeDeepSeek.modelId)],
        [openCodeDeepSeek],
        account,
        150,
      )[0],
    ).not.toHaveProperty('accountUsageState');
    expect(
      mergeCodexAccountUsageSnapshots(
        [
          {
            ...snapshot('openai'),
            providerFamilyId: 'openai',
            routeId: 'openai-api',
          },
        ],
        [CODEX_CLI_CONNECTION],
        account,
        150,
      )[0],
    ).not.toHaveProperty('accountUsageState');
  });

  it('exposes account refresh errors without erasing exact ledger usage', () => {
    expect(
      markCodexAccountUsageError([snapshot('openai-codex')], [CODEX_CLI_CONNECTION])[0],
    ).toMatchObject({
      usageValue: 12,
      source: 'terminal-session',
      freshness: 'stale',
      accountUsageState: 'error',
      errorCode: 'CODEX_ACCOUNT_USAGE_UNAVAILABLE',
    });
  });

  it('keeps ledger provenance when the eligible account snapshot is stale or unavailable', () => {
    expect(
      mergeCodexAccountUsageSnapshots(
        [snapshot('openai-codex')],
        [CODEX_CLI_CONNECTION],
        { ...account, updatedAt: 1 },
        200_000,
      )[0],
    ).toMatchObject({
      usageValue: 40,
      localUsageValue: 12,
      freshness: 'stale',
      accountUsageState: 'stale',
    });

    expect(
      mergeCodexAccountUsageSnapshots(
        [snapshot('openai-codex')],
        [CODEX_CLI_CONNECTION],
        {
          ...account,
          windows: [],
          availability: 'unavailable',
          freshness: 'unavailable',
          unavailableReason: 'No supported values.',
        },
        200_000,
      )[0],
    ).toMatchObject({
      usageValue: 12,
      localUsageValue: 12,
      source: 'terminal-session',
      freshness: 'stale',
      accountUsageState: 'unavailable',
    });
  });
});

describe('taskbar usage reload cleanup', () => {
  it('immediately unregisters a native listener that resolves after stop', () => {
    const registry = createAsyncUnlistenerRegistry();
    const unlisten = vi.fn();

    registry.stop();
    registry.add(unlisten);

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('runs every registered cleanup exactly once across repeated stop signals', () => {
    const registry = createAsyncUnlistenerRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.add(first);
    registry.add(second);

    registry.stop();
    registry.stop();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('retains startup cleanups and routes HMR and unload through one idempotent stop', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/bootstrapApp.tsx'), 'utf8');

    expect(mainSource).toMatch(/const stopThemeSync =[\s\S]*?\? startThemeSync/);
    expect(mainSource).toMatch(
      /const stopTaskbarUsageController =[\s\S]*?\? startTaskbarUsageController/,
    );
    expect(mainSource).toMatch(/const stopRendererLifecycle = \(\) =>/);
    expect(mainSource).toContain("window.addEventListener('pagehide', stopRendererLifecycle");
    expect(mainSource).toMatch(
      /import\.meta\.hot\.dispose\(\(\) => \{[\s\S]*?stopRendererLifecycle\(\);/,
    );
  });
});
