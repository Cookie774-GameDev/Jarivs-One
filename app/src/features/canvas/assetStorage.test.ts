import { describe, expect, it } from 'vitest';

import {
  CanvasAssetStorageError,
  createCanvasAssetStorage,
  type CanvasAssetBinaryPort,
  type CanvasAssetMetadataPort,
  type CanvasAssetQuotaAuthority,
  type CanvasAssetQuotaTicket,
  type CanvasStoredAsset,
  type CanvasStoredAssetScope,
  type CanvasAssetWriteOptions,
} from './assetStorage';

const scope: CanvasStoredAssetScope = Object.freeze({
  accountId: 'account-1',
  projectId: 'project-1',
  ownerId: 'owner-1',
});

const otherScope: CanvasStoredAssetScope = Object.freeze({
  accountId: 'account-2',
  projectId: 'project-1',
  ownerId: 'owner-1',
});

const MAIN_DIGEST = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
const THUMB_DIGEST = '06df4f7e1394f1c57cc6583fba4d8060a5a66f4f4771c14aeff6b9af8a28c9b3';

function scopeKey(value: CanvasStoredAssetScope): string {
  return `${value.accountId}/${value.projectId}/${value.ownerId}`;
}

class MemoryBinaryPort implements CanvasAssetBinaryPort {
  readonly values = new Map<string, Blob>();
  readonly calls: string[] = [];
  readonly leaseCalls: string[] = [];
  readonly maxAssetBytes = 50_000_000;
  private readonly leaseTails = new Map<string, Promise<void>>();

  constructor(
    readonly id: string,
    readonly capability: 'native' | 'browser' | 'server',
    readonly persistence: 'filesystem' | 'indexeddb' | 'remote',
    private readonly available = true,
  ) {}

  async isAvailable(): Promise<boolean> {
    this.calls.push(`available:${this.id}`);
    return this.available;
  }

  async withExclusiveLease<T>(
    valueScope: CanvasStoredAssetScope,
    storageKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${scopeKey(valueScope)}:${storageKey}`;
    this.leaseCalls.push(key);
    const previous = this.leaseTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.leaseTails.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.leaseTails.get(key) === current) this.leaseTails.delete(key);
    }
  }

  async has(valueScope: CanvasStoredAssetScope, storageKey: string): Promise<boolean> {
    this.calls.push(`has:${storageKey}`);
    return this.values.has(`${scopeKey(valueScope)}:${storageKey}`);
  }

  async write(
    valueScope: CanvasStoredAssetScope,
    storageKey: string,
    bytes: Blob,
    options: CanvasAssetWriteOptions,
  ): Promise<void> {
    this.calls.push(`write:${storageKey}:${options.quotaTicket?.id ?? 'local'}`);
    this.values.set(`${scopeKey(valueScope)}:${storageKey}`, bytes);
  }

  async read(valueScope: CanvasStoredAssetScope, storageKey: string): Promise<Blob | undefined> {
    this.calls.push(`read:${storageKey}`);
    return this.values.get(`${scopeKey(valueScope)}:${storageKey}`);
  }

  async remove(valueScope: CanvasStoredAssetScope, storageKey: string): Promise<void> {
    this.calls.push(`remove:${storageKey}`);
    this.values.delete(`${scopeKey(valueScope)}:${storageKey}`);
  }

  async list(valueScope: CanvasStoredAssetScope): Promise<readonly string[]> {
    const prefix = `${scopeKey(valueScope)}:`;
    return [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  seed(valueScope: CanvasStoredAssetScope, storageKey: string, bytes: Blob): void {
    this.values.set(`${scopeKey(valueScope)}:${storageKey}`, bytes);
  }
}

class MemoryMetadataPort implements CanvasAssetMetadataPort {
  readonly values = new Map<string, CanvasStoredAsset>();
  readonly leaseCalls: string[] = [];
  failNextPut = false;
  private readonly leaseTails = new Map<string, Promise<void>>();

  async withExclusiveLease<T>(
    valueScope: CanvasStoredAssetScope,
    assetId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${scopeKey(valueScope)}:${assetId}`;
    this.leaseCalls.push(key);
    const previous = this.leaseTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.leaseTails.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.leaseTails.get(key) === current) this.leaseTails.delete(key);
    }
  }

  async get(
    valueScope: CanvasStoredAssetScope,
    assetId: string,
  ): Promise<CanvasStoredAsset | undefined> {
    return this.values.get(`${scopeKey(valueScope)}:${assetId}`);
  }

  async put(valueScope: CanvasStoredAssetScope, asset: CanvasStoredAsset): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error('metadata unavailable');
    }
    this.values.set(`${scopeKey(valueScope)}:${asset.id}`, asset);
  }

  async remove(valueScope: CanvasStoredAssetScope, assetId: string): Promise<void> {
    this.values.delete(`${scopeKey(valueScope)}:${assetId}`);
  }

  async list(valueScope: CanvasStoredAssetScope): Promise<readonly CanvasStoredAsset[]> {
    const prefix = `${scopeKey(valueScope)}:`;
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
  }
}

class ExactQuotaAuthority implements CanvasAssetQuotaAuthority {
  readonly calls: string[] = [];

  async authorize(
    valueScope: CanvasStoredAssetScope,
    request: {
      readonly byteSize: number;
      readonly checksumSha256: string;
      readonly mimeType: string;
    },
  ): Promise<CanvasAssetQuotaTicket> {
    this.calls.push(`authorize:${request.checksumSha256}`);
    return Object.freeze({
      id: 'quota-1',
      accountId: valueScope.accountId,
      projectId: valueScope.projectId,
      ownerId: valueScope.ownerId,
      byteSize: request.byteSize,
      checksumSha256: request.checksumSha256,
      mimeType: request.mimeType,
      expiresAt: Date.now() + 60_000,
      proof: 'server-signed-proof',
    });
  }
}

function image(bytes = [1, 2, 3, 4]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

describe('canvas asset storage orchestration', () => {
  it('stores content by stable SHA-256 id in native storage before publishing frozen metadata', async () => {
    const native = new MemoryBinaryPort('native-fs', 'native', 'filesystem');
    const browser = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    const storage = createCanvasAssetStorage({
      binaryPorts: [browser, native],
      metadata,
    });

    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
    });

    expect(stored.id).toBe(`asset_${MAIN_DIGEST}`);
    expect(stored.checksum).toEqual({ algorithm: 'sha-256', digest: MAIN_DIGEST });
    expect(stored.storage.capability).toBe('native');
    expect(stored.storage.portId).toBe('native-fs');
    expect(native.calls.some((call) => call.startsWith('write:'))).toBe(true);
    expect(browser.calls.some((call) => call.startsWith('write:'))).toBe(false);
    expect(await metadata.get(scope, stored.id)).toEqual(stored);
    expect(metadata.leaseCalls).toEqual([`${scopeKey(scope)}:${stored.id}`]);
    expect(native.leaseCalls).toContain(`${scopeKey(scope)}:${stored.storage.storageKey}`);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.scope)).toBe(true);
    expect(Object.isFrozen(stored.storage)).toBe(true);
    expect(JSON.stringify(stored)).not.toContain('base64');
  });

  it('falls back to browser persistence and rejects localStorage-like or unavailable storage', async () => {
    const unavailableNative = new MemoryBinaryPort('native-fs', 'native', 'filesystem', false);
    const browser = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const storage = createCanvasAssetStorage({
      binaryPorts: [browser, unavailableNative],
      metadata: new MemoryMetadataPort(),
    });

    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
    });
    expect(stored.storage.capability).toBe('browser');

    expect(() =>
      createCanvasAssetStorage({
        binaryPorts: [
          {
            ...browser,
            id: 'unsafe-local-storage',
            persistence: 'localStorage',
          } as unknown as CanvasAssetBinaryPort,
        ],
        metadata: new MemoryMetadataPort(),
      }),
    ).toThrow(/localStorage/i);
  });

  it('fails closed on invalid scope, MIME, size, and declared Blob metadata', async () => {
    const storage = createCanvasAssetStorage({
      binaryPorts: [new MemoryBinaryPort('browser-db', 'browser', 'indexeddb')],
      metadata: new MemoryMetadataPort(),
      maxAssetBytes: 4,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
    });

    await expect(
      storage.store(
        { ...scope, accountId: '../other' },
        {
          bytes: image(),
          filename: 'diagram.png',
          mimeType: 'image/png',
        },
      ),
    ).rejects.toMatchObject({ code: 'invalid-scope' });
    await expect(
      storage.store(scope, {
        bytes: new Blob(['hello'], { type: 'text/html' }),
        filename: 'attack.html',
        mimeType: 'text/html',
      }),
    ).rejects.toMatchObject({ code: 'unsupported-mime' });
    await expect(
      storage.store(scope, {
        bytes: image([1, 2, 3, 4, 5]),
        filename: 'large.png',
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'asset-too-large' });
    await expect(
      storage.store(scope, {
        bytes: image(),
        filename: 'mismatch.jpg',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ code: 'mime-mismatch' });
  });

  it('requires exact server quota proof before the first remote content write', async () => {
    const order: string[] = [];
    const server = new MemoryBinaryPort('server-assets', 'server', 'remote');
    const originalWrite = server.write.bind(server);
    server.write = async (...args) => {
      order.push('write');
      await originalWrite(...args);
    };
    const quota = new ExactQuotaAuthority();
    const originalAuthorize = quota.authorize.bind(quota);
    quota.authorize = async (...args) => {
      order.push('authorize');
      return originalAuthorize(...args);
    };
    const storage = createCanvasAssetStorage({
      binaryPorts: [server],
      metadata: new MemoryMetadataPort(),
      quota,
    });

    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
      target: 'server',
    });

    expect(order).toEqual(['authorize', 'write']);
    expect(server.calls.find((call) => call.startsWith('write:'))).toContain(':quota-1');
    expect(stored.storage.capability).toBe('server');

    const noQuota = createCanvasAssetStorage({
      binaryPorts: [new MemoryBinaryPort('server-assets', 'server', 'remote')],
      metadata: new MemoryMetadataPort(),
    });
    await expect(
      noQuota.store(scope, {
        bytes: image(),
        filename: 'diagram.png',
        mimeType: 'image/png',
        target: 'server',
      }),
    ).rejects.toMatchObject({ code: 'quota-required' });
  });

  it('rolls back newly written content when metadata publication fails', async () => {
    const binary = new MemoryBinaryPort('native-fs', 'native', 'filesystem');
    const metadata = new MemoryMetadataPort();
    metadata.failNextPut = true;
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });

    await expect(
      storage.store(scope, {
        bytes: image(),
        filename: 'diagram.png',
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'metadata-write-failed' });

    expect(await binary.list(scope)).toEqual([]);
    expect(await metadata.list(scope)).toEqual([]);
  });

  it('serializes same-asset publication so one failed writer cannot remove another result', async () => {
    const binary = new MemoryBinaryPort('native-fs', 'native', 'filesystem');
    const metadata = new MemoryMetadataPort();
    metadata.failNextPut = true;
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });
    const request = {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
    } as const;

    const results = await Promise.allSettled([
      storage.store(scope, request),
      storage.store(scope, request),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const fulfilled = results.find(
      (result): result is PromiseFulfilledResult<CanvasStoredAsset> =>
        result.status === 'fulfilled',
    );
    expect(fulfilled?.value.id).toBe(`asset_${MAIN_DIGEST}`);
    expect((await storage.read(scope, `asset_${MAIN_DIGEST}`)).bytes.size).toBe(4);
    expect(await binary.list(scope)).toEqual([`sha256/${MAIN_DIGEST}`]);
  });

  it('stores bounded thumbnail content and publishes only its immutable metadata reference', async () => {
    const binary = new MemoryBinaryPort('native-fs', 'native', 'filesystem');
    const storage = createCanvasAssetStorage({
      binaryPorts: [binary],
      metadata: new MemoryMetadataPort(),
      maxThumbnailBytes: 3,
    });

    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
      thumbnail: {
        bytes: image([9, 8, 7]),
        mimeType: 'image/png',
        width: 160,
        height: 120,
      },
    });

    expect(stored.thumbnail).toEqual({
      assetId: `asset_${THUMB_DIGEST}`,
      checksum: { algorithm: 'sha-256', digest: THUMB_DIGEST },
      byteSize: 3,
      mimeType: 'image/png',
      width: 160,
      height: 120,
      storageKey: expect.stringContaining(THUMB_DIGEST),
    });
    expect(Object.isFrozen(stored.thumbnail)).toBe(true);
    expect(await binary.list(scope)).toHaveLength(2);
  });

  it('authorizes metadata in the requested scope before reading and verifies stored bytes', async () => {
    const binary = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });
    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
    });

    await expect(storage.read(otherScope, stored.id)).rejects.toMatchObject({
      code: 'asset-not-found',
    });
    expect(binary.calls.filter((call) => call.startsWith('read:'))).toHaveLength(0);

    binary.seed(scope, stored.storage.storageKey, image([9, 8, 7]));
    await expect(storage.read(scope, stored.id)).rejects.toMatchObject({
      code: 'checksum-mismatch',
    });
  });

  it('creates and applies an immutable scope-bound orphan cleanup plan', async () => {
    const binary = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });
    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
    });
    binary.seed(scope, 'sha256/orphan', image([9, 8, 7]));
    binary.seed(otherScope, 'sha256/private-other-scope', image([9, 8, 7]));

    const plan = await storage.planOrphanCleanup(scope);

    expect(plan.entries).toEqual([{ portId: 'browser-db', storageKey: 'sha256/orphan' }]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.entries)).toBe(true);

    await storage.cleanupOrphans(scope, plan);
    expect(await binary.list(scope)).toEqual([stored.storage.storageKey]);
    expect(await binary.list(otherScope)).toEqual(['sha256/private-other-scope']);

    await expect(storage.cleanupOrphans(otherScope, plan)).rejects.toBeInstanceOf(
      CanvasAssetStorageError,
    );
  });

  it('revalidates cleanup candidates so a stale or forged plan cannot delete live content', async () => {
    const binary = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });
    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
    });

    await storage.cleanupOrphans(
      scope,
      Object.freeze({
        scope,
        entries: Object.freeze([
          Object.freeze({
            portId: stored.storage.portId,
            storageKey: stored.storage.storageKey,
          }),
        ]),
        createdAt: Date.now(),
      }),
    );

    expect(await binary.list(scope)).toEqual([stored.storage.storageKey]);
    expect((await storage.read(scope, stored.id)).metadata.id).toBe(stored.id);
  });

  it('coordinates orphan cleanup with a concurrent store of the same content key', async () => {
    const binary = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });
    binary.seed(scope, `sha256/${MAIN_DIGEST}`, image());
    const plan = await storage.planOrphanCleanup(scope);

    const [, stored] = await Promise.all([
      storage.cleanupOrphans(scope, plan),
      storage.store(scope, {
        bytes: image(),
        filename: 'diagram.png',
        mimeType: 'image/png',
      }),
    ]);

    expect((await storage.read(scope, stored.id)).metadata.id).toBe(stored.id);
    expect(await binary.list(scope)).toEqual([stored.storage.storageKey]);
  });

  it('verifies pre-existing content bytes before reusing a content-addressed key', async () => {
    const binary = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    binary.seed(scope, `sha256/${MAIN_DIGEST}`, image([9, 8, 7]));
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });

    await expect(
      storage.store(scope, {
        bytes: image(),
        filename: 'diagram.png',
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'checksum-mismatch' });
    expect(await metadata.list(scope)).toEqual([]);
  });

  it('rejects malformed stored metadata fields and thumbnail references', async () => {
    const binary = new MemoryBinaryPort('browser-db', 'browser', 'indexeddb');
    const metadata = new MemoryMetadataPort();
    const storage = createCanvasAssetStorage({ binaryPorts: [binary], metadata });
    const stored = await storage.store(scope, {
      bytes: image(),
      filename: 'diagram.png',
      mimeType: 'image/png',
    });
    metadata.values.set(`${scopeKey(scope)}:${stored.id}`, {
      ...stored,
      filename: '../escape.png',
      thumbnail: {
        assetId: `asset_${THUMB_DIGEST}`,
        checksum: { algorithm: 'sha-256', digest: THUMB_DIGEST },
        byteSize: 3,
        mimeType: 'text/html',
        width: 0,
        height: 120,
        storageKey: 'wrong-key',
      },
    });

    await expect(storage.read(scope, stored.id)).rejects.toMatchObject({
      code: 'metadata-corrupt',
    });
  });
});
