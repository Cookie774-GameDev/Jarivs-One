import { isTauri } from '@/lib/utils';

const DIAGNOSIS_COMMAND = 'playwright_feature_pack_diagnose';
const INSTALL_COMMAND = 'playwright_feature_pack_install_or_update';
const REPAIR_COMMAND = 'playwright_feature_pack_repair';
const CONFIGURED_REPAIR_COMMAND = 'playwright_feature_pack_repair_configured';
const ROLLBACK_COMMAND = 'playwright_feature_pack_rollback';
const MEASURE_COMMAND = 'playwright_feature_pack_measure';
const UNINSTALL_COMMAND = 'playwright_feature_pack_uninstall';
const CHECK_LABEL = 'Playwright acceptance runtime';

type NativeInvoke = <T>(command: string, argumentsValue?: Record<string, unknown>) => Promise<T>;

export type PlaywrightFeaturePackDiagnosisStatus = 'absent' | 'healthy' | 'corrupt' | 'unsupported';

export interface PlaywrightFeaturePackDiagnosis {
  readonly status: PlaywrightFeaturePackDiagnosisStatus;
  readonly reason?: string;
  readonly installationId?: string;
  readonly manifestSha256?: string;
  readonly playwrightVersion?: string;
  readonly browserRevision?: string;
  readonly measuredBytes?: number;
  readonly productionTrustConfigured: boolean;
  readonly repairArtifactConfigured: boolean;
  readonly externalPrerequisite?:
    'production-trust-and-signed-artifact' | 'production-signed-artifact';
}

export interface PlaywrightFeaturePackMutationReceipt {
  readonly action:
    | 'already-installed'
    | 'installed'
    | 'updated'
    | 'already-healthy'
    | 'repaired'
    | 'rolled-back'
    | 'already-absent'
    | 'uninstalled';
  readonly installationId?: string;
  readonly manifestSha256?: string;
  readonly measuredBytes?: number;
  readonly cleanupPending: boolean;
  readonly removedInstallations: number;
}

export interface PlaywrightFeaturePackMeasurement {
  readonly installationId: string;
  readonly measuredBytes: number;
  readonly manifestSha256: string;
}

export interface PlaywrightFeaturePackDoctorCheck {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface PlaywrightFeaturePackBridge {
  diagnose(): Promise<PlaywrightFeaturePackDiagnosis>;
  installOrUpdate(artifactRoot: string): Promise<PlaywrightFeaturePackMutationReceipt>;
  repair(artifactRoot: string): Promise<PlaywrightFeaturePackMutationReceipt>;
  repairConfigured(): Promise<PlaywrightFeaturePackMutationReceipt>;
  rollback(): Promise<PlaywrightFeaturePackMutationReceipt>;
  measure(): Promise<PlaywrightFeaturePackMeasurement>;
  uninstall(): Promise<PlaywrightFeaturePackMutationReceipt>;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  code: string,
  pattern: RegExp,
  maximumLength = 200,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    !pattern.test(value)
  ) {
    throw new Error(code);
  }
  return value;
}

function optionalBytes(value: unknown, code: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_500_000_000) {
    throw new Error(code);
  }
  return value as number;
}

function parseDiagnosis(value: unknown): PlaywrightFeaturePackDiagnosis {
  const code = 'playwright_feature_pack_diagnosis_invalid';
  const input = record(value, code);
  if (!['absent', 'healthy', 'corrupt', 'unsupported'].includes(String(input.status))) {
    throw new Error(code);
  }
  if (
    typeof input.productionTrustConfigured !== 'boolean' ||
    typeof input.repairArtifactConfigured !== 'boolean'
  ) {
    throw new Error(code);
  }
  const reason = optionalString(input.reason, code, /^[a-z0-9_]+$/u, 96);
  const installationId = optionalString(input.installationId, code, /^[A-Za-z0-9._-]+$/u);
  const manifestSha256 = optionalString(input.manifestSha256, code, /^[a-f0-9]{64}$/u, 64);
  const playwrightVersion = optionalString(input.playwrightVersion, code, /^1\.61\.1$/u, 80);
  const browserRevision = optionalString(input.browserRevision, code, /^[A-Za-z0-9._-]+$/u, 64);
  const measuredBytes = optionalBytes(input.measuredBytes, code);
  const externalPrerequisite = optionalString(
    input.externalPrerequisite,
    code,
    /^(?:production-trust-and-signed-artifact|production-signed-artifact)$/u,
    48,
  ) as PlaywrightFeaturePackDiagnosis['externalPrerequisite'];

  if (
    (!input.productionTrustConfigured &&
      (input.status !== 'unsupported' ||
        reason !== 'production_trust_not_configured' ||
        input.repairArtifactConfigured ||
        externalPrerequisite !== 'production-trust-and-signed-artifact')) ||
    (input.productionTrustConfigured &&
      !input.repairArtifactConfigured &&
      externalPrerequisite !== 'production-signed-artifact') ||
    (input.repairArtifactConfigured && externalPrerequisite !== undefined) ||
    (input.status === 'healthy' &&
      (!playwrightVersion || !browserRevision || measuredBytes === undefined)) ||
    (input.status !== 'healthy' && input.status !== 'absent' && !reason)
  ) {
    throw new Error(code);
  }

  return {
    status: input.status as PlaywrightFeaturePackDiagnosisStatus,
    reason,
    installationId,
    manifestSha256,
    playwrightVersion,
    browserRevision,
    measuredBytes,
    productionTrustConfigured: input.productionTrustConfigured,
    repairArtifactConfigured: input.repairArtifactConfigured,
    externalPrerequisite,
  };
}

function parseMutationReceipt(value: unknown): PlaywrightFeaturePackMutationReceipt {
  const code = 'playwright_feature_pack_mutation_receipt_invalid';
  const input = record(value, code);
  const actions = [
    'already-installed',
    'installed',
    'updated',
    'already-healthy',
    'repaired',
    'rolled-back',
    'already-absent',
    'uninstalled',
  ] as const;
  if (!actions.includes(input.action as (typeof actions)[number])) throw new Error(code);
  if (
    typeof input.cleanupPending !== 'boolean' ||
    !Number.isSafeInteger(input.removedInstallations) ||
    (input.removedInstallations as number) < 0 ||
    (input.removedInstallations as number) > 2
  ) {
    throw new Error(code);
  }
  return {
    action: input.action as PlaywrightFeaturePackMutationReceipt['action'],
    installationId: optionalString(input.installationId, code, /^[A-Za-z0-9._-]+$/u),
    manifestSha256: optionalString(input.manifestSha256, code, /^[a-f0-9]{64}$/u, 64),
    measuredBytes: optionalBytes(input.measuredBytes, code),
    cleanupPending: input.cleanupPending,
    removedInstallations: input.removedInstallations as number,
  };
}

function parseMeasurement(value: unknown): PlaywrightFeaturePackMeasurement {
  const code = 'playwright_feature_pack_measurement_invalid';
  const input = record(value, code);
  const installationId = optionalString(input.installationId, code, /^[A-Za-z0-9._-]+$/u);
  const manifestSha256 = optionalString(input.manifestSha256, code, /^[a-f0-9]{64}$/u, 64);
  const measuredBytes = optionalBytes(input.measuredBytes, code);
  if (!installationId || !manifestSha256 || measuredBytes === undefined) throw new Error(code);
  return { installationId, manifestSha256, measuredBytes };
}

function localArtifactArguments(artifactRoot: string): { artifactRoot: string } {
  if (
    typeof artifactRoot !== 'string' ||
    artifactRoot.length === 0 ||
    artifactRoot.length > 32_768 ||
    artifactRoot.trim() !== artifactRoot ||
    /^https?:\/\//iu.test(artifactRoot) ||
    !/^(?:[A-Za-z]:[\\/]|\/)/u.test(artifactRoot)
  ) {
    throw new Error('local_artifact_path_required');
  }
  return { artifactRoot };
}

export function createPlaywrightFeaturePackBridge(
  invoke: NativeInvoke,
): PlaywrightFeaturePackBridge {
  return {
    async diagnose() {
      return parseDiagnosis(await invoke<unknown>(DIAGNOSIS_COMMAND));
    },
    async installOrUpdate(artifactRoot) {
      return parseMutationReceipt(
        await invoke<unknown>(INSTALL_COMMAND, localArtifactArguments(artifactRoot)),
      );
    },
    async repair(artifactRoot) {
      return parseMutationReceipt(
        await invoke<unknown>(REPAIR_COMMAND, localArtifactArguments(artifactRoot)),
      );
    },
    async repairConfigured() {
      return parseMutationReceipt(await invoke<unknown>(CONFIGURED_REPAIR_COMMAND));
    },
    async rollback() {
      return parseMutationReceipt(await invoke<unknown>(ROLLBACK_COMMAND));
    },
    async measure() {
      return parseMeasurement(await invoke<unknown>(MEASURE_COMMAND));
    },
    async uninstall() {
      return parseMutationReceipt(await invoke<unknown>(UNINSTALL_COMMAND));
    },
  };
}

function healthyDetail(prefix: string, diagnosis: PlaywrightFeaturePackDiagnosis): string {
  return `${prefix} · Playwright ${diagnosis.playwrightVersion} · Chromium ${diagnosis.browserRevision}`;
}

export async function runPlaywrightFeaturePackDoctorCheck(
  bridge: PlaywrightFeaturePackBridge,
): Promise<PlaywrightFeaturePackDoctorCheck> {
  let diagnosis: PlaywrightFeaturePackDiagnosis;
  try {
    diagnosis = await bridge.diagnose();
  } catch {
    return {
      label: CHECK_LABEL,
      ok: false,
      detail: 'Check failed safely · playwright_feature_pack_diagnosis_invalid',
    };
  }

  if (!diagnosis.productionTrustConfigured) {
    return {
      label: CHECK_LABEL,
      ok: false,
      detail: `External prerequisite required · ${diagnosis.reason} · ${diagnosis.externalPrerequisite}`,
    };
  }
  if (diagnosis.status === 'healthy') {
    return { label: CHECK_LABEL, ok: true, detail: healthyDetail('Ready', diagnosis) };
  }
  if (diagnosis.status === 'absent') {
    return {
      label: CHECK_LABEL,
      ok: false,
      detail: 'Not installed; no install was attempted · playwright_feature_pack_absent',
    };
  }
  if (diagnosis.status !== 'corrupt') {
    return {
      label: CHECK_LABEL,
      ok: false,
      detail: `Unavailable · ${diagnosis.reason ?? 'playwright_feature_pack_unsupported'}`,
    };
  }
  if (!diagnosis.repairArtifactConfigured) {
    return {
      label: CHECK_LABEL,
      ok: false,
      detail: `Repair requires external prerequisite · ${diagnosis.reason} · ${diagnosis.externalPrerequisite}`,
    };
  }

  try {
    await bridge.repairConfigured();
    const verified = await bridge.diagnose();
    if (verified.status === 'healthy') {
      return {
        label: CHECK_LABEL,
        ok: true,
        detail: healthyDetail('Recovered from configured signed artifact', verified),
      };
    }
  } catch {
    // Report only the bounded public code below; native errors may contain no path or signing data.
  }
  return {
    label: CHECK_LABEL,
    ok: false,
    detail: 'Repair did not verify healthy state · playwright_feature_pack_repair_not_verified',
  };
}

async function tauriInvoke<T>(
  command: string,
  argumentsValue?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, argumentsValue);
}

export async function runDefaultPlaywrightFeaturePackDoctorCheck(): Promise<PlaywrightFeaturePackDoctorCheck> {
  if (!isTauri) {
    return {
      label: CHECK_LABEL,
      ok: false,
      detail: 'Native check unavailable in browser preview',
    };
  }
  return runPlaywrightFeaturePackDoctorCheck(createPlaywrightFeaturePackBridge(tauriInvoke));
}
