import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { FILE_ACTIONS } from './registryFiles';

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
  ...(await vi.importActual<typeof import('@/features/files/projectFiles')>('@/features/files/projectFiles')),
  getStoredProjectRoot: vi.fn(() => 'C:\\Projects\\FarmLife'),
  getJarvisRootDir: vi.fn(async () => 'C:\\Users\\viper\\AppData\\Roaming\\VibeSpace'),
  getJarvisProjectsDir: vi.fn(async () => 'C:\\Users\\viper\\AppData\\Roaming\\VibeSpace\\Projects'),
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
    const result = await action.run({
      path: 'C:\\Projects\\FarmLife\\dogs.md',
      root: 'C:\\Projects\\FarmLife',
      content: '# Dogs',
    }, { source: 'ai' });
    expect(result.ok).toBe(true);
    expect(fsMocks.createTextFileWithContent).toHaveBeenCalledWith(
      'C:\\Projects\\FarmLife\\dogs.md', '# Dogs', { root: 'C:\\Projects\\FarmLife' },
    );
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('surfaces a collision and never redirects content', async () => {
    fsMocks.createTextFileWithContent.mockResolvedValue({
      ok: false, path: 'dogs.md', error: { code: 'already_exists' },
    });
    const action = FILE_ACTIONS.find((item) => item.id === 'files.create')!;
    const result = await action.run({
      path: 'C:\\Projects\\FarmLife\\dogs.md', root: 'C:\\Projects\\FarmLife', content: 'new',
    }, { source: 'ai' });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/already exists/i) });
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('rejects paths outside the active or default project root', async () => {
    const action = FILE_ACTIONS.find((item) => item.id === 'files.create')!;
    const result = await action.run({
      path: 'C:\\Windows\\dogs.md', root: 'C:\\Projects\\FarmLife', content: 'no',
    }, { source: 'ai' });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/outside/i) });
    expect(fsMocks.createTextFileWithContent).not.toHaveBeenCalled();
  });

  it('requires an existing file before edit writes', async () => {
    fsMocks.readTextFile.mockResolvedValue({
      ok: false, path: 'missing.md', error: { code: 'not_found' },
    });
    const action = FILE_ACTIONS.find((item) => item.id === 'files.edit')!;
    const result = await action.run({
      path: 'C:\\Projects\\FarmLife\\missing.md', root: 'C:\\Projects\\FarmLife', content: 'new',
    }, { source: 'ai' });
    expect(result.ok).toBe(false);
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
  });
});
