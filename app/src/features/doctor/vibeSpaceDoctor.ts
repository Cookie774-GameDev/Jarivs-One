import { isTauri } from '@/lib/utils';
import { db, terminalSessionRepo } from '@/lib/db';
import {
  harnessRuntimeManager,
  type HarnessRuntimeManager,
  type OpenCodeServerConnection,
} from '@/lib/harness/runtimeManager';
import type { HarnessRuntimeState } from '@/lib/harness/types';
import { runStorageDoctor, type StorageDoctorResult } from '@/lib/doctor/storageDoctor';
import { getAllCatalogSkills } from '@/features/skills';
import { browserTokenOptimizationPreferences } from '@/features/token-optimizer';
import { useAgentStore } from '@/stores/agents';

const OPENCODE_SETTLE_TIMEOUT_MS = 20_000;

export interface VibeSpaceDoctorReport {
  readonly ok: boolean;
  readonly text: string;
}

export interface VibeSpaceDoctorSubsystemCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface VibeSpaceDoctorDependencies {
  readonly nativeRuntime: boolean;
  readonly runStorage: () => Promise<StorageDoctorResult>;
  readonly refreshOpenCode: () => Promise<void>;
  readonly repairOpenCode: () => Promise<void>;
  readonly getOpenCodeState: () => HarnessRuntimeState;
  readonly getOpenCodeConnection: () => OpenCodeServerConnection | undefined;
  readonly waitForOpenCodeSettled: () => Promise<void>;
  readonly runAdditionalChecks: () => Promise<readonly VibeSpaceDoctorSubsystemCheck[]>;
  readonly now: () => number;
}

async function safeSubsystemCheck(
  label: string,
  diagnosticCode: string,
  check: () => string | Promise<string>,
): Promise<VibeSpaceDoctorSubsystemCheck> {
  try {
    return { label, ok: true, detail: await check() };
  } catch {
    return { label, ok: false, detail: `Check failed safely · ${diagnosticCode}` };
  }
}

async function runDefaultAdditionalChecks(): Promise<readonly VibeSpaceDoctorSubsystemCheck[]> {
  return Promise.all([
    safeSubsystemCheck('Agents', 'agents_roster_unavailable', () => {
      const count = Object.keys(useAgentStore.getState().agents).length;
      return `Ready · ${count} loaded`;
    }),
    safeSubsystemCheck('Skills', 'skills_catalog_unavailable', () => {
      const count = getAllCatalogSkills().length;
      return `Ready · ${count} available`;
    }),
    safeSubsystemCheck('Terminals', 'terminal_sessions_unavailable', async () => {
      const count = (await terminalSessionRepo.listRecentByLastActive(20)).length;
      return `Ready · ${count} recent ${count === 1 ? 'session' : 'sessions'}`;
    }),
    safeSubsystemCheck('Optimization', 'optimization_settings_unavailable', () => {
      const preferences = browserTokenOptimizationPreferences.getSnapshot();
      if (!preferences.neverChangeSelectedModel) {
        throw new Error('model selection protection is disabled');
      }
      return `Ready · ${preferences.globalMode} · selected model protected`;
    }),
    safeSubsystemCheck('Settings', 'settings_store_unavailable', async () => {
      await db.settings.limit(1).toArray();
      return 'Readable';
    }),
  ]);
}

function isOpenCodeSettled(state: HarnessRuntimeState): boolean {
  return ['ready', 'missing', 'download_required', 'incompatible', 'failed'].includes(state.kind);
}

async function waitForOpenCodeSettled(manager: HarnessRuntimeManager): Promise<void> {
  if (isOpenCodeSettled(manager.getSnapshot())) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    };
    const timeout = setTimeout(finish, OPENCODE_SETTLE_TIMEOUT_MS);
    unsubscribe = manager.subscribe(() => {
      if (isOpenCodeSettled(manager.getSnapshot())) finish();
    });
    if (isOpenCodeSettled(manager.getSnapshot())) finish();
  });
}

function storageSummary(result: StorageDoctorResult): { ok: boolean; text: string } {
  if (result.code === 'healthy') return { ok: true, text: 'Healthy' };
  if (result.code === 'recovered_after_repair') {
    return { ok: true, text: 'Recovered from the confirmed backup-first repair' };
  }
  if (result.code === 'recovered_after_retry') {
    return { ok: true, text: `Recovered safely after ${result.attempts} attempts` };
  }
  if (result.code === 'needs_user_repair') {
    return {
      ok: false,
      text: `Needs confirmed backup-first repair · ${result.diagnosticCode}`,
    };
  }
  return { ok: false, text: `Unrecognized failure · ${result.diagnosticCode}` };
}

function openCodeSummary(
  state: HarnessRuntimeState,
  connection: OpenCodeServerConnection | undefined,
): { ok: boolean; text: string } {
  if (state.kind === 'ready' && connection) {
    return { ok: true, text: `Ready · ${connection.source} ${connection.version}` };
  }
  if (state.kind === 'failed') return { ok: false, text: `Needs attention · ${state.message}` };
  if (state.kind === 'incompatible') {
    return { ok: false, text: `Needs attention · ${state.reason}` };
  }
  if (state.kind === 'download_required' || state.kind === 'missing') {
    return { ok: false, text: 'A compatible runtime could not be installed' };
  }
  return { ok: false, text: `Did not become ready · ${state.kind}` };
}

export async function runVibeSpaceDoctorWithDependencies(
  dependencies: VibeSpaceDoctorDependencies,
): Promise<VibeSpaceDoctorReport> {
  const startedAt = dependencies.now();
  let storage: { ok: boolean; text: string };
  try {
    storage = storageSummary(await dependencies.runStorage());
  } catch {
    storage = { ok: false, text: 'Check failed safely · storage_doctor_unavailable' };
  }

  let openCode: { ok: boolean; text: string };
  if (!dependencies.nativeRuntime) {
    openCode = { ok: false, text: 'Native check unavailable in browser preview' };
  } else {
    try {
      await dependencies.refreshOpenCode();
      await dependencies.waitForOpenCodeSettled();
      let state = dependencies.getOpenCodeState();
      let connection = dependencies.getOpenCodeConnection();
      if (state.kind !== 'ready' || !connection) {
        await dependencies.repairOpenCode();
        await dependencies.waitForOpenCodeSettled();
        state = dependencies.getOpenCodeState();
        connection = dependencies.getOpenCodeConnection();
      }
      openCode = openCodeSummary(state, connection);
    } catch {
      openCode = { ok: false, text: 'Check failed safely · opencode_runtime_unavailable' };
    }
  }

  let additionalChecks: readonly VibeSpaceDoctorSubsystemCheck[];
  try {
    additionalChecks = await dependencies.runAdditionalChecks();
  } catch {
    additionalChecks = [
      {
        label: 'App systems',
        ok: false,
        detail: 'Check failed safely · subsystem_checks_unavailable',
      },
    ];
  }

  const ok = storage.ok && openCode.ok && additionalChecks.every((check) => check.ok);
  const elapsedMs = Math.max(0, Math.round(dependencies.now() - startedAt));
  return {
    ok,
    text: [
      `VibeSpace Doctor — ${ok ? 'All supported checks passed' : 'Attention needed'}`,
      `${storage.ok ? '✓' : '•'} Local chat storage — ${storage.text}`,
      `${openCode.ok ? '✓' : '•'} OpenCode — ${openCode.text}`,
      ...additionalChecks.map(
        (check) => `${check.ok ? '✓' : '•'} ${check.label} — ${check.detail}`,
      ),
      `Completed in ${elapsedMs} ms.`,
      ok
        ? 'No data was changed beyond safe recovery actions.'
        : 'No destructive cleanup was attempted. Persistent storage repair still requires explicit confirmation; unknown errors are reported rather than guessed.',
    ].join('\n'),
  };
}

export function runVibeSpaceDoctor(): Promise<VibeSpaceDoctorReport> {
  return runVibeSpaceDoctorWithDependencies({
    nativeRuntime: isTauri,
    runStorage: () => runStorageDoctor({ force: true }),
    refreshOpenCode: () => harnessRuntimeManager.refresh(),
    repairOpenCode: () => harnessRuntimeManager.download(),
    getOpenCodeState: () => harnessRuntimeManager.getSnapshot(),
    getOpenCodeConnection: () => harnessRuntimeManager.getConnection(),
    waitForOpenCodeSettled: () => waitForOpenCodeSettled(harnessRuntimeManager),
    runAdditionalChecks: runDefaultAdditionalChecks,
    now: () => performance.now(),
  });
}
