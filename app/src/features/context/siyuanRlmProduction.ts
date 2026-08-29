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

export interface SiyuanManagedDocumentCreateInput {
  path: string;
  markdown: string;
}

export interface SiyuanManagedDocumentCreateUnderParentInput extends SiyuanManagedDocumentCreateInput {
  parentId: string;
  marker: string;
}

export interface SiyuanManagedBlockAppendInput {
  parentId: string;
  markdown: string;
}

export type SiyuanManagedDocumentCreateResult =
  Readonly<{ ok: true; document: SiyuanManagedDocument }> | Readonly<{ ok: false; error: unknown }>;

const SIYUAN_MANAGED_CREATE_BATCH_LIMIT = 4;
const SIYUAN_DOCUMENT_ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function documentRootIdFromPath(path: string): string {
  if (!path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error('siyuan_managed_document_path_invalid');
  }
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('siyuan_managed_document_path_invalid');
  }
  const filename = segments.at(-1);
  const id = filename?.endsWith('.sy') ? filename.slice(0, -3) : '';
  if (!SIYUAN_DOCUMENT_ROOT_ID.test(id)) {
    throw new Error('siyuan_managed_document_path_invalid');
  }
  return id;
}

function documentBelongsToMapRoot(
  root: SiyuanManagedDocument,
  document: SiyuanManagedDocument,
): boolean {
  const rootStem = root.path.endsWith('.sy') ? root.path.slice(0, -3) : '';
  return (
    root.notebookId === document.notebookId &&
    rootStem.length > 0 &&
    document.path.startsWith(`${rootStem}/`) &&
    document.path.endsWith('.sy') &&
    !document.path.split('/').some((segment) => segment === '.' || segment === '..')
  );
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
  createManagedDocuments?(
    projectId: string,
    inputs: readonly SiyuanManagedDocumentCreateInput[],
  ): Promise<readonly SiyuanManagedDocumentCreateResult[]>;
  createManagedDocumentUnderParent?(
    projectId: string,
    mapRootId: string,
    input: SiyuanManagedDocumentCreateUnderParentInput,
  ): Promise<SiyuanManagedDocument>;
  createManagedDocumentsUnderParents?(
    projectId: string,
    mapRootId: string,
    inputs: readonly SiyuanManagedDocumentCreateUnderParentInput[],
  ): Promise<readonly SiyuanManagedDocumentCreateResult[]>;
  appendManagedBlocks?(
    projectId: string,
    mapRootId: string,
    inputs: readonly SiyuanManagedBlockAppendInput[],
  ): Promise<readonly string[]>;
  updateManagedDocument(
    projectId: string,
    id: string,
    expectedMarkdown: string,
    markdown: string,
    mapRootId?: string,
  ): Promise<SiyuanManagedDocument>;
  deleteManagedDocument(
    projectId: string,
    id: string,
    expectedMarkdown: string,
    mapRootId?: string,
  ): Promise<void>;
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
    listInboundBacklinks(projectId: string, id: string) {
      return enqueue(projectId, (bridge) => bridge.listInboundBacklinks(id));
    },
    readManagedDocument(projectId, lookup) {
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, false);
        if (!notebook) return null;
        const summaries = await bridge.searchBlocks(lookup.query, 50);
        const ids = [
          ...new Set(
            summaries
              .filter((block) => block.notebookId === notebook.id)
              .map((block) => documentRootIdFromPath(block.path)),
          ),
        ];
        const candidates: SiyuanManagedDocument[] = [];
        for (const id of ids) {
          const block = await bridge.getBlock(id);
          if (
            block.id === id &&
            block.notebookId === notebook.id &&
            documentRootIdFromPath(block.path) === id &&
            block.markdown.includes(lookup.marker)
          ) {
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
    createManagedDocuments(projectId, inputs) {
      if (inputs.length === 0 || inputs.length > SIYUAN_MANAGED_CREATE_BATCH_LIMIT) {
        return Promise.reject(new Error('siyuan_managed_document_batch_invalid'));
      }
      if (new Set(inputs.map((input) => input.path)).size !== inputs.length) {
        return Promise.reject(new Error('siyuan_managed_document_batch_duplicate'));
      }
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, true);
        if (!notebook) throw new Error('siyuan_managed_notebook_unavailable');
        const settled = await Promise.allSettled(
          inputs.map(async (input) => {
            const mutation = await bridge.createDocument(notebook.id, input.path, input.markdown);
            const document = await bridge.getBlock(mutation.id);
            if (document.notebookId !== notebook.id) {
              throw new Error('siyuan_managed_document_authority_invalid');
            }
            return document;
          }),
        );
        if (
          settled.every(
            (result) => result.status === 'rejected' && isTransportUnavailable(result.reason),
          )
        ) {
          throw (settled[0] as PromiseRejectedResult).reason;
        }
        return settled.map((result): SiyuanManagedDocumentCreateResult =>
          result.status === 'fulfilled'
            ? Object.freeze({ ok: true, document: result.value })
            : Object.freeze({ ok: false, error: result.reason }),
        );
      });
    },
    createManagedDocumentUnderParent(projectId, mapRootId, input) {
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, true);
        if (!notebook) throw new Error('siyuan_managed_notebook_unavailable');
        const root = await bridge.getBlock(mapRootId);
        if (root.id !== mapRootId || root.notebookId !== notebook.id) {
          throw new Error('siyuan_managed_document_authority_invalid');
        }
        const mutation = await bridge.createDocumentUnderParent(
          notebook.id,
          mapRootId,
          input.parentId,
          input.path,
          input.markdown,
          input.marker,
        );
        const document = await bridge.getBlock(mutation.id);
        if (!documentBelongsToMapRoot(root, document)) {
          throw new Error('siyuan_managed_document_authority_invalid');
        }
        return document;
      });
    },
    createManagedDocumentsUnderParents(projectId, mapRootId, inputs) {
      if (inputs.length === 0 || inputs.length > SIYUAN_MANAGED_CREATE_BATCH_LIMIT) {
        return Promise.reject(new Error('siyuan_managed_document_batch_invalid'));
      }
      if (new Set(inputs.map((input) => input.path)).size !== inputs.length) {
        return Promise.reject(new Error('siyuan_managed_document_batch_duplicate'));
      }
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, true);
        if (!notebook) throw new Error('siyuan_managed_notebook_unavailable');
        const root = await bridge.getBlock(mapRootId);
        if (root.id !== mapRootId || root.notebookId !== notebook.id) {
          throw new Error('siyuan_managed_document_authority_invalid');
        }
        const settled = await Promise.allSettled(
          inputs.map(async (input) => {
            const mutation = await bridge.createDocumentUnderParent(
              notebook.id,
              mapRootId,
              input.parentId,
              input.path,
              input.markdown,
              input.marker,
            );
            const document = await bridge.getBlock(mutation.id);
            if (!documentBelongsToMapRoot(root, document)) {
              throw new Error('siyuan_managed_document_authority_invalid');
            }
            return document;
          }),
        );
        if (
          settled.every(
            (result) => result.status === 'rejected' && isTransportUnavailable(result.reason),
          )
        ) {
          throw (settled[0] as PromiseRejectedResult).reason;
        }
        return settled.map((result): SiyuanManagedDocumentCreateResult =>
          result.status === 'fulfilled'
            ? Object.freeze({ ok: true, document: result.value })
            : Object.freeze({ ok: false, error: result.reason }),
        );
      });
    },
    appendManagedBlocks(projectId, mapRootId, inputs) {
      return enqueue(projectId, async (bridge) => {
        const notebook = await exactNotebook(bridge, true);
        if (!notebook) throw new Error('siyuan_managed_notebook_unavailable');
        return bridge.batchAppendBlocks(notebook.id, mapRootId, inputs);
      });
    },
    updateManagedDocument(projectId, id, expectedMarkdown, markdown, mapRootId = id) {
      return enqueue(projectId, async (bridge) => {
        await bridge.updateBlock(mapRootId, id, expectedMarkdown, markdown);
        const document = await bridge.getBlock(id);
        if (document.id !== id) throw new Error('siyuan_managed_document_authority_invalid');
        return document;
      });
    },
    deleteManagedDocument(projectId, id, expectedMarkdown, mapRootId = id) {
      return enqueue(projectId, async (bridge) => {
        await bridge.deleteBlock(mapRootId, id, expectedMarkdown);
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
