import {
  SIYUAN_CONTEXT_VAULT_ENABLED,
  SIYUAN_NATIVE_COMMANDS,
  SiyuanContractError,
  assertSiyuanAppendBlockInputs,
  assertSiyuanDocumentPath,
  assertSiyuanIdentifier,
  assertSiyuanMarkdown,
  assertSiyuanNotebookName,
  assertSiyuanQuery,
  assertSiyuanSearchLimit,
  assertSiyuanSnapshotMemo,
  parseSiyuanBlock,
  parseSiyuanBatchAppendBlocks,
  parseSiyuanBlockRelationIds,
  parseSiyuanDocumentMutation,
  parseSiyuanMutationResult,
  parseSiyuanNotebook,
  parseSiyuanNotebooks,
  parseSiyuanSearchResults,
  parseSiyuanStatus,
  parseSiyuanVersion,
  type SiyuanBlock,
  type SiyuanBlockSummary,
  type SiyuanAppendBlockInput,
  type SiyuanDocumentMutation,
  type SiyuanMutationResult,
  type SiyuanNotebook,
  type SiyuanStatus,
  type SiyuanVersion,
} from './siyuanContracts';

export type SiyuanNativeInvoker = (
  command: string,
  argumentsValue?: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export interface SiyuanNativeBridge {
  status(): Promise<SiyuanStatus>;
  start(): Promise<SiyuanStatus>;
  stop(): Promise<SiyuanStatus>;
  version(): Promise<SiyuanVersion>;
  listNotebooks(): Promise<SiyuanNotebook[]>;
  createNotebook(name: string): Promise<SiyuanNotebook>;
  searchBlocks(query: string, limit?: number): Promise<SiyuanBlockSummary[]>;
  getBlock(id: string): Promise<SiyuanBlock>;
  listInboundBacklinks(id: string): Promise<string[]>;
  createDocument(
    notebookId: string,
    path: string,
    markdown: string,
  ): Promise<SiyuanDocumentMutation>;
  createDocumentUnderParent(
    notebookId: string,
    mapRootId: string,
    parentId: string,
    stagingPath: string,
    markdown: string,
    marker: string,
  ): Promise<SiyuanDocumentMutation>;
  batchAppendBlocks(
    notebookId: string,
    mapRootId: string,
    blocks: readonly SiyuanAppendBlockInput[],
  ): Promise<string[]>;
  updateBlock(
    mapRootId: string,
    id: string,
    expectedMarkdown: string,
    markdown: string,
  ): Promise<SiyuanMutationResult>;
  deleteBlock(
    mapRootId: string,
    id: string,
    expectedMarkdown: string,
  ): Promise<SiyuanMutationResult>;
  createDailyNote(notebookId: string): Promise<SiyuanDocumentMutation>;
  createSnapshot(memo: string): Promise<SiyuanMutationResult>;
}

interface SiyuanNativeBridgeOptions {
  /** Test-only seam until the checked-in feature gate and native commands are integrated. */
  featureEnabled?: boolean;
  /** Opaque VibeSpace project authority attached to every operational command. */
  projectId?: string;
}

const DISABLED_STATUS: SiyuanStatus = Object.freeze({
  featureEnabled: false,
  runtimeBundled: true,
  state: 'disabled',
});

function featureDisabled(): never {
  throw new SiyuanContractError('siyuan_feature_disabled');
}

export function createSiyuanNativeBridge(
  invokeNative: SiyuanNativeInvoker,
  options: SiyuanNativeBridgeOptions = {},
): SiyuanNativeBridge {
  const featureEnabled = options.featureEnabled ?? SIYUAN_CONTEXT_VAULT_ENABLED;
  const projectArguments = (): Readonly<{ projectId: string }> => ({
    projectId: assertSiyuanIdentifier(options.projectId, 'siyuan_project_id_invalid'),
  });

  return Object.freeze({
    async status() {
      if (!featureEnabled) return DISABLED_STATUS;
      return parseSiyuanStatus(await invokeNative(SIYUAN_NATIVE_COMMANDS.status));
    },

    async start() {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanStatus(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.start, projectArguments()),
      );
    },

    async stop() {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanStatus(await invokeNative(SIYUAN_NATIVE_COMMANDS.stop, projectArguments()));
    },

    async version() {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanVersion(await invokeNative(SIYUAN_NATIVE_COMMANDS.version));
    },

    async listNotebooks() {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanNotebooks(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.listNotebooks, projectArguments()),
      );
    },

    async createNotebook(name: string) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanNotebook(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.createNotebook, {
          ...projectArguments(),
          name: assertSiyuanNotebookName(name),
        }),
      );
    },

    async searchBlocks(query: string, limit = 25) {
      if (!featureEnabled) return featureDisabled();
      const validatedQuery = assertSiyuanQuery(query);
      const validatedLimit = assertSiyuanSearchLimit(limit);
      return parseSiyuanSearchResults(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.searchBlocks, {
          ...projectArguments(),
          query: validatedQuery,
          limit: validatedLimit,
        }),
        validatedLimit,
      );
    },

    async getBlock(id: string) {
      if (!featureEnabled) return featureDisabled();
      const validatedId = assertSiyuanIdentifier(id, 'siyuan_block_id_invalid');
      return parseSiyuanBlock(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.getBlock, {
          ...projectArguments(),
          id: validatedId,
        }),
      );
    },

    async listInboundBacklinks(id: string) {
      if (!featureEnabled) return featureDisabled();
      const validatedId = assertSiyuanIdentifier(id, 'siyuan_block_id_invalid');
      return parseSiyuanBlockRelationIds(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.listInboundBacklinks, {
          ...projectArguments(),
          id: validatedId,
        }),
      );
    },

    async createDocument(notebookId: string, documentPath: string, markdown: string) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanDocumentMutation(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.createDocument, {
          ...projectArguments(),
          notebookId: assertSiyuanIdentifier(notebookId, 'siyuan_notebook_id_invalid'),
          path: assertSiyuanDocumentPath(documentPath),
          markdown: assertSiyuanMarkdown(markdown),
        }),
      );
    },

    async createDocumentUnderParent(
      notebookId: string,
      mapRootId: string,
      parentId: string,
      stagingPath: string,
      markdown: string,
      marker: string,
    ) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanDocumentMutation(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.createDocumentUnderParent, {
          ...projectArguments(),
          notebookId: assertSiyuanIdentifier(notebookId, 'siyuan_notebook_id_invalid'),
          mapRootId: assertSiyuanIdentifier(mapRootId, 'siyuan_map_root_id_invalid'),
          parentId: assertSiyuanIdentifier(parentId, 'siyuan_parent_id_invalid'),
          stagingPath: assertSiyuanDocumentPath(stagingPath),
          markdown: assertSiyuanMarkdown(markdown),
          marker: assertSiyuanQuery(marker),
        }),
      );
    },

    async batchAppendBlocks(
      notebookId: string,
      mapRootId: string,
      blocks: readonly SiyuanAppendBlockInput[],
    ) {
      if (!featureEnabled) return featureDisabled();
      const validatedBlocks = assertSiyuanAppendBlockInputs(blocks);
      return parseSiyuanBatchAppendBlocks(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.batchAppendBlocks, {
          ...projectArguments(),
          notebookId: assertSiyuanIdentifier(notebookId, 'siyuan_notebook_id_invalid'),
          mapRootId: assertSiyuanIdentifier(mapRootId, 'siyuan_map_root_id_invalid'),
          blocks: validatedBlocks,
        }),
        validatedBlocks.length,
      );
    },

    async updateBlock(mapRootId: string, id: string, expectedMarkdown: string, markdown: string) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanMutationResult(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.updateBlock, {
          ...projectArguments(),
          mapRootId: assertSiyuanIdentifier(mapRootId, 'siyuan_map_root_id_invalid'),
          id: assertSiyuanIdentifier(id, 'siyuan_block_id_invalid'),
          expectedMarkdown: assertSiyuanMarkdown(expectedMarkdown),
          markdown: assertSiyuanMarkdown(markdown),
        }),
      );
    },

    async deleteBlock(mapRootId: string, id: string, expectedMarkdown: string) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanMutationResult(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.deleteBlock, {
          ...projectArguments(),
          mapRootId: assertSiyuanIdentifier(mapRootId, 'siyuan_map_root_id_invalid'),
          id: assertSiyuanIdentifier(id, 'siyuan_block_id_invalid'),
          expectedMarkdown: assertSiyuanMarkdown(expectedMarkdown),
        }),
      );
    },

    async createDailyNote(notebookId: string) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanDocumentMutation(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.createDailyNote, {
          ...projectArguments(),
          notebookId: assertSiyuanIdentifier(notebookId, 'siyuan_notebook_id_invalid'),
        }),
      );
    },

    async createSnapshot(memo: string) {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanMutationResult(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.createSnapshot, {
          ...projectArguments(),
          memo: assertSiyuanSnapshotMemo(memo),
        }),
      );
    },
  });
}
