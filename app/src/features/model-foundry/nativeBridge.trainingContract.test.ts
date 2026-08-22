import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('../../lib/utils', () => ({ isTauri: true }));

import { startFoundryTraining, type FoundryNativeTrainingRequest } from './nativeBridge';

describe('Model Foundry TrainingRequestV2 bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ id: 'job_native_1' });
  });

  it('commits the approved train and validation splits with every supported setting', async () => {
    const request: FoundryNativeTrainingRequest = {
      projectId: 'project-1',
      jobId: 'requested-job',
      modelId: 'smollm2-135m-instruct',
      datasetVersionId: 'dataset-v3',
      datasetManifestHash: 'a'.repeat(64),
      datasetFingerprint: 'b'.repeat(64),
      datasetApproved: true,
      trainExamples: [{ prompt: 'Train prompt', completion: 'Train completion' }],
      validationExamples: [{ prompt: 'Validation prompt', completion: 'Validation completion' }],
      trainingConfig: {
        method: 'lora',
        seed: 23,
        epochs: 3,
        maxSteps: 77,
        batchSize: 2,
        gradientAccumulation: 8,
        maxSequenceLength: 1024,
        learningRate: 0.00008,
        loraRank: 32,
        loraAlpha: 64,
        loraDropout: 0.1,
      },
      targetModules: ['q_proj', 'v_proj'],
    };

    await startFoundryTraining(request);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('model_foundry_start_training', {
      request: expect.objectContaining({
        schemaVersion: 2,
        datasetVersionId: 'dataset-v3',
        datasetJsonl: JSON.stringify({ prompt: 'Train prompt', completion: 'Train completion' }),
        validationDatasetJsonl: JSON.stringify({
          prompt: 'Validation prompt',
          completion: 'Validation completion',
        }),
        trainingConfig: request.trainingConfig,
        targetModules: ['q_proj', 'v_proj'],
      }),
    });
  });

  it('refuses an empty validation split instead of training without evaluation truth', async () => {
    const request = {
      projectId: 'project-1',
      jobId: 'requested-job',
      modelId: 'smollm2-135m-instruct',
      datasetVersionId: 'dataset-v3',
      datasetManifestHash: 'a'.repeat(64),
      datasetFingerprint: 'b'.repeat(64),
      datasetApproved: true,
      trainExamples: [{ prompt: 'Train prompt', completion: 'Train completion' }],
      validationExamples: [],
      trainingConfig: {
        method: 'lora' as const,
        seed: 23,
        epochs: 3,
        batchSize: 2,
        gradientAccumulation: 8,
        maxSequenceLength: 1024,
        learningRate: 0.00008,
        loraRank: 32,
        loraAlpha: 64,
        loraDropout: 0.1,
      },
    };

    await expect(startFoundryTraining(request)).rejects.toThrow(/validation/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
