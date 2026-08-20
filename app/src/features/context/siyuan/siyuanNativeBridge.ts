import {
  SIYUAN_CONTEXT_VAULT_ENABLED,
  SIYUAN_NATIVE_COMMANDS,
  SiyuanContractError,
  assertSiyuanIdentifier,
  assertSiyuanQuery,
  assertSiyuanSearchLimit,
  parseSiyuanBlock,
  parseSiyuanNotebooks,
  parseSiyuanSearchResults,
  parseSiyuanStatus,
  parseSiyuanVersion,
  type SiyuanBlock,
  type SiyuanBlockSummary,
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
  searchBlocks(query: string, limit?: number): Promise<SiyuanBlockSummary[]>;
  getBlock(id: string): Promise<SiyuanBlock>;
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
  });
}
