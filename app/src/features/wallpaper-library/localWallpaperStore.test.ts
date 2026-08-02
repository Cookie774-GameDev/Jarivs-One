import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercise durable put→get via a minimal IndexedDB polyfill.
 * Asserts bytes survive under wallpaperId keys (not localStorage blob: URLs).
 */

const memory = new Map<string, unknown>();
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

function later(fn: () => void): void {
  setTimeout(fn, 0);
}

function installMemoryIdb() {
  const fakeDb = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const store = {
        put: (value: { wallpaperId: string }) => {
          memory.set(value.wallpaperId, value);
          const req = {
            result: undefined as unknown,
            onsuccess: null as null | (() => void),
            onerror: null as null | (() => void),
          };
          later(() => {
            req.result = value.wallpaperId;
            req.onsuccess?.();
          });
          return req;
        },
        get: (key: string) => {
          const req = {
            result: undefined as unknown,
            onsuccess: null as null | (() => void),
            onerror: null as null | (() => void),
          };
          later(() => {
            req.result = memory.get(key);
            req.onsuccess?.();
          });
          return req;
        },
        delete: (key: string) => {
          memory.delete(key);
          const req = {
            result: undefined as unknown,
            onsuccess: null as null | (() => void),
            onerror: null as null | (() => void),
          };
          later(() => {
            req.onsuccess?.();
          });
          return req;
        },
        getAllKeys: () => {
          const req = {
            result: undefined as unknown,
            onsuccess: null as null | (() => void),
            onerror: null as null | (() => void),
          };
          later(() => {
            req.result = [...memory.keys()];
            req.onsuccess?.();
          });
          return req;
        },
      };
      return { objectStore: () => store };
    },
    close: () => undefined,
  };

  vi.stubGlobal('indexedDB', {
    open: () => {
      const req = {
        result: undefined as unknown,
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onupgradeneeded: null as null | (() => void),
      };
      later(() => {
        req.result = fakeDb;
        req.onsuccess?.();
      });
      return req;
    },
  });
}

describe('localWallpaperStore durable bytes', () => {
  beforeEach(() => {
    memory.clear();
    installMemoryIdb();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(
        (obj: Blob | MediaSource) =>
          `blob:memory-${obj instanceof Blob ? obj.size : 0}-${Math.random().toString(16).slice(2)}`,
      ),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(() => undefined),
    });
  });

  afterEach(() => {
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('stores blob bytes and rehydrates a fresh object URL (not localStorage blob: strings)', async () => {
    const {
      storeDownloadedWallpaper,
      getWallpaperBlob,
      rehydrateWallpaperObjectUrl,
      listWallpaperBlobIds,
    } = await import('./localWallpaperStore');

    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });
    const url = await storeDownloadedWallpaper({
      wallpaperId: 'wp-1',
      slug: 'test',
      version: '1.0.0',
      sha256: 'deadbeef',
      blob,
    });
    expect(url.startsWith('blob:')).toBe(true);

    const row = await getWallpaperBlob('wp-1');
    expect(row?.sha256).toBe('deadbeef');
    expect(row?.blob?.size).toBe(4);

    const again = await rehydrateWallpaperObjectUrl('wp-1');
    expect(again).toBeTruthy();
    expect(String(again).startsWith('blob:')).toBe(true);
    expect(await listWallpaperBlobIds()).toContain('wp-1');

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const val = window.localStorage.getItem(key) ?? '';
      expect(val.includes('blob:')).toBe(false);
    }
  });
});
