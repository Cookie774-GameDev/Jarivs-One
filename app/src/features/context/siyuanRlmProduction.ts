import { SIYUAN_CONTEXT_VAULT_ENABLED } from './siyuan/siyuanContracts';
import {
  createSiyuanNativeBridge,
  type SiyuanNativeBridge,
  type SiyuanNativeInvoker,
} from './siyuan/siyuanNativeBridge';
import type { SiyuanRlmPort } from './siyuanRlmRepository';

export interface ProductionSiyuanRlmPort extends SiyuanRlmPort {
  stopActive(): Promise<void>;
}

interface ProductionSiyuanRlmPortOptions {
  featureEnabled?: boolean;
  createBridge?: (projectId: string) => SiyuanNativeBridge;
}

const invokeNative: SiyuanNativeInvoker = async (command, argumentsValue) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, argumentsValue);
};

export function createProductionSiyuanRlmPort(
  options: ProductionSiyuanRlmPortOptions = {},
): ProductionSiyuanRlmPort {
  const featureEnabled = options.featureEnabled ?? SIYUAN_CONTEXT_VAULT_ENABLED;
  const createBridge =
    options.createBridge ??
    ((projectId: string) =>
      createSiyuanNativeBridge(invokeNative, {
        featureEnabled,
        projectId,
      }));
  let activeProjectId: string | undefined;
  let activeBridge: SiyuanNativeBridge | undefined;
  let operationQueue: Promise<void> = Promise.resolve();

  const enqueue = <Result>(
    projectId: string,
    operation: (bridge: SiyuanNativeBridge) => Promise<Result>,
  ): Promise<Result> => {
    const run = operationQueue.then(async () => {
      if (activeProjectId !== projectId || !activeBridge) {
        if (activeBridge && activeProjectId) await activeBridge.stop();
        const bridge = createBridge(projectId);
        await bridge.start();
        activeProjectId = projectId;
        activeBridge = bridge;
      }
      const bridge = activeBridge;
      if (!bridge) throw new Error('siyuan_runtime_not_ready');
      return operation(bridge);
    });
    operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const port: ProductionSiyuanRlmPort = {
    searchBlocks(projectId: string, query: string, limit: number) {
      return enqueue(projectId, (bridge) => bridge.searchBlocks(query, limit));
    },
    getBlock(projectId: string, id: string) {
      return enqueue(projectId, (bridge) => bridge.getBlock(id));
    },
    async stopActive() {
      const run = operationQueue.then(async () => {
        if (!activeBridge || !activeProjectId) return;
        const bridge = activeBridge;
        activeBridge = undefined;
        activeProjectId = undefined;
        await bridge.stop();
      });
      operationQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  return Object.freeze(port);
}
