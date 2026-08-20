import { describe, expect, it, vi } from 'vitest';
import { SIYUAN_NATIVE_COMMANDS } from './siyuanContracts';
import { createSiyuanNativeBridge, type SiyuanNativeInvoker } from './siyuanNativeBridge';

describe('SiYuan native bridge boundary', () => {
  it('never invokes native commands while the feature is disabled', async () => {
    const invokeNative = vi.fn<SiyuanNativeInvoker>();
    const bridge = createSiyuanNativeBridge(invokeNative);

    await expect(bridge.status()).resolves.toEqual({
      featureEnabled: false,
      runtimeBundled: true,
      state: 'disabled',
    });
    await expect(bridge.start()).rejects.toThrow(/siyuan_feature_disabled/u);
    await expect(bridge.stop()).rejects.toThrow(/siyuan_feature_disabled/u);
    await expect(bridge.version()).rejects.toThrow(/siyuan_feature_disabled/u);
    await expect(bridge.listNotebooks()).rejects.toThrow(/siyuan_feature_disabled/u);
    await expect(bridge.searchBlocks('spec')).rejects.toThrow(/siyuan_feature_disabled/u);
    await expect(bridge.getBlock('block-1')).rejects.toThrow(/siyuan_feature_disabled/u);
    expect(invokeNative).not.toHaveBeenCalled();
  });

  it('uses an explicit typed command and bounded arguments in the test seam', async () => {
    const invokeNative = vi.fn<SiyuanNativeInvoker>().mockResolvedValue({
      blocks: [
        {
          id: 'block-1',
          notebookId: 'notebook-1',
          path: '/spec',
          content: 'Pinned runtime',
        },
      ],
    });
    const bridge = createSiyuanNativeBridge(invokeNative, {
      featureEnabled: true,
      projectId: 'project-1',
    });

    await expect(bridge.searchBlocks('pinned', 10)).resolves.toEqual([
      expect.objectContaining({ id: 'block-1', content: 'Pinned runtime' }),
    ]);
    expect(invokeNative).toHaveBeenCalledExactlyOnceWith(SIYUAN_NATIVE_COMMANDS.searchBlocks, {
      projectId: 'project-1',
      query: 'pinned',
      limit: 10,
    });
  });

  it('validates requests before invoking native code', async () => {
    const invokeNative = vi.fn<SiyuanNativeInvoker>();
    const bridge = createSiyuanNativeBridge(invokeNative, {
      featureEnabled: true,
      projectId: 'project-1',
    });

    await expect(bridge.searchBlocks('', 25)).rejects.toThrow(/siyuan_query_invalid/u);
    await expect(bridge.searchBlocks('valid', 101)).rejects.toThrow(/siyuan_limit_invalid/u);
    await expect(bridge.getBlock('../secret')).rejects.toThrow(/siyuan_block_id_invalid/u);
    expect(invokeNative).not.toHaveBeenCalled();
  });

  it('requires a valid project authority before every operational command', async () => {
    const invokeNative = vi.fn<SiyuanNativeInvoker>();
    const missing = createSiyuanNativeBridge(invokeNative, { featureEnabled: true });
    const traversal = createSiyuanNativeBridge(invokeNative, {
      featureEnabled: true,
      projectId: '../other-project',
    });

    await expect(missing.start()).rejects.toThrow(/siyuan_project_id_invalid/u);
    await expect(traversal.listNotebooks()).rejects.toThrow(/siyuan_project_id_invalid/u);
    expect(invokeNative).not.toHaveBeenCalled();
  });

  it('uses project-scoped typed start and stop commands', async () => {
    const invokeNative = vi
      .fn<SiyuanNativeInvoker>()
      .mockResolvedValueOnce({
        featureEnabled: true,
        runtimeBundled: true,
        state: 'ready',
      })
      .mockResolvedValueOnce({
        featureEnabled: true,
        runtimeBundled: true,
        state: 'stopped',
      });
    const bridge = createSiyuanNativeBridge(invokeNative, {
      featureEnabled: true,
      projectId: 'project-1',
    });

    await expect(bridge.start()).resolves.toMatchObject({ state: 'ready' });
    await expect(bridge.stop()).resolves.toMatchObject({ state: 'stopped' });
    expect(invokeNative).toHaveBeenNthCalledWith(1, SIYUAN_NATIVE_COMMANDS.start, {
      projectId: 'project-1',
    });
    expect(invokeNative).toHaveBeenNthCalledWith(2, SIYUAN_NATIVE_COMMANDS.stop, {
      projectId: 'project-1',
    });
  });

  it('rejects token-bearing native responses', async () => {
    const invokeNative = vi.fn<SiyuanNativeInvoker>().mockResolvedValue({
      featureEnabled: true,
      runtimeBundled: true,
      state: 'ready',
      token: 'native-secret',
    });
    const bridge = createSiyuanNativeBridge(invokeNative, {
      featureEnabled: true,
      projectId: 'project-1',
    });

    await expect(bridge.status()).rejects.toThrow(/siyuan_status_keys_invalid/u);
  });
});
