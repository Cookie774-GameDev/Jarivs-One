/**
 * Durable local wallpaper cache.
 * - Full masters: prefer absolute filesystem path (via Tauri asset URL) — no quality loss.
 * - Cloud downloads: store Blob in IndexedDB; rehydrate as blob: session URLs.
 * Never persist blob: strings long-term.
 */

const DB_NAME = 'vibespace-wallpaper-files-v2';
const STORE = 'files';
const DB_VERSION = 1;

export type StoredWallpaperBlob = {
  wallpaperId: string;
  slug: string;
  version: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  /** Full master absolute path when cached on disk (preferred for quality). */
  localPath?: string;
  /** Optional blob for cloud downloads; may be empty when localPath is set. */
  blob?: Blob;
  /** True when this entry is a full master (not a 1s catalog preview). */
  fullQuality: boolean;
  downloadedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB_unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'wallpaperId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb_open_failed'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb_request_failed'));
  });
}

export async function putWallpaperBlob(entry: StoredWallpaperBlob): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).put(entry));
  } finally {
    db.close();
  }
}

export async function getWallpaperBlob(wallpaperId: string): Promise<StoredWallpaperBlob | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const row = await idbReq(tx.objectStore(STORE).get(wallpaperId));
    return (row as StoredWallpaperBlob | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function deleteWallpaperBlob(wallpaperId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).delete(wallpaperId));
  } finally {
    db.close();
  }
}

export async function listWallpaperBlobIds(): Promise<string[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const keys = await idbReq(tx.objectStore(STORE).getAllKeys());
    return (keys as IDBValidKey[]).map(String);
  } finally {
    db.close();
  }
}

async function fileSrcFromPath(path: string): Promise<string> {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(path);
  } catch {
    // Last resort (usually blocked by CSP) — still better than silent failure.
    return `file:///${path.replace(/\\/g, '/')}`;
  }
}

/** Create a playback URL from durable storage (full path preferred). */
export async function rehydrateWallpaperObjectUrl(
  wallpaperId: string,
): Promise<string | null> {
  const row = await getWallpaperBlob(wallpaperId);
  if (!row) return null;
  if (row.localPath && row.fullQuality) {
    return fileSrcFromPath(row.localPath);
  }
  if (row.blob && row.blob.size > 0) {
    return URL.createObjectURL(row.blob);
  }
  if (row.localPath) {
    return fileSrcFromPath(row.localPath);
  }
  return null;
}

export async function storeDownloadedWallpaper(input: {
  wallpaperId: string;
  slug: string;
  version: string;
  sha256: string;
  blob: Blob;
  fullQuality?: boolean;
}): Promise<string> {
  const fullQuality = input.fullQuality ?? input.blob.size >= 500_000;
  await putWallpaperBlob({
    wallpaperId: input.wallpaperId,
    slug: input.slug,
    version: input.version,
    sha256: input.sha256,
    mimeType: input.blob.type || 'video/mp4',
    sizeBytes: input.blob.size,
    blob: input.blob,
    fullQuality,
    downloadedAt: Date.now(),
  });
  return URL.createObjectURL(input.blob);
}

/** Store a full-quality master that lives on disk (no quality loss, no huge IDB blob). */
export async function storeFullMasterPath(input: {
  wallpaperId: string;
  slug: string;
  version: string;
  sha256: string;
  localPath: string;
  sizeBytes: number;
}): Promise<string> {
  await putWallpaperBlob({
    wallpaperId: input.wallpaperId,
    slug: input.slug,
    version: input.version,
    sha256: input.sha256,
    mimeType: 'video/mp4',
    sizeBytes: input.sizeBytes,
    localPath: input.localPath,
    fullQuality: true,
    downloadedAt: Date.now(),
  });
  return fileSrcFromPath(input.localPath);
}

export async function isFullQualityCached(wallpaperId: string): Promise<boolean> {
  const row = await getWallpaperBlob(wallpaperId);
  if (!row) return false;
  if (row.fullQuality && row.localPath) return true;
  if (row.fullQuality && row.blob && row.blob.size >= 500_000) return true;
  return false;
}
