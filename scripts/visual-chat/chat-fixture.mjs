import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ORIGAMI_CHAT_FIXTURE } from '../../tests/visual/chat/fixture-data.mjs';

const AUTH_SOURCE_PATH = 'app/src/stores/auth.ts';
const UI_SOURCE_PATH = 'app/src/stores/ui.ts';
const WHATS_NEW_SOURCE_PATH = 'app/src/features/whats-new/releases.ts';
const DATABASE_SCHEMA_PATH = 'app/src/lib/db/schema.ts';
const DATABASE_MAPPER_PATH = 'app/src/lib/db/jarvisMappers.ts';
const SEEDED_STORES = Object.freeze([
  'workspaces',
  'projects',
  'chats',
  'messages',
  'agents',
  'jarvis_runs',
  'jarvis_events',
]);

function requireSourceMatch(match, label, sourcePath) {
  if (!match) throw new Error(`Could not derive ${label} from ${sourcePath}.`);
  return match;
}

function functionBody(source, functionName, sourcePath) {
  const start = source.indexOf(`export function ${functionName}`);
  if (start < 0) throw new Error(`Could not derive ${functionName} from ${sourcePath}.`);
  const next = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function requiredMapperFields(source, functionName, sourcePath) {
  const body = functionBody(source, functionName, sourcePath);
  const referenced = [...body.matchAll(/\brow\.([A-Za-z][A-Za-z0-9_]*)/g)].map(
    ([, field]) => field,
  );
  const optional = new Set(
    [...body.matchAll(/\brow\.([A-Za-z][A-Za-z0-9_]*)\s*===\s*undefined/g)].map(
      ([, field]) => field,
    ),
  );
  return [...new Set(referenced)].filter((field) => !optional.has(field));
}

export function loadLocalPersistenceContract(rootDirectory) {
  const authSource = readFileSync(resolve(rootDirectory, AUTH_SOURCE_PATH), 'utf8');
  const uiSource = readFileSync(resolve(rootDirectory, UI_SOURCE_PATH), 'utf8');
  const whatsNewSource = readFileSync(resolve(rootDirectory, WHATS_NEW_SOURCE_PATH), 'utf8');
  const databaseSource = readFileSync(resolve(rootDirectory, DATABASE_SCHEMA_PATH), 'utf8');
  const mapperSource = readFileSync(resolve(rootDirectory, DATABASE_MAPPER_PATH), 'utf8');
  const authMatch = requireSourceMatch(
    authSource.match(
      /name:\s*'([^']+)',\s*\r?\n\s*storage:[\s\S]*?partialize:\s*\(s\)\s*=>\s*\(\{([\s\S]*?)\}\),\s*\r?\n\s*version:\s*(\d+)/,
    ),
    'auth persistence contract',
    AUTH_SOURCE_PATH,
  );
  const persistedKeys = [...authMatch[2].matchAll(/^\s*([A-Za-z]\w*):/gm)].map(([, key]) => key);
  if (persistedKeys.length === 0) {
    throw new Error(`Could not derive persisted auth fields from ${AUTH_SOURCE_PATH}.`);
  }
  const uiMatch = requireSourceMatch(
    uiSource.match(
      /name:\s*THEME_STORAGE_KEY,[\s\S]*?partialize:\s*\(s\)\s*=>\s*\(\{([\s\S]*?)\}\),/,
    ),
    'UI persistence contract',
    UI_SOURCE_PATH,
  );
  const persistedUiKeys = [...uiMatch[1].matchAll(/^\s*([A-Za-z]\w*):\s*s\.\1,?$/gm)].map(
    ([, key]) => key,
  );
  if (persistedUiKeys.length === 0) {
    throw new Error(`Could not derive persisted UI fields from ${UI_SOURCE_PATH}.`);
  }

  const databaseName = requireSourceMatch(
    databaseSource.match(/export const DB_NAME\s*=\s*'([^']+)'/),
    'database name',
    DATABASE_SCHEMA_PATH,
  )[1];
  const databaseVersion = Number(
    requireSourceMatch(
      databaseSource.match(/export const DB_VERSION\s*=\s*(\d+)/),
      'database version',
      DATABASE_SCHEMA_PATH,
    )[1],
  );
  const storeDefinitions = {};
  for (const storeBlock of databaseSource.matchAll(
    /export const STORES_V\d+\s*=\s*\{([\s\S]*?)\}\s*as const;/g,
  )) {
    for (const definition of storeBlock[1].matchAll(
      /^\s{2}([a-z][A-Za-z0-9_]*):\s*(?:\r?\n\s*)?'([^']+)'/gm,
    )) {
      storeDefinitions[definition[1]] = definition[2];
    }
  }

  return {
    auth: {
      storageKey: authMatch[1],
      storeVersion: Number(authMatch[3]),
      persistedKeys,
    },
    ui: {
      persistedKeys: persistedUiKeys,
      currentWhatsNewVersion: requireSourceMatch(
        whatsNewSource.match(/export const CURRENT_VERSION\s*=\s*'([^']+)'/),
        'current release version',
        WHATS_NEW_SOURCE_PATH,
      )[1],
    },
    database: {
      name: databaseName,
      version: databaseVersion,
      storeNames: Object.keys(storeDefinitions),
      storeDefinitions,
      mapperRequiredFields: {
        jarvis_runs: requiredMapperFields(mapperSource, 'fromJarvisRunRow', DATABASE_MAPPER_PATH),
        jarvis_run_model: requiredMapperFields(
          mapperSource,
          'fromJarvisModelSnapshotRow',
          DATABASE_MAPPER_PATH,
        ),
        jarvis_events: requiredMapperFields(
          mapperSource,
          'fromJarvisEventRow',
          DATABASE_MAPPER_PATH,
        ),
      },
    },
  };
}

function indexedFieldNames(definition) {
  return [...new Set(definition.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [])];
}

function assertIndexedFields(storeName, rows, contract, optionalFields = []) {
  const definition = contract.database.storeDefinitions[storeName];
  if (!definition) throw new Error(`Database contract is missing required store ${storeName}.`);
  const requiredFields = indexedFieldNames(definition).filter(
    (field) => !optionalFields.includes(field),
  );
  for (const [index, row] of rows.entries()) {
    for (const field of requiredFields) {
      if (!(field in row) || row[field] === undefined) {
        throw new Error(`${storeName} fixture row ${index} is missing indexed field ${field}.`);
      }
    }
  }
}

function assertRequiredFields(label, rows, requiredFields) {
  for (const [index, row] of rows.entries()) {
    for (const field of requiredFields) {
      if (!(field in row) || row[field] === undefined) {
        throw new Error(`${label} fixture row ${index} is missing mapper-required field ${field}.`);
      }
    }
  }
}

export function validateFixturePersistence(fixture, contract) {
  for (const authField of Object.keys(fixture.auth)) {
    if (!contract.auth.persistedKeys.includes(authField)) {
      throw new Error(`Fixture auth field is not persisted by production: ${authField}.`);
    }
  }
  for (const uiField of Object.keys(fixture.ui)) {
    if (!contract.ui.persistedKeys.includes(uiField)) {
      throw new Error(`Fixture UI field is not persisted by production: ${uiField}.`);
    }
  }
  if (fixture.ui.lastSeenWhatsNewVersion !== contract.ui.currentWhatsNewVersion) {
    throw new Error('Fixture lastSeenWhatsNewVersion must equal the current production version.');
  }
  for (const storeName of SEEDED_STORES) {
    if (!contract.database.storeNames.includes(storeName)) {
      throw new Error(`Database contract is missing required store ${storeName}.`);
    }
  }

  assertIndexedFields('workspaces', [fixture.workspace], contract);
  assertIndexedFields('projects', [fixture.project], contract);
  assertIndexedFields('chats', [fixture.chat], contract);
  assertIndexedFields('messages', fixture.messages, contract, ['parent_id']);
  assertIndexedFields('agents', fixture.agents, contract);
  assertIndexedFields('jarvis_runs', fixture.activity.runs, contract, ['parent_run_id']);
  assertIndexedFields('jarvis_events', fixture.activity.events, contract);
  assertRequiredFields(
    'jarvis_runs',
    fixture.activity.runs,
    contract.database.mapperRequiredFields.jarvis_runs,
  );
  assertRequiredFields(
    'jarvis_runs.model',
    fixture.activity.runs.map(({ model }) => model),
    contract.database.mapperRequiredFields.jarvis_run_model,
  );
  assertRequiredFields(
    'jarvis_events',
    fixture.activity.events,
    contract.database.mapperRequiredFields.jarvis_events,
  );

  return {
    authStorageKey: contract.auth.storageKey,
    authStoreVersion: contract.auth.storeVersion,
    uiPersistedKeys: [...contract.ui.persistedKeys],
    databaseName: contract.database.name,
    databaseVersion: contract.database.version,
    seededStores: [...SEEDED_STORES],
  };
}

export async function installOrigamiLocalState(
  page,
  themeContract,
  fixture = ORIGAMI_CHAT_FIXTURE,
  persistenceContract,
) {
  await page.addInitScript(
    ({ authKey, authVersion, fixtureValue, theme }) => {
      const captureNow = fixtureValue.clock + 3 * 60 * 60 * 1000;
      const NativeDate = globalThis.Date;
      class FrozenDate extends NativeDate {
        constructor(...argumentsList) {
          super(...(argumentsList.length === 0 ? [captureNow] : argumentsList));
        }

        static now() {
          return captureNow;
        }
      }
      globalThis.Date = FrozenDate;
      localStorage.setItem(
        authKey,
        JSON.stringify({ state: fixtureValue.auth, version: authVersion }),
      );
      localStorage.setItem(
        theme.storageKey,
        JSON.stringify({
          state: { ...fixtureValue.ui, theme: theme.theme },
          version: theme.storeVersion,
        }),
      );
    },
    {
      authKey: persistenceContract.auth.storageKey,
      authVersion: persistenceContract.auth.storeVersion,
      fixtureValue: fixture,
      theme: themeContract,
    },
  );
}

export async function waitForJarvisDatabase(page, persistenceContract) {
  await page.waitForFunction(
    async ({ databaseName, databaseVersion }) => {
      if (typeof indexedDB.databases !== 'function') return false;
      const databases = await indexedDB.databases();
      return databases.some(
        (database) => database.name === databaseName && database.version >= databaseVersion,
      );
    },
    {
      databaseName: persistenceContract.database.name,
      databaseVersion: persistenceContract.database.version,
    },
  );
}

export async function waitForInitialLocalSeed(page, persistenceContract) {
  await page.waitForFunction(
    async ({ databaseName, storeNames }) => {
      let database;
      try {
        database = await new Promise((resolveOpen, rejectOpen) => {
          const request = indexedDB.open(databaseName);
          request.onerror = () => rejectOpen(request.error ?? new Error('IndexedDB open failed.'));
          request.onsuccess = () => resolveOpen(request.result);
        });
        if (storeNames.some((storeName) => !database.objectStoreNames.contains(storeName))) {
          return false;
        }
        const transaction = database.transaction(storeNames, 'readonly');
        const counts = await Promise.all(
          storeNames.map(
            (storeName) =>
              new Promise((resolveCount, rejectCount) => {
                const request = transaction.objectStore(storeName).count();
                request.onerror = () =>
                  rejectCount(request.error ?? new Error(`Failed to count ${storeName}.`));
                request.onsuccess = () => resolveCount(request.result);
              }),
          ),
        );
        return counts.every((count) => count > 0);
      } catch {
        return false;
      } finally {
        database?.close();
      }
    },
    {
      databaseName: persistenceContract.database.name,
      storeNames: ['workspaces', 'projects', 'agents'],
    },
  );
}

export async function seedOrigamiIndexedDb(
  page,
  fixture = ORIGAMI_CHAT_FIXTURE,
  persistenceContract,
) {
  const validation = validateFixturePersistence(fixture, persistenceContract);
  return page.evaluate(
    async ({ databaseName, fixtureValue, requiredStores }) => {
      const database = await new Promise((resolveOpen, rejectOpen) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => rejectOpen(request.error ?? new Error('IndexedDB open failed.'));
        request.onsuccess = () => resolveOpen(request.result);
      });
      for (const storeName of requiredStores) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.close();
          throw new Error(`Required Jarvis object store is missing: ${storeName}`);
        }
      }
      await new Promise((resolveTransaction, rejectTransaction) => {
        const transaction = database.transaction(requiredStores, 'readwrite');
        transaction.oncomplete = () => resolveTransaction();
        transaction.onabort = () =>
          rejectTransaction(transaction.error ?? new Error('Fixture transaction aborted.'));
        transaction.onerror = () =>
          rejectTransaction(transaction.error ?? new Error('Fixture transaction failed.'));
        for (const storeName of requiredStores) transaction.objectStore(storeName).clear();
        transaction.objectStore('workspaces').put(fixtureValue.workspace);
        transaction.objectStore('projects').put(fixtureValue.project);
        transaction.objectStore('chats').put(fixtureValue.chat);
        for (const message of fixtureValue.messages) {
          transaction.objectStore('messages').put(message);
        }
        for (const agent of fixtureValue.agents) transaction.objectStore('agents').put(agent);
        for (const run of fixtureValue.activity.runs) {
          transaction.objectStore('jarvis_runs').put(run);
        }
        for (const event of fixtureValue.activity.events) {
          transaction.objectStore('jarvis_events').put(event);
        }
      });
      database.close();
      return {
        databaseName,
        workspaceId: fixtureValue.workspace.id,
        projectId: fixtureValue.project.id,
        chatId: fixtureValue.chat.id,
        messageIds: fixtureValue.messages.map(({ id }) => id),
        agentIds: fixtureValue.agents.map(({ id }) => id),
        runIds: fixtureValue.activity.runs.map(({ id }) => id),
        eventSequences: fixtureValue.activity.events.map(({ seq }) => seq),
      };
    },
    {
      databaseName: validation.databaseName,
      fixtureValue: fixture,
      requiredStores: validation.seededStores,
    },
  );
}
