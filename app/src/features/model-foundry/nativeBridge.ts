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
}

export interface FoundryNativeTrainingExample {
  readonly prompt: string;
  readonly completion: string;
}

export interface FoundryNativeTrainingRequest {
  readonly projectId: string;
  readonly jobId: string;
  readonly modelId: string;
  readonly datasetVersionId: string;
  readonly datasetManifestHash: string;
  readonly datasetFingerprint: string;
  readonly datasetApproved: boolean;
  readonly trainExamples: readonly FoundryNativeTrainingExample[];
  readonly validationExamples: readonly FoundryNativeTrainingExample[];
  readonly trainingConfig: {
    readonly method: 'lora' | 'qlora';
    readonly seed: number;
    readonly epochs: number;
    readonly batchSize: number;
    readonly gradientAccumulation: number;
    readonly maxSequenceLength: number;
    readonly learningRate: number;
    readonly loraRank: number;
    readonly loraAlpha: number;
    readonly loraDropout: number;
  };
  readonly targetModules?: readonly string[];
}

export interface FoundryNativeTrainingStart {
  readonly started: boolean;
  readonly projectId: string;
  readonly jobId: string;
  readonly jobDir: string;
}

export interface FoundryRealArtifactSummary {
  readonly projectId: string;
  readonly jobId: string;
  readonly manifestSha256: string;
  readonly adapterFiles: Readonly<Record<string, string>>;
  readonly metrics: Record<string, unknown>;
  readonly trainingConfig: Record<string, unknown>;
}

export interface FoundryArtifactGeneration {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly artifactManifestSha256: string;
}

export interface FoundryRealEvaluationReport {
  readonly suite: string;
  readonly caseCount: number;
  readonly baseScore: number;
  readonly candidateScore: number;
  readonly delta: number;
  readonly safetyFailures: readonly string[];
  readonly gate: 'pass' | 'blocked';
  readonly caseEvidence: readonly { readonly caseId: string; readonly baseScore: number; readonly candidateScore: number; readonly evidenceHash: string }[];
}

export interface FoundryArtifactEvaluation {
  readonly artifactManifestSha256: string;
  readonly report: FoundryRealEvaluationReport;
}

export interface FoundryWorkerMessage {
  readonly projectId: string;
  readonly jobId: string;
  readonly message: Record<string, unknown>;
}

export interface FoundryWorkerRuntimeStatus {
  readonly ready: boolean;
  readonly root: string;
  readonly python: string | null;
  readonly workerInstalled: boolean;
  readonly protocolVersion: number;
  readonly detail: string;
}

export interface FoundryTrainingRuntimeStatus {
  readonly installed: boolean;
  readonly qloraInstalled: boolean;
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
  if (!isTauri) return { installed: false, qloraInstalled: false, detail: 'Real LoRA training is available only in the desktop app.' };
  return invoke<FoundryTrainingRuntimeStatus>('model_foundry_training_runtime_status');
}

export async function installFoundryTrainingDependencies(includeQlora = false): Promise<FoundryTrainingRuntimeStatus> {
  if (!isTauri) throw new Error('Real LoRA training is available only in the desktop app.');
  return invoke<FoundryTrainingRuntimeStatus>('model_foundry_install_training_dependencies', { includeQlora });
}

export async function startFoundryTraining(request: FoundryNativeTrainingRequest): Promise<FoundryNativeTrainingStart> {
  if (!isTauri) throw new Error('Real LoRA training is available only in the desktop app.');
  return invoke<FoundryNativeTrainingStart>('model_foundry_start_training', { request });
}

export async function resumeFoundryTraining(projectId: string, jobId: string): Promise<FoundryNativeTrainingStart> {
  if (!isTauri) throw new Error('Real LoRA training is available only in the desktop app.');
  return invoke<FoundryNativeTrainingStart>('model_foundry_resume_training', { projectId, jobId });
}

export async function inspectFoundryArtifact(projectId: string, jobId: string): Promise<FoundryRealArtifactSummary> {
  if (!isTauri) throw new Error('Real training artifacts are available only in the desktop app.');
  return invoke<FoundryRealArtifactSummary>('model_foundry_inspect_artifact', { projectId, jobId });
}

export async function generateFromFoundryArtifact(args: { projectId: string; jobId: string; prompt: string; maxNewTokens?: number }): Promise<FoundryArtifactGeneration> {
  if (!isTauri) throw new Error('Local adapter inference is available only in the desktop app.');
  return invoke<FoundryArtifactGeneration>('model_foundry_generate_from_artifact', { request: args });
}

export async function evaluateFoundryArtifact(args: { projectId: string; jobId: string; maxCases?: number; maxNewTokens?: number }): Promise<FoundryArtifactEvaluation> {
  if (!isTauri) throw new Error('Local adapter evaluation is available only in the desktop app.');
  return invoke<FoundryArtifactEvaluation>('model_foundry_evaluate_artifact', { request: args });
}

export async function cancelFoundryTraining(projectId: string, jobId: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('model_foundry_cancel_training', { projectId, jobId });
}

export async function stopFoundryTrainingAfterCheckpoint(projectId: string, jobId: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('model_foundry_stop_after_checkpoint', { projectId, jobId });
}

export async function listenFoundryWorkerMessages(listener: (event: FoundryWorkerMessage) => void): Promise<() => void> {
  if (!isTauri) return () => undefined;
  const event = await import('@tauri-apps/api/event');
  return event.listen<FoundryWorkerMessage>('model-foundry:worker-message', ({ payload }) => listener(payload));
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
