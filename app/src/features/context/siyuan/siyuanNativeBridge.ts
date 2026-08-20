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
  version(): Promise<SiyuanVersion>;
  listNotebooks(): Promise<SiyuanNotebook[]>;
  searchBlocks(query: string, limit?: number): Promise<SiyuanBlockSummary[]>;
  getBlock(id: string): Promise<SiyuanBlock>;
}

interface SiyuanNativeBridgeOptions {
  /** Test-only seam until the checked-in feature gate and native commands are integrated. */
  featureEnabled?: boolean;
}

const DISABLED_STATUS: SiyuanStatus = Object.freeze({
  featureEnabled: false,
  runtimeBundled: false,
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

  return Object.freeze({
    async status() {
      if (!featureEnabled) return DISABLED_STATUS;
      return parseSiyuanStatus(await invokeNative(SIYUAN_NATIVE_COMMANDS.status));
    },

    async version() {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanVersion(await invokeNative(SIYUAN_NATIVE_COMMANDS.version));
    },

    async listNotebooks() {
      if (!featureEnabled) return featureDisabled();
      return parseSiyuanNotebooks(await invokeNative(SIYUAN_NATIVE_COMMANDS.listNotebooks));
    },

    async searchBlocks(query: string, limit = 25) {
      if (!featureEnabled) return featureDisabled();
      const validatedQuery = assertSiyuanQuery(query);
      const validatedLimit = assertSiyuanSearchLimit(limit);
      return parseSiyuanSearchResults(
        await invokeNative(SIYUAN_NATIVE_COMMANDS.searchBlocks, {
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
        await invokeNative(SIYUAN_NATIVE_COMMANDS.getBlock, { id: validatedId }),
      );
    },
  });
}
