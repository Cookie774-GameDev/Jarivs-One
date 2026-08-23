import {
  createWorkspaceBackup,
  type WorkspaceBackupArtifact,
} from '@/features/access/workspaceBackup';
import { getSupabaseClient } from '@/lib/supabase';

const CLOUD_TABLE = 'app_sync_records';
const CLOUD_RECORD_KIND = 'encrypted_workspace_backup_v1';
const CLOUD_ROW_ID = 'latest';
const FORMAT = 'vibespace-encrypted-workspace-backup';
const VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const MIN_PASSPHRASE_LENGTH = 12;
const MAX_PASSPHRASE_LENGTH = 256;
const MAX_CIPHERTEXT_BYTES = 36 * 1024 * 1024;

export type EncryptedCloudBackupEnvelope = Readonly<{
  format: typeof FORMAT;
  version: typeof VERSION;
  accountId: string;
  createdAt: number;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: typeof PBKDF2_ITERATIONS;
  salt: string;
  iv: string;
  ciphertext: string;
}>;

export type EncryptedCloudBackupResult = Readonly<{
  createdAt: number;
  encryptedBytes: number;
}>;

export type EncryptedCloudBackupDependencies = Readonly<{
  currentUserId(): Promise<string | null>;
  createArtifact(): Promise<WorkspaceBackupArtifact>;
  writeEnvelope(userId: string, envelope: EncryptedCloudBackupEnvelope): Promise<void>;
  readEnvelope(userId: string): Promise<unknown>;
  now(): number;
  crypto: Crypto;
}>;

export class EncryptedCloudBackupError extends Error {
  constructor(
    readonly code:
      | 'account_unavailable'
      | 'account_changed'
      | 'passphrase_invalid'
      | 'backup_unavailable'
      | 'cloud_write_failed'
      | 'cloud_read_failed'
      | 'backup_not_found'
      | 'envelope_invalid'
      | 'decrypt_failed',
    message: string,
  ) {
    super(message);
    this.name = 'EncryptedCloudBackupError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string, maxBytes: number): Uint8Array {
  if (!value || value.length > Math.ceil(maxBytes * 1.4) + 16) {
    throw new EncryptedCloudBackupError('envelope_invalid', 'Encrypted backup data is invalid.');
  }
  try {
    const binary = atob(value);
    if (binary.length > maxBytes) throw new Error('too large');
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new EncryptedCloudBackupError('envelope_invalid', 'Encrypted backup data is invalid.');
  }
}

function validPassphrase(passphrase: string): boolean {
  return passphrase.length >= MIN_PASSPHRASE_LENGTH && passphrase.length <= MAX_PASSPHRASE_LENGTH;
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function deriveKey(
  cryptoProvider: Crypto,
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await cryptoProvider.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return cryptoProvider.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: ownedBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEnvelope(value: unknown, expectedUserId: string): EncryptedCloudBackupEnvelope {
  const envelope = objectValue(value);
  if (
    !envelope ||
    envelope.format !== FORMAT ||
    envelope.version !== VERSION ||
    envelope.accountId !== expectedUserId ||
    envelope.algorithm !== 'AES-GCM' ||
    envelope.kdf !== 'PBKDF2-SHA-256' ||
    envelope.iterations !== PBKDF2_ITERATIONS ||
    typeof envelope.createdAt !== 'number' ||
    !Number.isSafeInteger(envelope.createdAt) ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new EncryptedCloudBackupError(
      'envelope_invalid',
      'Encrypted backup metadata is invalid.',
    );
  }
  base64ToBytes(envelope.salt, 16);
  base64ToBytes(envelope.iv, 12);
  base64ToBytes(envelope.ciphertext, MAX_CIPHERTEXT_BYTES);
  return envelope as EncryptedCloudBackupEnvelope;
}

async function authenticatedUserId(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session?.user.id?.trim() || null;
}

async function captureWorkspaceArtifact(): Promise<WorkspaceBackupArtifact> {
  let artifact: WorkspaceBackupArtifact | null = null;
  const backup = createWorkspaceBackup({
    saveArtifact: async (value) => {
      artifact = value;
    },
  });
  await backup();
  if (!artifact) {
    throw new EncryptedCloudBackupError('backup_unavailable', 'The local backup was not created.');
  }
  return artifact;
}

async function writeCloudEnvelope(
  userId: string,
  envelope: EncryptedCloudBackupEnvelope,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new EncryptedCloudBackupError('cloud_write_failed', 'Cloud sync is unavailable.');
  }
  const { error } = await client.from(CLOUD_TABLE).upsert(
    {
      user_id: userId,
      table_name: CLOUD_RECORD_KIND,
      row_id: CLOUD_ROW_ID,
      op: 'update',
      payload: envelope,
      deleted_at: null,
      updated_at: new Date(envelope.createdAt).toISOString(),
    },
    { onConflict: 'user_id,table_name,row_id' },
  );
  if (error) {
    throw new EncryptedCloudBackupError(
      'cloud_write_failed',
      error.message || 'Encrypted backup upload failed.',
    );
  }
}

async function readCloudEnvelope(userId: string): Promise<unknown> {
  const client = getSupabaseClient();
  if (!client) {
    throw new EncryptedCloudBackupError('cloud_read_failed', 'Cloud sync is unavailable.');
  }
  const { data, error } = await client
    .from(CLOUD_TABLE)
    .select('user_id,payload')
    .eq('user_id', userId)
    .eq('table_name', CLOUD_RECORD_KIND)
    .eq('row_id', CLOUD_ROW_ID)
    .maybeSingle();
  if (error) {
    throw new EncryptedCloudBackupError(
      'cloud_read_failed',
      error.message || 'Encrypted backup download failed.',
    );
  }
  if (!data || data.user_id !== userId || data.payload == null) {
    throw new EncryptedCloudBackupError('backup_not_found', 'No encrypted cloud backup was found.');
  }
  return data.payload;
}

function productionDependencies(): EncryptedCloudBackupDependencies {
  return {
    currentUserId: authenticatedUserId,
    createArtifact: captureWorkspaceArtifact,
    writeEnvelope: writeCloudEnvelope,
    readEnvelope: readCloudEnvelope,
    now: Date.now,
    crypto: globalThis.crypto,
  };
}

async function encryptArtifact(
  artifact: WorkspaceBackupArtifact,
  userId: string,
  passphrase: string,
  dependencies: EncryptedCloudBackupDependencies,
): Promise<EncryptedCloudBackupEnvelope> {
  const salt = dependencies.crypto.getRandomValues(new Uint8Array(16));
  const iv = dependencies.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(dependencies.crypto, passphrase, salt);
  const ciphertext = new Uint8Array(
    await dependencies.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ownedBuffer(iv) },
      key,
      new TextEncoder().encode(artifact.content),
    ),
  );
  if (ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new EncryptedCloudBackupError('backup_unavailable', 'The encrypted backup is too large.');
  }
  return Object.freeze({
    format: FORMAT,
    version: VERSION,
    accountId: userId,
    createdAt: dependencies.now(),
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  });
}

export async function uploadEncryptedCloudBackup(
  passphrase: string,
  injected?: EncryptedCloudBackupDependencies,
): Promise<EncryptedCloudBackupResult> {
  if (!validPassphrase(passphrase)) {
    throw new EncryptedCloudBackupError(
      'passphrase_invalid',
      'Use a passphrase between 12 and 256 characters.',
    );
  }
  const dependencies = injected ?? productionDependencies();
  const userId = await dependencies.currentUserId();
  if (!userId) {
    throw new EncryptedCloudBackupError('account_unavailable', 'Sign in before cloud backup.');
  }
  const artifact = await dependencies.createArtifact();
  if ((await dependencies.currentUserId()) !== userId) {
    throw new EncryptedCloudBackupError('account_changed', 'The signed-in account changed.');
  }
  const envelope = await encryptArtifact(artifact, userId, passphrase, dependencies);
  if ((await dependencies.currentUserId()) !== userId) {
    throw new EncryptedCloudBackupError('account_changed', 'The signed-in account changed.');
  }
  await dependencies.writeEnvelope(userId, envelope);
  return {
    createdAt: envelope.createdAt,
    encryptedBytes: base64ToBytes(envelope.ciphertext, MAX_CIPHERTEXT_BYTES).byteLength,
  };
}

export async function downloadEncryptedCloudBackup(
  passphrase: string,
  injected?: EncryptedCloudBackupDependencies,
): Promise<string> {
  if (!validPassphrase(passphrase)) {
    throw new EncryptedCloudBackupError(
      'passphrase_invalid',
      'Use the passphrase that created this backup.',
    );
  }
  const dependencies = injected ?? productionDependencies();
  const userId = await dependencies.currentUserId();
  if (!userId) {
    throw new EncryptedCloudBackupError('account_unavailable', 'Sign in before cloud recovery.');
  }
  const envelope = parseEnvelope(await dependencies.readEnvelope(userId), userId);
  if ((await dependencies.currentUserId()) !== userId) {
    throw new EncryptedCloudBackupError('account_changed', 'The signed-in account changed.');
  }
  try {
    const salt = base64ToBytes(envelope.salt, 16);
    const iv = base64ToBytes(envelope.iv, 12);
    const ciphertext = base64ToBytes(envelope.ciphertext, MAX_CIPHERTEXT_BYTES);
    const key = await deriveKey(dependencies.crypto, passphrase, salt);
    const plaintext = await dependencies.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ownedBuffer(iv) },
      key,
      ownedBuffer(ciphertext),
    );
    if ((await dependencies.currentUserId()) !== userId) {
      throw new EncryptedCloudBackupError('account_changed', 'The signed-in account changed.');
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch (error) {
    if (error instanceof EncryptedCloudBackupError) throw error;
    throw new EncryptedCloudBackupError(
      'decrypt_failed',
      'The passphrase is incorrect or the encrypted backup is damaged.',
    );
  }
}
