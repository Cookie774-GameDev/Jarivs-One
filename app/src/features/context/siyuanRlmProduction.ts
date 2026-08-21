import { SIYUAN_CONTEXT_VAULT_ENABLED } from './siyuan/siyuanContracts';
import {
  createSiyuanNativeBridge,
  type SiyuanNativeBridge,
  type SiyuanNativeInvoker,
} from './siyuan/siyuanNativeBridge';
import type { SiyuanRlmPort } from './siyuanRlmRepository';

export const SIYUAN_MANAGED_NOTEBOOK_NAME = 'VibeSpace Project Vault';

export interface SiyuanManagedDocument {
  id: string;
  notebookId: string;
  path: string;
  markdown: string;
}

export interface SiyuanManagedDocumentLookup {
  query: string;
  marker: string;
}

export interface ProductionSiyuanRlmPort extends SiyuanRlmPort {
  readManagedDocument(
    projectId: string,
    lookup: SiyuanManagedDocumentLookup,
  ): Promise<SiyuanManagedDocument | null>;
  createManagedDocument(
    projectId: string,
    path: string,
    markdown: string,
  ): Promise<SiyuanManagedDocument>;
  updateManagedDocument(
    projectId: string,
    id: string,
    expectedMarkdown: string,
    markdown: string,
  ): Promise<SiyuanManagedDocument>;
  deleteManagedDocument(projectId: string, id: string, expectedMarkdown: string): Promise<void>;
  createManagedSnapshot(projectId: string, memo: string): Promise<void>;
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

function isTransportUnavailable(error: unknown): boolean {
  return (
    error === 'siyuan_transport_unavailable' ||
    (error instanceof Error && error.message === 'siyuan_transport_unavailable')
  );
}

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
      try {
        return await operation(bridge);
      } catch (error) {
        if (
          !isTransportUnavailable(error) ||
          activeProjectId !== projectId ||
          activeBridge !== bridge
        ) {
          throw error;
        }
        const replacement = createBridge(projectId);
        await replacement.start();
        activeProjectId = projectId;
        activeBridge = replacement;
        return operation(replacement);
      }
    });
    operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const exactNotebook = async (bridge: SiyuanNativeBridge, create: boolean) => {
    const matches = (await bridge.listNotebooks()).filter(
      (notebook) => notebook.name === SIYUAN_MANAGED_NOTEBOOK_NAME && !notebook.closed,
    );
    if (matches.length > 1) throw new Error('siyuan_managed_notebook_ambiguous');
    if (matches[0]) return matches[0];
    if (!create) return null;
    const notebook = await bridge.createNotebook(SIYUAN_MANAGED_NOTEBOOK_NAME);
    if (notebook.name !== SIYUAN_MANAGED_NOTEBOOK_NAME || notebook.closed) {
      throw new Error('siyuan_managed_notebook_invalid');
    }
    return notebook;
  };

  const port: ProductionSiyuanRlmPort = {
    searchBlocks(projectId: string, query: string, limit: number) {
      return enqueue(projectId, (bridge) => bridge.searchBlocks(query, limit));
    },
    getBlock(projectId: string, id: string) {
      return enqueue(projectId, (bridge) => bridge.getBlock(id));
    },
    readManagedDocument(projectId, lookup) {
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, false);
        if (!notebook) return null;
        const summaries = await bridge.searchBlocks(lookup.query, 50);
        const ids = [
          ...new Set(
            summaries.filter((block) => block.notebookId === notebook.id).map((block) => block.id),
          ),
        ];
        const candidates: SiyuanManagedDocument[] = [];
        for (const id of ids) {
          const block = await bridge.getBlock(id);
          if (block.notebookId === notebook.id && block.markdown.includes(lookup.marker)) {
            candidates.push(block);
          }
        }
        if (candidates.length > 1) throw new Error('siyuan_managed_document_ambiguous');
        return candidates[0] ?? null;
      });
    },
    createManagedDocument(projectId, path, markdown) {
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, true);
        if (!notebook) throw new Error('siyuan_managed_notebook_unavailable');
        const mutation = await bridge.createDocument(notebook.id, path, markdown);
        const document = await bridge.getBlock(mutation.id);
        if (document.notebookId !== notebook.id) {
          throw new Error('siyuan_managed_document_authority_invalid');
        }
        return document;
      });
    },
    updateManagedDocument(projectId, id, expectedMarkdown, markdown) {
      return enqueue(projectId, async (bridge) => {
        await bridge.updateBlock(id, expectedMarkdown, markdown);
        const document = await bridge.getBlock(id);
        if (document.id !== id) throw new Error('siyuan_managed_document_authority_invalid');
        return document;
      });
    },
    deleteManagedDocument(projectId, id, expectedMarkdown) {
      return enqueue(projectId, async (bridge) => {
        await bridge.deleteBlock(id, expectedMarkdown);
      });
    },
    createManagedSnapshot(projectId, memo) {
      return enqueue(projectId, async (bridge) => {
        await bridge.createSnapshot(memo);
      });
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

let sharedProductionPort: ProductionSiyuanRlmPort | undefined;

export function getProductionSiyuanRlmPort(): ProductionSiyuanRlmPort {
  sharedProductionPort ??= createProductionSiyuanRlmPort();
  return sharedProductionPort;
}
