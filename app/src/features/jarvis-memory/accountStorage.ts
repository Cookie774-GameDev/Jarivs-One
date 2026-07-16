export async function privateAccountDirectory(accountId: string): Promise<string> {
  const normalized = accountId.trim();
  if (!normalized) throw new Error('Account id is required for private storage.');
  if (!globalThis.crypto?.subtle) {
    throw new Error('Cryptographic account isolation is unavailable.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `account-${hex}`;
}
