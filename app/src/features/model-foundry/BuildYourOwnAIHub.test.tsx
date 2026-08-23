import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildYourOwnAIHub } from './BuildYourOwnAIHub';
import { saveJobs, TRAINABLE_MODELS } from './modelHub';
import type { VerifiedTrainingModel } from './trainingRuntime';

const tauriInvoke = vi.hoisted(() => vi.fn());
const getTrainingWorkerStatus = vi.hoisted(() => vi.fn());
const installTrainingWorker = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauriInvoke }));
vi.mock('./trainingRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./trainingRuntime')>()),
  getLocalTrainingWorkerStatus: getTrainingWorkerStatus,
  installLocalTrainingWorker: installTrainingWorker,
}));

const verifiedModel: VerifiedTrainingModel = {
  id: 'smollm2-135m-instruct',
  label: 'SmolLM2 135M Instruct',
  sourceId: 'HuggingFaceTB/SmolLM2-135M-Instruct',
  revision: '1'.repeat(40),
  license: 'apache-2.0',
  licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  gated: false,
  parametersB: 0.135,
  downloadBytes: 272_437_573,
  expectedRamGb: 4,
  expectedVramGb: 2,
  contextTokens: 8192,
  precision: 'BF16 safetensors',
  speed: 'fast',
  quality: 'efficient',
  cpuPractical: true,
  installed: false,
  verified: false,
  installedBytes: 0,
  status: 'not-installed',
  localOnly: true,
};

describe('BuildYourOwnAIHub', () => {
  beforeEach(() => {
    window.localStorage.clear();
    tauriInvoke.mockReset();
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'model_foundry_detect_hardware') {
        return {
          cpu: 'Test CPU',
          gpu: 'Test GPU',
          ramGb: 32,
          vramGb: 12,
          freeStorageGb: 100,
          os: 'Test OS',
          accelerators: ['CUDA'],
        };
      }
      if (command === 'model_foundry_list_jobs') return [];
      if (command === 'faster_whisper_status') return { ready: false };
      throw new Error(`Unexpected command: ${command}`);
    });
    getTrainingWorkerStatus.mockReset();
    installTrainingWorker.mockReset();
    getTrainingWorkerStatus.mockResolvedValue({
      installed: false,
      attested: false,
      localOnly: true,
      protocol: 1,
      sourceSha256: '',
      python: null,
      methods: [],
      modalities: [],
      precisions: [],
      reason: 'The verified local training worker is not installed.',
    });
  });

  it('offers one truthful setup path for all verified weight-training methods', async () => {
    installTrainingWorker.mockResolvedValue({
      installed: true,
      attested: true,
      localOnly: true,
      protocol: 1,
      sourceSha256: 'a'.repeat(64),
      python: 'python',
      methods: ['lora', 'qlora', 'full'],
      modalities: ['text'],
      precisions: ['bf16', 'int4'],
      reason: null,
    });
    render(
      <BuildYourOwnAIHub open onOpenChange={vi.fn()} verifiedTrainingModels={[verifiedModel]} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Set up LoRA, QLoRA, and Full/i }));

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^QLoRA fine-tuning/i }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(installTrainingWorker).toHaveBeenCalledWith({ includeQlora: true });
  });

  it('resolves the same verified worker when a caller omits the capability prop', async () => {
    getTrainingWorkerStatus.mockResolvedValue({
      installed: true,
      attested: true,
      localOnly: true,
      protocol: 1,
      sourceSha256: 'a'.repeat(64),
      python: 'python',
      methods: ['lora', 'qlora', 'full'],
      modalities: ['text'],
      precisions: ['bf16'],
      reason: null,
    });

    render(
      <BuildYourOwnAIHub open onOpenChange={vi.fn()} verifiedTrainingModels={[verifiedModel]} />,
    );

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^LoRA fine-tuning/i }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(getTrainingWorkerStatus).toHaveBeenCalledTimes(1);
  });

  it('disables training methods without an installed verified worker', async () => {
    render(<BuildYourOwnAIHub open onOpenChange={vi.fn()} />);

    expect(
      (screen.getByRole('button', { name: /^LoRA fine-tuning/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: /^QLoRA fine-tuning/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: /Advanced full fine-tuning/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getAllByText(/verified local training worker is not installed/i).length,
    ).toBeGreaterThan(0);
  });

  it('activates only a verified completed artifact', () => {
    saveJobs(window.localStorage, [
      {
        id: 'job_12345',
        name: 'Release specialist',
        baseModelId: TRAINABLE_MODELS[0].id,
        method: 'knowledge',
        status: 'completed',
        progress: 100,
        artifactPath: 'C:\\private\\knowledge-artifact.json',
        artifactVerified: true,
        createdAt: '1',
        updatedAt: '2',
      },
    ]);
    const onActivateArtifact = vi.fn();
    render(
      <BuildYourOwnAIHub open onOpenChange={vi.fn()} onActivateArtifact={onActivateArtifact} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View model library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Release specialist with this agent' }));
    expect(onActivateArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job_12345', artifactVerified: true }),
    );
  });

  it('discloses hardware compatibility, runtime format, and the supported build path', () => {
    render(<BuildYourOwnAIHub open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getAllByText(/Q4_K_M \(4-bit inference\)/)).toHaveLength(TRAINABLE_MODELS.length);
    expect(screen.getAllByText(/Supported build path: Knowledge\/RAG/)).toHaveLength(
      TRAINABLE_MODELS.length,
    );
    expect(screen.getByText(/Operating system:/)).toBeTruthy();
    expect(screen.getByText(/GPU:/)).toBeTruthy();
    expect(screen.getByText(/Acceleration:/)).toBeTruthy();
    expect(screen.getByText(/Managed storage:/)).toBeTruthy();
  });

  it('shows the native managed storage root and a higher-capacity recommendation', async () => {
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'model_foundry_detect_hardware') {
        return {
          cpu: 'Test CPU',
          gpu: 'Test GPU',
          ramGb: 32,
          vramGb: 12,
          freeStorageGb: 100,
          os: 'Test OS',
          accelerators: ['CUDA'],
          storageRoot: 'C:\\Users\\test\\AppData\\Roaming\\VibeSpace\\model-foundry',
          recommendedStorageRoot: 'D:\\VibeSpace-Model-Foundry',
        };
      }
      if (command === 'model_foundry_list_jobs') return [];
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<BuildYourOwnAIHub open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/Managed storage: C:\\Users\\test/)).toBeTruthy();
    expect(screen.getByText(/Storage recommendation: D:\\VibeSpace-Model-Foundry/)).toBeTruthy();
  });

  it('shows the verified checkpoint catalog for attested weight training', () => {
    render(
      <BuildYourOwnAIHub
        open
        onOpenChange={vi.fn()}
        trainingWorker={{
          installed: true,
          attested: true,
          localOnly: true,
          protocol: 1,
          sourceSha256: 'a'.repeat(64),
          python: 'python',
          methods: ['lora', 'qlora', 'full'],
          modalities: ['text'],
          precisions: ['bf16'],
          reason: null,
        }}
        verifiedTrainingModels={[verifiedModel]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^LoRA fine-tuning/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('SmolLM2 135M Instruct')).toBeTruthy();
    expect(screen.getByText(/HuggingFaceTB\/SmolLM2-135M-Instruct/)).toBeTruthy();
    expect(screen.getByText(/LORA · QLORA · FULL/)).toBeTruthy();
    expect(screen.queryByText(/Q4_K_M \(4-bit inference\)/)).toBeNull();
  });

  it('exposes validated reproducible settings for weight training', () => {
    render(
      <BuildYourOwnAIHub
        open
        onOpenChange={vi.fn()}
        trainingWorker={{
          installed: true,
          attested: true,
          localOnly: true,
          protocol: 1,
          sourceSha256: 'a'.repeat(64),
          python: 'python',
          methods: ['lora', 'qlora', 'full'],
          modalities: ['text'],
          precisions: ['bf16'],
          reason: null,
        }}
        verifiedTrainingModels={[
          {
            ...verifiedModel,
            installed: true,
            verified: true,
            installedBytes: verifiedModel.downloadBytes,
            status: 'ready',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^LoRA fine-tuning/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: /^Low memory/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Balanced/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Faster/i })).toBeTruthy();
    expect(screen.getByText(/Estimated training time:/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Low memory/i }));
    fireEvent.click(screen.getByText(/Advanced reproducible settings/i));
    expect((screen.getByLabelText('Seed') as HTMLInputElement).value).toBe('7');
    expect((screen.getByLabelText('Learning rate') as HTMLInputElement).value).toBe('0.0002');
    expect((screen.getByLabelText('LoRA rank') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText('Batch size') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Gradient accumulation') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('Maximum sequence length') as HTMLInputElement).value).toBe(
      '1024',
    );
    fireEvent.change(screen.getByLabelText('Learning rate'), { target: { value: '' } });
    expect(screen.getByText(/Learning rate must be/)).toBeTruthy();
  });

  it('resumes an interrupted weight job only when native checkpoint evidence exists', async () => {
    const interrupted = {
      id: 'job_resume123',
      name: 'Local adapter',
      baseModelId: 'smollm2-135m-instruct',
      method: 'lora' as const,
      status: 'failed' as const,
      progress: 35,
      resumeAvailable: true,
      error: 'The previous local process was interrupted.',
      createdAt: '1',
      updatedAt: '2',
    };
    saveJobs(window.localStorage, [interrupted]);
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'model_foundry_detect_hardware') {
        return {
          cpu: 'Test CPU',
          gpu: 'Test GPU',
          ramGb: 32,
          vramGb: 12,
          freeStorageGb: 100,
          os: 'Test OS',
          accelerators: ['CUDA'],
        };
      }
      if (command === 'model_foundry_list_jobs') return [interrupted];
      if (command === 'model_foundry_resume_job') {
        return {
          ...interrupted,
          status: 'queued',
          resumeAvailable: false,
          error: undefined,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<BuildYourOwnAIHub open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'View model library' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume from checkpoint' }));

    await waitFor(() =>
      expect(tauriInvoke).toHaveBeenCalledWith('model_foundry_resume_job', {
        jobId: 'job_resume123',
      }),
    );
  });
});
