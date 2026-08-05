import { isTauri } from '@/lib/utils';
import type { TrainingMethod, TrainingModality, TrainingPrecision } from './modelHub';

type WeightTrainingMethod = Exclude<TrainingMethod, 'knowledge'>;

export interface LocalTrainingWorkerStatus {
  installed: boolean;
  attested: boolean;
  localOnly: true;
  protocol: number;
  sourceSha256: string;
  python: string | null;
  methods: WeightTrainingMethod[];
  modalities: TrainingModality[];
  precisions: TrainingPrecision[];
  reason: string | null;
}

interface NativeTrainingWorkerStatus {
  installed: boolean;
  attested: boolean;
  protocol: number;
  sourceSha256: string;
  python: string | null;
  methods: string[];
  modalities: string[];
  precisions: string[];
  reason: string | null;
}

export type TrainingRuntimeInvoke = (command: string) => Promise<NativeTrainingWorkerStatus>;

interface TrainingRuntimeOptions {
  native?: boolean;
  invoke?: TrainingRuntimeInvoke;
}

const WEIGHT_METHODS = new Set<WeightTrainingMethod>(['lora', 'qlora', 'full']);
const MODALITIES = new Set<TrainingModality>(['text', 'image', 'video', 'audio']);
const PRECISIONS = new Set<TrainingPrecision>(['fp32', 'fp16', 'bf16', 'int8', 'int4']);

const WEB_STATUS: LocalTrainingWorkerStatus = {
  installed: false,
  attested: false,
  localOnly: true,
  protocol: 1,
  sourceSha256: '',
  python: null,
  methods: [],
  modalities: [],
  precisions: [],
  reason: 'Local weight training is available only in the VibeSpace desktop app.',
};

function filterValues<T extends string>(values: readonly string[], allowed: Set<T>): T[] {
  return values.filter((value): value is T => allowed.has(value as T));
}

function normalizeStatus(status: NativeTrainingWorkerStatus): LocalTrainingWorkerStatus {
  return {
    installed: status.installed === true,
    attested: status.attested === true,
    localOnly: true,
    protocol: Number.isFinite(status.protocol) ? status.protocol : 0,
    sourceSha256: typeof status.sourceSha256 === 'string' ? status.sourceSha256 : '',
    python: typeof status.python === 'string' ? status.python : null,
    methods: filterValues(Array.isArray(status.methods) ? status.methods : [], WEIGHT_METHODS),
    modalities: filterValues(Array.isArray(status.modalities) ? status.modalities : [], MODALITIES),
    precisions: filterValues(Array.isArray(status.precisions) ? status.precisions : [], PRECISIONS),
    reason: typeof status.reason === 'string' ? status.reason : null,
  };
}

async function nativeInvoke(options: TrainingRuntimeOptions): Promise<TrainingRuntimeInvoke> {
  if (options.invoke) return options.invoke;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as TrainingRuntimeInvoke;
}

export async function getLocalTrainingWorkerStatus(
  options: TrainingRuntimeOptions = {},
): Promise<LocalTrainingWorkerStatus> {
  const native = options.native ?? isTauri;
  if (!native) return { ...WEB_STATUS };
  const invoke = await nativeInvoke(options);
  return normalizeStatus(await invoke('model_foundry_training_worker_status'));
}

export async function installLocalTrainingWorker(
  options: TrainingRuntimeOptions = {},
): Promise<LocalTrainingWorkerStatus> {
  const native = options.native ?? isTauri;
  if (!native) return { ...WEB_STATUS };
  const invoke = await nativeInvoke(options);
  return normalizeStatus(await invoke('model_foundry_install_training_worker'));
}
