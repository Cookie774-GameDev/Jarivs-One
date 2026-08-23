import { describe, expect, it, vi } from 'vitest';
import {
  downloadEncryptedCloudBackup,
  uploadEncryptedCloudBackup,
  type EncryptedCloudBackupDependencies,
  type EncryptedCloudBackupEnvelope,
} from './encryptedCloudBackup';

const TEST_PASSPHRASE = 'unit-test-only';

function harness() {
  let userId: string | null = 'account-a';
  let stored: EncryptedCloudBackupEnvelope | null = null;
  const dependencies: EncryptedCloudBackupDependencies = {
    currentUserId: vi.fn(async () => userId),
    createArtifact: vi.fn(async () => ({
      filename: 'vibespace-backup-v1.json',
      mimeType: 'application/json;charset=utf-8' as const,
      content: '{"format":"vibespace-workspace-backup","version":1,"safe":"content"}',
    })),
    writeEnvelope: vi.fn(async (_accountId, envelope) => {
      stored = envelope;
    }),
    readEnvelope: vi.fn(async () => stored),
    now: () => 42,
    crypto: globalThis.crypto,
  };
  return {
    dependencies,
    stored: () => stored,
    setUserId: (value: string | null) => {
      userId = value;
    },
  };
}

describe('encrypted cloud backup', () => {
  it('uploads ciphertext only and decrypts locally with the same passphrase', async () => {
    const test = harness();
    const result = await uploadEncryptedCloudBackup(TEST_PASSPHRASE, test.dependencies);

    expect(result.createdAt).toBe(42);
    expect(result.encryptedBytes).toBeGreaterThan(0);
    expect(test.dependencies.writeEnvelope).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(test.stored())).not.toContain('safe');
    expect(JSON.stringify(test.stored())).not.toContain(TEST_PASSPHRASE);
    await expect(
      downloadEncryptedCloudBackup(TEST_PASSPHRASE, test.dependencies),
    ).resolves.toContain('vibespace-workspace-backup');
  });

  it('rejects a wrong passphrase without returning partial plaintext', async () => {
    const test = harness();
    await uploadEncryptedCloudBackup(TEST_PASSPHRASE, test.dependencies);
    await expect(
      downloadEncryptedCloudBackup('incorrect-unit', test.dependencies),
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
  });

  it('requires a strong bounded passphrase and an authenticated cloud account', async () => {
    const test = harness();
    await expect(uploadEncryptedCloudBackup('short', test.dependencies)).rejects.toMatchObject({
      code: 'passphrase_invalid',
    });
    test.setUserId(null);
    await expect(
      uploadEncryptedCloudBackup(TEST_PASSPHRASE, test.dependencies),
    ).rejects.toMatchObject({ code: 'account_unavailable' });
    expect(test.dependencies.createArtifact).not.toHaveBeenCalled();
  });

  it('aborts before upload or plaintext return when account authority changes', async () => {
    const upload = harness();
    vi.mocked(upload.dependencies.createArtifact).mockImplementationOnce(async () => {
      upload.setUserId('account-b');
      return {
        filename: 'vibespace-backup-v1.json',
        mimeType: 'application/json;charset=utf-8',
        content: '{}',
      };
    });
    await expect(
      uploadEncryptedCloudBackup(TEST_PASSPHRASE, upload.dependencies),
    ).rejects.toMatchObject({ code: 'account_changed' });
    expect(upload.dependencies.writeEnvelope).not.toHaveBeenCalled();

    const download = harness();
    await uploadEncryptedCloudBackup(TEST_PASSPHRASE, download.dependencies);
    vi.mocked(download.dependencies.readEnvelope).mockImplementationOnce(async () => {
      download.setUserId('account-b');
      return download.stored();
    });
    await expect(
      downloadEncryptedCloudBackup(TEST_PASSPHRASE, download.dependencies),
    ).rejects.toMatchObject({ code: 'account_changed' });
  });

  it('rejects malformed or cross-account envelopes before decryption', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readEnvelope).mockResolvedValue({
      format: 'vibespace-encrypted-workspace-backup',
      version: 1,
      accountId: 'account-b',
      createdAt: 42,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: 310000,
      salt: 'not-valid-base64',
      iv: 'not-valid-base64',
      ciphertext: 'not-valid-base64',
    });
    await expect(
      downloadEncryptedCloudBackup(TEST_PASSPHRASE, test.dependencies),
    ).rejects.toMatchObject({ code: 'envelope_invalid' });
  });
});
