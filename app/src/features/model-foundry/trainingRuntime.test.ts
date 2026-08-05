import { describe, expect, it, vi } from 'vitest';
import {
  getLocalTrainingWorkerStatus,
  installLocalTrainingWorker,
  type TrainingRuntimeInvoke,
} from './trainingRuntime';

describe('trainingRuntime', () => {
  it('reports a truthful web-preview boundary without invoking native code', async () => {
    const invoke = vi.fn();

    const status = await getLocalTrainingWorkerStatus({ native: false, invoke });

    expect(invoke).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      installed: false,
      attested: false,
      localOnly: true,
      methods: [],
    });
    expect(status.reason).toMatch(/desktop app/i);
  });

  it('normalizes the attested native worker capability response', async () => {
    const invoke = vi.fn<TrainingRuntimeInvoke>().mockResolvedValue({
      installed: true,
      attested: true,
      protocol: 1,
      sourceSha256: 'a'.repeat(64),
      python: 'python',
      methods: ['lora', 'qlora', 'full', 'unknown'],
      modalities: ['text', 'image', 'video', 'audio', 'unknown'],
      precisions: ['fp32', 'fp16', 'bf16', 'int4', 'unknown'],
      reason: null,
    });

    const status = await getLocalTrainingWorkerStatus({ native: true, invoke });

    expect(invoke).toHaveBeenCalledWith('model_foundry_training_worker_status');
    expect(status.methods).toEqual(['lora', 'qlora', 'full']);
    expect(status.modalities).toEqual(['text', 'image', 'video', 'audio']);
    expect(status.precisions).toEqual(['fp32', 'fp16', 'bf16', 'int4']);
    expect(status.localOnly).toBe(true);
  });

  it('installs only through the explicit native worker command', async () => {
    const invoke = vi.fn<TrainingRuntimeInvoke>().mockResolvedValue({
      installed: true,
      attested: true,
      protocol: 1,
      sourceSha256: 'b'.repeat(64),
      python: 'python3',
      methods: [],
      modalities: [],
      precisions: [],
      reason: 'Verified local training libraries are incomplete.',
    });

    const status = await installLocalTrainingWorker({ native: true, invoke });

    expect(invoke).toHaveBeenCalledWith('model_foundry_install_training_worker');
    expect(status.installed).toBe(true);
    expect(status.attested).toBe(true);
    expect(status.reason).toMatch(/libraries are incomplete/i);
  });
});
