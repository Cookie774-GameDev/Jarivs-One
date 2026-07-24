import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import type { CanonicalFileActionEvidence } from '@/lib/jarvis/artifactProducerAdapters';
import { FILE_ACTIONS, isCanonicalFileArtifactResult } from './registryFiles';

const fsMocks = vi.hoisted(() => ({
  createDirectory: vi.fn(),
  createTextFileWithContent: vi.fn(),
  readTextFile: vi.fn(),
  readTextFileSample: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@/lib/fs', async () => ({
  ...(await vi.importActual<typeof import('@/lib/fs')>('@/lib/fs')),
  ...fsMocks,
}));

vi.mock('@/features/files/projectFiles', async () => ({
  ...(await vi.importActual<typeof import('@/features/files/projectFiles')>(
    '@/features/files/projectFiles',
  )),
  getStoredProjectRoot: vi.fn(() => 'C:\\Projects\\FarmLife'),
  getJarvisRootDir: vi.fn(async () => 'C:\\Users\\viper\\AppData\\Roaming\\VibeSpace'),
  getJarvisProjectsDir: vi.fn(
    async () => 'C:\\Users\\viper\\AppData\\Roaming\\VibeSpace\\Projects',
  ),
}));

describe('project file actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ projectId: 'project_1' as never });
    fsMocks.createDirectory.mockResolvedValue({ ok: true, path: 'ok' });
    fsMocks.createTextFileWithContent.mockResolvedValue({ ok: true, path: 'ok' });
    fsMocks.readTextFile.mockResolvedValue({ ok: true, path: 'ok', content: 'old' });
    fsMocks.readTextFileSample.mockResolvedValue({ ok: true, path: 'ok', content: 'sample' });
    fsMocks.writeTextFile.mockResolvedValue({ ok: true, path: 'ok' });
  });

  it('creates new content atomically without an overwrite call', async () => {
    const action = FILE_ACTIONS.find((item) => item.id === 'files.create')!;
    const result = await action.run(
      {
        path: 'C:\\Projects\\FarmLife\\dogs.md',
        root: 'C:\\Projects\\FarmLife',
        content: '# Dogs',
      },
      { source: 'ai' },
    );
    expect(result.ok).toBe(true);
    expect(fsMocks.createTextFileWithContent).toHaveBeenCalledWith(
      'C:\\Projects\\FarmLife\\dogs.md',
      '# Dogs',
      { root: 'C:\\Projects\\FarmLife' },
    );
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('surfaces a collision and never redirects content', async () => {
    fsMocks.createTextFileWithContent.mockResolvedValue({
      ok: false,
      path: 'dogs.md',
      error: { code: 'already_exists' },
    });
    const action = FILE_ACTIONS.find((item) => item.id === 'files.create')!;
    const result = await action.run(
      {
        path: 'C:\\Projects\\FarmLife\\dogs.md',
        root: 'C:\\Projects\\FarmLife',
        content: 'new',
      },
      { source: 'ai' },
    );
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/already exists/i) });
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('rejects paths outside the active or default project root', async () => {
    const action = FILE_ACTIONS.find((item) => item.id === 'files.create')!;
    const result = await action.run(
      {
        path: 'C:\\Windows\\dogs.md',
        root: 'C:\\Projects\\FarmLife',
        content: 'no',
      },
      { source: 'ai' },
    );
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/outside/i) });
    expect(fsMocks.createTextFileWithContent).not.toHaveBeenCalled();
  });

  it('normalizes safe dot segments but rejects traversal before any filesystem call', async () => {
    const action = FILE_ACTIONS.find((item) => item.id === 'files.create')!;
    const safe = await action.run(
      {
        path: 'C:/Projects/FarmLife/docs/../dogs.md',
        root: 'c:\\projects\\FarmLife\\.',
        content: 'safe',
      },
      { source: 'ai' },
    );
    expect(safe.ok).toBe(true);
    expect(fsMocks.createTextFileWithContent).toHaveBeenCalledWith(
      'C:\\Projects\\FarmLife\\dogs.md',
      'safe',
      { root: 'C:\\projects\\FarmLife' },
    );

    vi.clearAllMocks();
    const escaped = await action.run(
      {
        path: 'C:\\Projects\\FarmLife\\..\\private\\dogs.md',
        root: 'C:\\Projects\\FarmLife',
        content: 'blocked',
      },
      { source: 'ai' },
    );
    expect(escaped).toEqual({ ok: false, error: expect.stringMatching(/outside|invalid/i) });
    expect(fsMocks.createDirectory).not.toHaveBeenCalled();
    expect(fsMocks.createTextFileWithContent).not.toHaveBeenCalled();

    const rootedRelative = await action.run(
      {
        path: '\\Projects\\FarmLife\\dogs.md',
        root: 'C:\\Projects\\FarmLife',
        content: 'blocked',
      },
      { source: 'ai' },
    );
    expect(rootedRelative).toEqual({
      ok: false,
      error: expect.stringMatching(/absolute|invalid/i),
    });
    expect(fsMocks.createDirectory).not.toHaveBeenCalled();
    expect(fsMocks.createTextFileWithContent).not.toHaveBeenCalled();
  });

  it('requires an existing file before edit writes', async () => {
    fsMocks.readTextFile.mockResolvedValue({
      ok: false,
      path: 'missing.md',
      error: { code: 'not_found' },
    });
    const action = FILE_ACTIONS.find((item) => item.id === 'files.edit')!;
    const result = await action.run(
      {
        path: 'C:\\Projects\\FarmLife\\missing.md',
        root: 'C:\\Projects\\FarmLife',
        content: 'new',
      },
      { source: 'ai' },
    );
    expect(result.ok).toBe(false);
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
  });
});

describe('canonical file artifact result truth', () => {
  const evidence = Object.freeze({
    producerId: 'file_action_result',
    accountId: 'account-file',
    runId: 'jrun_file',
    requestId: 'jrequest_file',
    attemptNumber: 1,
    resultRef: 'jresult_file',
    state: 'succeeded',
    verifiedAt: 1_786_202_100_000,
    actionId: 'files.create',
    actionVersion: 1,
  }) satisfies CanonicalFileActionEvidence;

  it('accepts only persisted create, edit, read, and explicit partial results', () => {
    expect(
      isCanonicalFileArtifactResult(evidence, {
        ok: true,
        summary: 'Created.',
        data: { path: 'C:\\Projects\\FarmLife\\created.md', operation: 'create' },
      }),
    ).toBe(true);
    expect(
      isCanonicalFileArtifactResult(Object.freeze({ ...evidence, actionId: 'files.edit' }), {
        ok: true,
        summary: 'Updated.',
        data: { path: 'C:\\Projects\\FarmLife\\updated.md', operation: 'edit' },
      }),
    ).toBe(true);
    expect(
      isCanonicalFileArtifactResult(Object.freeze({ ...evidence, actionId: 'files.read' }), {
        ok: true,
        summary: 'Read.',
        data: { path: 'C:\\Projects\\FarmLife\\read.md', content: 'verified bytes' },
      }),
    ).toBe(true);
    expect(
      isCanonicalFileArtifactResult(Object.freeze({ ...evidence, state: 'partial' }), {
        ok: true,
        summary: 'Partial.',
        data: { partial: true, blobKey: 'blob-file-part-1' },
      }),
    ).toBe(true);
  });

  it('rejects proposals, requests, mismatched operations, and failed action results', () => {
    for (const result of [
      { ok: true as const, summary: 'Proposed.', data: { proposedPath: 'future.md' } },
      { ok: true as const, summary: 'Requested.', data: { requestedPath: 'future.md' } },
      {
        ok: true as const,
        summary: 'Wrong operation.',
        data: { path: 'created.md', operation: 'edit' },
      },
      { ok: false as const, error: 'write failed' },
    ]) {
      expect(isCanonicalFileArtifactResult(evidence, result)).toBe(false);
    }
  });
});
