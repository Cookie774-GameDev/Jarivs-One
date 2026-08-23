export type TrainingMethod = 'knowledge' | 'lora' | 'qlora' | 'full';
export type SourceUse = 'retrieval' | 'fine_tuning' | 'multimodal' | 'evaluation' | 'unsupported';

export interface HardwareProfile {
  cpu: string;
  gpu: string | null;
  ramGb: number;
  vramGb: number;
  freeStorageGb: number;
  os: string;
  accelerators: string[];
  storageRoot?: string;
  recommendedStorageRoot?: string | null;
}

export type TrainingModality = 'text' | 'image' | 'video' | 'audio';
export type TrainingPrecision = 'fp32' | 'fp16' | 'bf16' | 'int8' | 'int4';

export interface FoundryTrainingConfiguration {
  method: Exclude<TrainingMethod, 'knowledge'>;
  seed: number;
  epochs: number;
  maxSteps?: number;
  batchSize: number;
  gradientAccumulation: number;
  maxSequenceLength: number;
  learningRate: number;
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
}

export type TrainingComputePresetId = 'low-memory' | 'balanced' | 'faster';

export interface TrainingComputePreset {
  id: TrainingComputePresetId;
  label: string;
  summary: string;
  batchSize: number;
  gradientAccumulation: number;
  maxSequenceLength: number;
}

export const TRAINING_COMPUTE_PRESETS: readonly TrainingComputePreset[] = [
  {
    id: 'low-memory',
    label: 'Low memory',
    summary: 'Small batches and shorter context. Uses less peak memory and usually takes longer.',
    batchSize: 1,
    gradientAccumulation: 8,
    maxSequenceLength: 1_024,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    summary: 'A conservative everyday profile for supported local GPUs.',
    batchSize: 1,
    gradientAccumulation: 4,
    maxSequenceLength: 2_048,
  },
  {
    id: 'faster',
    label: 'Faster',
    summary: 'Larger batches for machines with verified memory headroom.',
    batchSize: 2,
    gradientAccumulation: 2,
    maxSequenceLength: 2_048,
  },
] as const;

export function defaultFoundryTrainingConfiguration(
  method: Exclude<TrainingMethod, 'knowledge'>,
): FoundryTrainingConfiguration {
  return {
    method,
    seed: 7,
    epochs: 1,
    batchSize: 1,
    gradientAccumulation: 4,
    maxSequenceLength: 2_048,
    learningRate: method === 'full' ? 0.000_02 : 0.000_2,
    loraRank: 16,
    loraAlpha: 32,
    loraDropout: 0.05,
  };
}

export function applyTrainingComputePreset(
  method: Exclude<TrainingMethod, 'knowledge'>,
  presetId: TrainingComputePresetId,
  current: FoundryTrainingConfiguration = defaultFoundryTrainingConfiguration(method),
): FoundryTrainingConfiguration {
  const preset = TRAINING_COMPUTE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return { ...current, method };
  return {
    ...current,
    method,
    batchSize: preset.batchSize,
    gradientAccumulation: preset.gradientAccumulation,
    maxSequenceLength: preset.maxSequenceLength,
  };
}

export interface FoundryTrainingDurationEstimate {
  minimumHours: number;
  maximumHours: number;
  optimizationSteps: number;
  basis: string;
  disclaimer: string;
}

function roundedHours(seconds: number): number {
  return Math.max(0.1, Math.round((seconds / 3_600) * 10) / 10);
}

export function estimateFoundryTrainingDuration(input: {
  method: Exclude<TrainingMethod, 'knowledge'>;
  parametersB: number;
  configuration: FoundryTrainingConfiguration;
  hardware: HardwareProfile;
  usableSourceCount: number;
}): FoundryTrainingDurationEstimate {
  const sourceCount = Math.max(1, Math.floor(input.usableSourceCount || 1));
  const estimatedExamples = Math.max(64, sourceCount * 250);
  const effectiveBatch = Math.max(
    1,
    input.configuration.batchSize * input.configuration.gradientAccumulation,
  );
  const epochSteps = Math.ceil((estimatedExamples * input.configuration.epochs) / effectiveBatch);
  const optimizationSteps = Math.max(
    1,
    Math.min(input.configuration.maxSteps ?? epochSteps, epochSteps),
  );
  const processedTokens =
    optimizationSteps *
    input.configuration.gradientAccumulation *
    input.configuration.batchSize *
    input.configuration.maxSequenceLength *
    0.65;
  const parametersB = Math.max(0.1, input.parametersB);
  const methodCost = input.method === 'full' ? 3.5 : input.method === 'qlora' ? 1.15 : 1;
  const acceleratorCapacity =
    input.hardware.vramGb > 0 ? Math.max(1, input.hardware.vramGb / 4) : 0;
  const tokenRate =
    acceleratorCapacity > 0
      ? (1_250 * acceleratorCapacity) / (parametersB * methodCost)
      : (45 * Math.max(1, input.hardware.ramGb / 8)) / (parametersB * methodCost);
  const centralSeconds = processedTokens / Math.max(1, tokenRate);
  return {
    minimumHours: roundedHours(centralSeconds * 0.75),
    maximumHours: Math.max(
      roundedHours(centralSeconds * 0.75) + 0.1,
      roundedHours(centralSeconds * 1.8),
    ),
    optimizationSteps,
    basis: `${sourceCount} source${sourceCount === 1 ? '' : 's'}, ${optimizationSteps.toLocaleString()} planned optimization steps, and the detected ${acceleratorCapacity > 0 ? 'GPU' : 'CPU'}.`,
    disclaimer:
      'Planning estimate only. Actual time changes with prepared example count, token lengths, cooling, and other computer activity.',
  };
}

export function validateFoundryTrainingConfiguration(
  configuration: FoundryTrainingConfiguration,
): string | null {
  const integerBounds: ReadonlyArray<[keyof FoundryTrainingConfiguration, string, number, number]> =
    [
      ['seed', 'Seed', 0, 0xffff_ffff],
      ['epochs', 'Epochs', 1, 20],
      ['batchSize', 'Batch size', 1, 128],
      ['gradientAccumulation', 'Gradient accumulation', 1, 1_024],
      ['maxSequenceLength', 'Sequence length', 64, 131_072],
      ['loraRank', 'LoRA rank', 1, 1_024],
      ['loraAlpha', 'LoRA alpha', 1, 8_192],
    ];
  for (const [key, label, minimum, maximum] of integerBounds) {
    const value = configuration[key];
    if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
      return `${label} must be a whole number from ${minimum} to ${maximum}.`;
    }
  }
  if (
    configuration.maxSteps !== undefined &&
    (!Number.isInteger(configuration.maxSteps) ||
      configuration.maxSteps < 1 ||
      configuration.maxSteps > 1_000_000)
  ) {
    return 'Maximum steps must be blank or a whole number from 1 to 1,000,000.';
  }
  if (
    !Number.isFinite(configuration.learningRate) ||
    configuration.learningRate < 0.000_000_01 ||
    configuration.learningRate > 1
  ) {
    return 'Learning rate must be from 0.00000001 to 1.';
  }
  if (
    !Number.isFinite(configuration.loraDropout) ||
    configuration.loraDropout < 0 ||
    configuration.loraDropout >= 1
  ) {
    return 'LoRA dropout must be from 0 up to (but not including) 1.';
  }
  return null;
}

export interface TrainingWorkerCapability {
  installed: boolean;
  attested: boolean;
  version: string;
  methods: readonly Exclude<TrainingMethod, 'knowledge'>[];
  modalities: readonly TrainingModality[];
  precisions: readonly TrainingPrecision[];
}

export interface LocalTrainingPlan {
  method: TrainingMethod;
  available: boolean;
  localOnly: true;
  reason: string | null;
  fallbackMethod: null;
  requiredVramGb: number;
  requiredRamGb: number;
  requiredStorageGb: number;
  workload: 'light' | 'moderate' | 'heavy';
}

function roundedRequirement(value: number): number {
  return Math.max(1, Math.ceil(value));
}

const MEMORY_REPORTING_TOLERANCE_GB = 0.01;

function reportedMemoryMeets(availableGb: number, requiredGb: number): boolean {
  return availableGb + MEMORY_REPORTING_TOLERANCE_GB >= requiredGb;
}

export function planLocalTrainingMethod(input: {
  method: TrainingMethod;
  parametersB: number;
  hardware: HardwareProfile;
  worker: TrainingWorkerCapability | null;
}): LocalTrainingPlan {
  const parametersB = Math.max(0.1, Number.isFinite(input.parametersB) ? input.parametersB : 0.1);
  const requirements =
    input.method === 'knowledge'
      ? { vram: 0, ram: 4, storage: 2, workload: 'light' as const }
      : input.method === 'qlora'
        ? {
            vram: Math.max(6, parametersB * 4),
            ram: Math.max(16, parametersB * 12),
            storage: Math.max(10, parametersB * 8),
            workload: 'moderate' as const,
          }
        : input.method === 'lora'
          ? {
              vram: Math.max(8, parametersB * 8),
              ram: Math.max(16, parametersB * 16),
              storage: Math.max(12, parametersB * 12),
              workload: 'moderate' as const,
            }
          : {
              vram: Math.max(12, parametersB * 16),
              ram: Math.max(32, parametersB * 32),
              storage: Math.max(30, parametersB * 40),
              workload: 'heavy' as const,
            };
  const requiredVramGb = roundedRequirement(requirements.vram);
  const requiredRamGb = roundedRequirement(requirements.ram);
  const requiredStorageGb = roundedRequirement(requirements.storage);
  const base: Omit<LocalTrainingPlan, 'available' | 'reason'> = {
    method: input.method,
    localOnly: true,
    fallbackMethod: null,
    requiredVramGb,
    requiredRamGb,
    requiredStorageGb,
    workload: requirements.workload,
  };

  if (input.method !== 'knowledge') {
    if (!input.worker?.installed) {
      return {
        ...base,
        available: false,
        reason: 'The verified local training worker is not installed.',
      };
    }
    if (!input.worker.attested) {
      return {
        ...base,
        available: false,
        reason: 'The installed local training worker is not verified or attested.',
      };
    }
    if (!input.worker.methods.includes(input.method)) {
      return {
        ...base,
        available: false,
        reason: `The verified worker does not support ${input.method.toUpperCase()} training.`,
      };
    }
  }

  if (input.hardware.freeStorageGb < requiredStorageGb) {
    return {
      ...base,
      available: false,
      reason: `Requires about ${requiredStorageGb} GB free storage; ${Math.max(0, input.hardware.freeStorageGb)} GB is available.`,
    };
  }

  if (input.method === 'qlora' && !reportedMemoryMeets(input.hardware.vramGb, requiredVramGb)) {
    return {
      ...base,
      available: false,
      reason: `QLoRA requires about ${requiredVramGb} GB verified CUDA VRAM; ${Math.max(0, input.hardware.vramGb).toFixed(1)} GB is available.`,
    };
  }

  const memoryFits =
    reportedMemoryMeets(input.hardware.vramGb, requiredVramGb) ||
    reportedMemoryMeets(input.hardware.ramGb, requiredRamGb);
  if (!memoryFits) {
    return {
      ...base,
      available: false,
      reason: `Requires about ${requiredVramGb} GB VRAM or ${requiredRamGb} GB system RAM for this model.`,
    };
  }

  return { ...base, available: true, reason: null };
}

export interface TrainableModel {
  id: string;
  label: string;
  parametersB: number;
  downloadGb: number;
  ramGb: number;
  vramGb: number;
  quantization: string;
  methods: TrainingMethod[];
  local: true;
  quality: 'efficient' | 'balanced' | 'high';
  speed: 'fast' | 'medium' | 'slow';
}

export function modelFoundryMethodAvailability(
  method: TrainingMethod,
  worker: TrainingWorkerCapability | null = null,
): {
  available: boolean;
  reason: string | null;
} {
  if (method === 'knowledge') return { available: true, reason: null };
  if (!worker?.installed) {
    return { available: false, reason: 'The verified local training worker is not installed.' };
  }
  if (!worker.attested) {
    return {
      available: false,
      reason: 'The installed local training worker is not verified or attested.',
    };
  }
  if (!worker.methods.includes(method)) {
    return {
      available: false,
      reason: `The verified worker does not support ${method.toUpperCase()} training.`,
    };
  }
  return { available: true, reason: null };
}

export interface ClassifiedSource {
  name: string;
  path?: string;
  kind: 'document' | 'code' | 'image' | 'audio' | 'video' | 'dataset';
  use: SourceUse;
  explanation: string;
}

export interface FoundryJob {
  id: string;
  name: string;
  baseModelId: string;
  method: TrainingMethod;
  status:
    | 'queued'
    | 'validating'
    | 'preparing'
    | 'training'
    | 'evaluating'
    | 'packaging'
    | 'completed'
    | 'failed'
    | 'cancelled';
  progress: number;
  artifactPath?: string;
  artifactVerified?: boolean;
  artifactSha256?: string;
  storageBytes?: number;
  sourceCount?: number;
  version?: number;
  resumeAvailable?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const TRAINABLE_MODELS: readonly TrainableModel[] = [
  {
    id: 'qwen2.5:1.5b-instruct-q4_K_M',
    label: 'Qwen 2.5 1.5B Instruct',
    parametersB: 1.5,
    downloadGb: 1.2,
    ramGb: 6,
    vramGb: 4,
    quantization: 'Q4_K_M (4-bit inference)',
    methods: ['knowledge'],
    local: true,
    quality: 'efficient',
    speed: 'fast',
  },
  {
    id: 'qwen2.5:7b-instruct-q4_K_M',
    label: 'Qwen 2.5 7B Instruct',
    parametersB: 7,
    downloadGb: 4.7,
    ramGb: 16,
    vramGb: 8,
    quantization: 'Q4_K_M (4-bit inference)',
    methods: ['knowledge'],
    local: true,
    quality: 'balanced',
    speed: 'medium',
  },
  {
    id: 'llama3.1:8b-instruct-q4_K_M',
    label: 'Llama 3.1 8B Instruct',
    parametersB: 8,
    downloadGb: 5.2,
    ramGb: 20,
    vramGb: 10,
    quantization: 'Q4_K_M (4-bit inference)',
    methods: ['knowledge'],
    local: true,
    quality: 'high',
    speed: 'medium',
  },
] as const;

export function compatibleModels(
  profile: HardwareProfile,
  models: readonly TrainableModel[] = TRAINABLE_MODELS,
): Array<{
  model: TrainableModel;
  compatible: boolean;
  recommended: boolean;
  warning: string | null;
}> {
  const assessed = models.map((model) => {
    const storageOk = profile.freeStorageGb >= model.downloadGb * 2.2;
    const memoryOk = profile.vramGb >= model.vramGb || profile.ramGb >= model.ramGb;
    const compatible = storageOk && memoryOk;
    return {
      model,
      compatible,
      recommended: false,
      warning: !storageOk
        ? `Requires about ${Math.ceil(model.downloadGb * 2.2)} GB free for download, checkpoints, and packaging.`
        : !memoryOk
          ? `Requires about ${model.vramGb} GB VRAM or ${model.ramGb} GB system RAM.`
          : null,
    };
  });
  const best = [...assessed]
    .filter((item) => item.compatible)
    .sort((a, b) => b.model.parametersB - a.model.parametersB)[0];
  if (best) best.recommended = true;
  return assessed;
}

const extensions: Record<string, ClassifiedSource['kind']> = {
  pdf: 'document',
  txt: 'document',
  md: 'document',
  docx: 'document',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  py: 'code',
  rs: 'code',
  json: 'dataset',
  jsonl: 'dataset',
  csv: 'dataset',
  parquet: 'dataset',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
};

export function classifySource(
  name: string,
  method: TrainingMethod,
  multimodal: boolean,
  path?: string,
  processors: { transcriptionReady?: boolean } = {},
): ClassifiedSource {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const kind = extensions[ext];
  if (!kind) {
    return {
      name,
      path,
      kind: 'document',
      use: 'unsupported',
      explanation: 'Unsupported file type. It will not be uploaded or processed.',
    };
  }
  const hasVerifiedTextExtractor = [
    'txt',
    'md',
    'json',
    'jsonl',
    'csv',
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'rs',
    'docx',
  ].includes(ext);
  const hasVerifiedTranscription =
    method === 'knowledge' &&
    processors.transcriptionReady === true &&
    (kind === 'audio' || kind === 'video');
  if (!hasVerifiedTextExtractor && !hasVerifiedTranscription) {
    const explanation =
      kind === 'document'
        ? 'A verified local document extractor for this format is not installed. Convert it to TXT or Markdown; it will not be processed or uploaded as-is.'
        : kind === 'audio'
          ? 'A verified local transcription backend is not installed for Model Foundry. The recording will not be processed or uploaded.'
          : kind === 'video'
            ? 'Verified local video transcription and frame-caption extraction are not installed. The video will not be processed or uploaded.'
            : kind === 'image'
              ? multimodal
                ? 'A verified local multimodal training backend is not installed. The image will not be processed or uploaded.'
                : 'The selected text model cannot use images. Choose a supported multimodal build path when one becomes available.'
              : 'A verified local structured-data extractor for this format is not installed. The file will not be processed or uploaded.';
    return {
      name,
      path,
      kind,
      use: 'unsupported',
      explanation,
    };
  }
  if (kind === 'audio' || kind === 'video') {
    return {
      name,
      path,
      kind,
      use: 'retrieval',
      explanation:
        kind === 'audio'
          ? 'The installed verified local speech model will transcribe this recording into reviewed retrieval text. The original stays unchanged.'
          : 'Only the audio track will be transcribed into retrieval text. Video frames are not understood or used by this text model.',
    };
  }
  if (kind === 'dataset') {
    return {
      name,
      path,
      kind,
      use: method === 'knowledge' ? 'retrieval' : 'fine_tuning',
      explanation:
        method === 'knowledge'
          ? 'Validated and indexed as retrieval knowledge.'
          : 'Validated as structured examples, deduplicated, and split before training.',
    };
  }
  return {
    name,
    path,
    kind,
    use: method === 'knowledge' ? 'retrieval' : 'fine_tuning',
    explanation:
      method === 'knowledge'
        ? 'Extracted, cleaned, deduplicated, and indexed locally.'
        : 'Extracted and converted into reviewed training examples locally.',
  };
}

export function mayStartTraining(input: {
  name: string;
  model: TrainableModel;
  method: TrainingMethod;
  hardware: HardwareProfile;
  sources: ClassifiedSource[];
  worker?: TrainingWorkerCapability | null;
}): string | null {
  if (!input.name.trim()) return 'Name the model before training.';
  const methodAvailability = modelFoundryMethodAvailability(input.method, input.worker ?? null);
  if (!methodAvailability.available) return methodAvailability.reason;
  if (!input.model.methods.includes(input.method))
    return 'The selected base model does not support this training method.';
  if (input.method !== 'knowledge') {
    const plan = planLocalTrainingMethod({
      method: input.method,
      parametersB: input.model.parametersB,
      hardware: input.hardware,
      worker: input.worker ?? null,
    });
    if (!plan.available) return plan.reason;
  }
  const compatibility = compatibleModels(input.hardware, [input.model]).find(
    (item) => item.model.id === input.model.id,
  );
  if (!compatibility?.compatible)
    return compatibility?.warning ?? 'The selected model is not compatible.';
  if (!input.sources.some((source) => source.use !== 'unsupported'))
    return 'Attach at least one supported source or dataset.';
  return null;
}

const JOB_KEY = 'vibespace.model-foundry.jobs.v2';

export function loadJobs(storage: Pick<Storage, 'getItem'>): FoundryJob[] {
  try {
    const parsed = JSON.parse(storage.getItem(JOB_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FoundryJob =>
      Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as FoundryJob).id === 'string' &&
        typeof (item as FoundryJob).status === 'string',
      ),
    );
  } catch {
    return [];
  }
}

export function saveJobs(storage: Pick<Storage, 'setItem'>, jobs: FoundryJob[]): void {
  storage.setItem(JOB_KEY, JSON.stringify(jobs.slice(0, 50)));
}

export function foundryModelOptions(jobs: unknown): Array<{
  id: string;
  label: string;
  subtitle: string;
}> {
  if (!Array.isArray(jobs)) return [];
  return (jobs as FoundryJob[])
    .filter(
      (job) =>
        job.status === 'completed' && job.artifactVerified === true && Boolean(job.artifactPath),
    )
    .map((job) => {
      const baseModel = TRAINABLE_MODELS.find((candidate) => candidate.id === job.baseModelId);
      const artifactKind =
        job.method === 'knowledge'
          ? 'knowledge'
          : `${job.method === 'lora' ? 'LoRA' : job.method === 'qlora' ? 'QLoRA' : 'full-weight'} model`;
      return {
        id: `foundry:${job.id}`,
        label: job.name,
        subtitle: `Verified local ${artifactKind} · ${baseModel?.label ?? job.baseModelId}`,
      };
    });
}

export function isModelInstalled(modelId: string, installedModelIds: readonly string[]): boolean {
  const expected = modelId.trim().toLowerCase();
  return installedModelIds.some((candidate) => candidate.trim().toLowerCase() === expected);
}

export function newlyCompletedJobId(
  previous: readonly FoundryJob[],
  current: readonly FoundryJob[],
): string | null {
  const alreadyCompleted = new Set(
    previous
      .filter(
        (job) =>
          job.status === 'completed' && job.artifactVerified === true && Boolean(job.artifactPath),
      )
      .map((job) => job.id),
  );
  return (
    current.find(
      (job) =>
        job.status === 'completed' &&
        job.artifactVerified === true &&
        Boolean(job.artifactPath) &&
        !alreadyCompleted.has(job.id),
    )?.id ?? null
  );
}

export function formatFoundryStorageBytes(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'Not measured';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
