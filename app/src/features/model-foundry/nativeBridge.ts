import { isTauri } from '../../lib/utils';

export interface FoundryHardwareProfile {
  readonly native: boolean;
  readonly os: string;
  readonly architecture: string;
  readonly logicalCores: number;
  readonly ramBytes: number | null;
  readonly acceleratorStatus: 'available' | 'unavailable' | 'unknown';
  readonly acceleratorDetail: string;
  readonly detectionComplete: boolean;
  readonly recommendedMode: string;
  readonly warnings: readonly string[];
}

export interface FoundryModelDownloadRequest {
  readonly projectId: string;
  readonly modelId: string;
  readonly revision: string;
  readonly license: string;
  readonly files: readonly {
    readonly path: string;
    readonly url: string;
    readonly expectedSha256: string;
    readonly expectedSizeBytes: number;
  }[];
  readonly licenseApproved: boolean;
}

export interface FoundryModelDownloadResult {
  readonly modelId: string;
  readonly path: string;
  readonly manifestPath: string;
  readonly sizeBytes: number;
  readonly resumed: boolean;
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly sizeBytes: number }[];
}export interface FoundryWorkerRuntimeStatus {
  readonly ready: boolean;
  readonly root: string;
  readonly python: string | null;
  readonly workerInstalled: boolean;
  readonly protocolVersion: number;
  readonly detail: string;
}

export interface FoundryTrainingRuntimeStatus {
  readonly installed: boolean;
  readonly detail: string;
}
export interface FoundryWorkerProbe {
  readonly healthy: boolean;
  readonly workerVersion: string;
  readonly capabilities: readonly string[];
  readonly protocolVersion: number;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

export async function getFoundryHardwareProfile(): Promise<FoundryHardwareProfile> {
  if (!isTauri) {
    return {
      native: false,
      os: typeof navigator === 'undefined' ? 'web' : navigator.platform || 'web',
      architecture: 'unknown',
      logicalCores: typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1,
      ramBytes: null,
      acceleratorStatus: 'unknown',
      acceleratorDetail: 'Desktop hardware check unavailable in web mode.',
      detectionComplete: false,
      recommendedMode: 'fixture_only_until_desktop_check',
      warnings: ['Open the VibeSpace desktop app for an OS-level hardware check.'],
    };
  }
  const profile = await invoke<Omit<FoundryHardwareProfile, 'native'>>('model_foundry_hardware_profile');
  return { ...profile, native: true };
}

export async function getFoundryRuntimeStatus(): Promise<FoundryWorkerRuntimeStatus> {
  if (!isTauri) return { ready: false, root: 'browser:unavailable', python: null, workerInstalled: false, protocolVersion: 1, detail: 'Native worker runtime is available only in the desktop app.' };
  return invoke<FoundryWorkerRuntimeStatus>('model_foundry_runtime_status');
}

export async function prepareFoundryRuntime(): Promise<FoundryWorkerRuntimeStatus> {
  if (!isTauri) throw new Error('Native worker runtime is available only in the desktop app.');
  return invoke<FoundryWorkerRuntimeStatus>('model_foundry_prepare_runtime');
}

export async function getFoundryTrainingRuntimeStatus(): Promise<FoundryTrainingRuntimeStatus> {
  if (!isTauri) return { installed: false, detail: 'Real LoRA training is available only in the desktop app.' };
  return invoke<FoundryTrainingRuntimeStatus>('model_foundry_training_runtime_status');
}

export async function installFoundryTrainingDependencies(): Promise<FoundryTrainingRuntimeStatus> {
  if (!isTauri) throw new Error('Real LoRA training is available only in the desktop app.');
  return invoke<FoundryTrainingRuntimeStatus>('model_foundry_install_training_dependencies');
}
export async function probeFoundryWorker(projectId: string): Promise<FoundryWorkerProbe> {
  if (!isTauri) throw new Error('Native worker probe is available only in the desktop app.');
  return invoke<FoundryWorkerProbe>('model_foundry_worker_probe', { projectId });
}

export async function downloadFoundryModel(request: FoundryModelDownloadRequest): Promise<FoundryModelDownloadResult> {
  if (!isTauri) throw new Error('Verified model downloads are available only in the desktop app.');
  return invoke<FoundryModelDownloadResult>('model_foundry_download_model', { request });
}

export async function cancelFoundryModelDownload(projectId: string, modelId: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('model_foundry_cancel_download', { projectId, modelId });
}

export async function cleanupFoundryPartialDownload(modelId: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('model_foundry_cleanup_partial_download', { modelId });
}