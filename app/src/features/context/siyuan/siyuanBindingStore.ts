const DATABASE_NAME = 'vibespace-siyuan-map-bindings';
const DATABASE_VERSION = 1;
const STORE_NAME = 'bindings';
const SCOPE_INDEX = 'scope';

interface StoredBinding {
  key: string;
  scope: string;
  nodeId: string;
  documentId: string;
}

function scopeKey(projectId: string, mapId: string): string {
  return `${projectId}\u0000${mapId}`;
}

function bindingKey(projectId: string, mapId: string, nodeId: string): string {
  return `${scopeKey(projectId, mapId)}\u0000${nodeId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('siyuan_binding_store_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('siyuan_binding_store_transaction_aborted'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('siyuan_binding_store_transaction_failed'));
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    const store = database.objectStoreNames.contains(STORE_NAME)
      ? request.transaction!.objectStore(STORE_NAME)
      : database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    if (!store.indexNames.contains(SCOPE_INDEX)) {
      store.createIndex(SCOPE_INDEX, 'scope', { unique: false });
    }
  };
  return requestResult(request);
}

export async function readSiyuanNodeBindings(
  projectId: string,
  mapId: string,
): Promise<Record<string, string>> {
  const database = await openDatabase();
  if (!database) return {};
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).index(SCOPE_INDEX).getAll(scopeKey(projectId, mapId)),
    );
    await transactionDone(transaction);
    return Object.fromEntries(
      (records as StoredBinding[]).map((record) => [record.nodeId, record.documentId]),
    );
  } finally {
    database.close();
  }
}

export async function writeSiyuanNodeBindings(
  projectId: string,
  mapId: string,
  bindings: Readonly<Record<string, string>>,
): Promise<void> {
  const entries = Object.entries(bindings);
  if (entries.length === 0) return;
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const scope = scopeKey(projectId, mapId);
    for (const [nodeId, documentId] of entries) {
      store.put({
        key: bindingKey(projectId, mapId, nodeId),
        scope,
        nodeId,
        documentId,
      } satisfies StoredBinding);
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteSiyuanNodeBindings(
  projectId: string,
  mapId: string,
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const nodeId of nodeIds) store.delete(bindingKey(projectId, mapId, nodeId));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearSiyuanNodeBindings(projectId: string, mapId: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const index = transaction.objectStore(STORE_NAME).index(SCOPE_INDEX);
    const request = index.openKeyCursor(IDBKeyRange.only(scopeKey(projectId, mapId)));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      transaction.objectStore(STORE_NAME).delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
