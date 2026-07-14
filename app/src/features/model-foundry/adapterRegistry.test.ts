import { describe, expect, it } from 'vitest';
import { LocalAdapterRegistry } from './adapterRegistry';
import { InMemoryStorageAdapter } from './localRepository';

describe('LocalAdapterRegistry', () => {
  it('persists only verified adapter metadata and archives without deleting provenance', () => {
    const registry = new LocalAdapterRegistry(new InMemoryStorageAdapter(), () => '2026-07-14T00:00:00.000Z');
    registry.upsert('project-1', 'job-1', {
      projectId: 'project-1', jobId: 'job-1', manifestSha256: 'a'.repeat(64), adapterFiles: { 'adapter_model.safetensors': 'b'.repeat(64) }, metrics: { eval_loss: 0.25 }, trainingConfig: { method: 'lora' },
    });
    expect(registry.list('project-1')).toMatchObject([{ jobId: 'job-1', status: 'candidate', adapterFileCount: 1 }]);
    expect(registry.archive('project-1', 'job-1')).toMatchObject([{ jobId: 'job-1', status: 'archived' }]);
  });
});
