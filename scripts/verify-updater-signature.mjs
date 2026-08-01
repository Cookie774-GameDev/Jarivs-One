import { createHash, createPublicKey, timingSafeEqual, verify as verifyEd25519 } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_PUBLIC_KEY_TEXT_BYTES = 4 * 1024;
const MAX_SIGNATURE_FILE_BYTES = 16 * 1024;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const utf8 = new TextDecoder('utf-8', { fatal: true });

class VerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VerificationError';
  }
}

function fail(message) {
  throw new VerificationError(message);
}

function decodeCanonicalBase64(value, label, maximumDecodedBytes) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > Math.ceil((maximumDecodedBytes * 4) / 3) + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
  ) {
    fail(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length > maximumDecodedBytes || decoded.toString('base64') !== value) {
    fail(`${label} is not canonical base64`);
  }
  return decoded;
}

function decodeUtf8(bytes, label) {
  try {
    return utf8.decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
}

function exactRecordLines(text, expectedCount, label) {
  const normalized = text.replaceAll('\r\n', '\n');
  if (normalized.includes('\r')) fail(`${label} contains an invalid line ending`);
  const withoutFinalNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  const lines = withoutFinalNewline.split('\n');
  if (lines.length !== expectedCount || lines.some((line) => line.length === 0)) {
    fail(`${label} must contain exactly ${expectedCount} nonempty lines`);
  }
  return lines;
}

function requirePrintableComment(value, label) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    fail(`${label} must contain only printable characters`);
  }
}

function parsePublicKey(encodedPublicKey) {
  const decoded = decodeCanonicalBase64(
    encodedPublicKey,
    'updater public key',
    MAX_PUBLIC_KEY_TEXT_BYTES,
  );
  const [comment, recordText] = exactRecordLines(
    decodeUtf8(decoded, 'updater public key'),
    2,
    'updater public key record',
  );
  if (!comment.startsWith('untrusted comment: ')) {
    fail('updater public key record has an invalid comment');
  }
  requirePrintableComment(comment, 'updater public key comment');
  const record = decodeCanonicalBase64(recordText, 'updater public key record', 42);
  if (record.length !== 42 || record.subarray(0, 2).toString('ascii') !== 'Ed') {
    fail('updater public key record uses an unsupported algorithm');
  }
  return {
    keyId: record.subarray(2, 10),
    publicKey: createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, record.subarray(10)]),
      format: 'der',
      type: 'spki',
    }),
  };
}

function parseSignature(encodedSignature) {
  const decoded = decodeCanonicalBase64(
    encodedSignature,
    'updater signature',
    MAX_SIGNATURE_FILE_BYTES,
  );
  const [untrustedComment, signatureText, trustedCommentLine, globalSignatureText] =
    exactRecordLines(decodeUtf8(decoded, 'updater signature'), 4, 'updater signature record');
  if (!untrustedComment.startsWith('untrusted comment: ')) {
    fail('updater signature record has an invalid untrusted comment');
  }
  requirePrintableComment(untrustedComment, 'updater signature untrusted comment');
  const trustedPrefix = 'trusted comment: ';
  if (!trustedCommentLine.startsWith(trustedPrefix)) {
    fail('updater signature record has an invalid trusted comment');
  }
  const trustedComment = trustedCommentLine.slice(trustedPrefix.length);
  if (trustedComment.length === 0) fail('updater signature trusted comment is empty');
  requirePrintableComment(trustedComment, 'updater signature trusted comment');

  const signatureRecord = decodeCanonicalBase64(signatureText, 'updater signature record', 74);
  if (signatureRecord.length !== 74) fail('updater signature record has an invalid length');
  const algorithm = signatureRecord.subarray(0, 2).toString('ascii');
  if (algorithm === 'Ed') {
    fail('legacy non-prehashed updater signatures are rejected; hashed ED is required');
  }
  if (algorithm !== 'ED') fail('updater signature record uses an unsupported algorithm');
  const globalSignature = decodeCanonicalBase64(
    globalSignatureText,
    'updater trusted comment signature',
    64,
  );
  if (globalSignature.length !== 64) {
    fail('updater trusted comment signature has an invalid length');
  }
  return {
    algorithm,
    globalSignature,
    keyId: signatureRecord.subarray(2, 10),
    messageSignature: signatureRecord.subarray(10),
    trustedComment,
  };
}

function fileIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].join(
    ':',
  );
}

async function openRegularFile(filePath, label, maximumBytes = null) {
  let pathStat;
  try {
    pathStat = await lstat(filePath, { bigint: true });
  } catch {
    fail(`${label} is unavailable`);
  }
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    fail(`${label} must be a regular non-symlink file`);
  }
  if (pathStat.nlink !== 1n) fail(`${label} must not be multiply linked`);
  if (maximumBytes !== null && pathStat.size > BigInt(maximumBytes)) {
    fail(`${label} exceeds ${maximumBytes} bytes`);
  }

  let handle;
  try {
    handle = await open(filePath, 'r');
    const handleStat = await handle.stat({ bigint: true });
    if (fileIdentity(handleStat) !== fileIdentity(pathStat)) {
      fail(`${label} identity changed while opening`);
    }
    return { handle, identity: fileIdentity(handleStat) };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof VerificationError) throw error;
    fail(`${label} could not be opened`);
  }
}

async function revalidateOpenFile(binding, filePath, label) {
  const handleStat = await binding.handle.stat({ bigint: true });
  let pathStat;
  try {
    pathStat = await lstat(filePath, { bigint: true });
  } catch {
    fail(`${label} path disappeared during verification`);
  }
  if (
    binding.identity !== fileIdentity(handleStat) ||
    binding.identity !== fileIdentity(pathStat)
  ) {
    fail(`${label} changed during verification`);
  }
}

async function readBoundedTextFile(filePath, label, maximumBytes) {
  const binding = await openRegularFile(filePath, label, maximumBytes);
  try {
    const bytes = await binding.handle.readFile();
    await revalidateOpenFile(binding, filePath, label);
    return decodeUtf8(bytes, label).trim();
  } finally {
    await binding.handle.close();
  }
}

async function hashArtifact(filePath) {
  const binding = await openRegularFile(filePath, 'updater artifact');
  try {
    const hash = createHash('blake2b512');
    const stream = binding.handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) hash.update(chunk);
    await revalidateOpenFile(binding, filePath, 'updater artifact');
    return hash.digest();
  } finally {
    await binding.handle.close();
  }
}

function displayKeyId(keyId) {
  return Buffer.from(keyId).reverse().toString('hex').toUpperCase();
}

export async function verifyTauriUpdaterSignature({
  artifactPath,
  publicKey: encodedPublicKey,
  signaturePath,
}) {
  if (
    typeof artifactPath !== 'string' ||
    artifactPath.length === 0 ||
    typeof signaturePath !== 'string' ||
    signaturePath.length === 0
  ) {
    fail('artifact and signature paths are required');
  }
  const publicKey = parsePublicKey(encodedPublicKey);
  const encodedSignature = await readBoundedTextFile(
    signaturePath,
    'updater signature file',
    MAX_SIGNATURE_FILE_BYTES,
  );
  const signature = parseSignature(encodedSignature);
  if (!timingSafeEqual(publicKey.keyId, signature.keyId)) {
    fail('updater signature key id does not match the configured public key');
  }

  const digest = await hashArtifact(artifactPath);
  if (!verifyEd25519(null, digest, publicKey.publicKey, signature.messageSignature)) {
    fail('updater artifact signature verification failed');
  }
  const trustedCommentMessage = Buffer.concat([
    signature.messageSignature,
    Buffer.from(signature.trustedComment, 'utf8'),
  ]);
  if (!verifyEd25519(null, trustedCommentMessage, publicKey.publicKey, signature.globalSignature)) {
    fail('updater trusted comment signature verification failed');
  }

  return {
    algorithm: signature.algorithm,
    keyId: displayKeyId(signature.keyId),
    trustedComment: signature.trustedComment,
    verified: true,
  };
}

function parseArguments(argv) {
  const options = { artifactPath: null, publicKey: null, signaturePath: null };
  const mappings = new Map([
    ['--artifact', 'artifactPath'],
    ['--public-key', 'publicKey'],
    ['--signature', 'signaturePath'],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = mappings.get(argv[index]);
    const value = argv[index + 1];
    if (!key || value === undefined || value.length === 0 || options[key] !== null) {
      fail('expected exactly --artifact, --signature, and --public-key');
    }
    options[key] = value;
  }
  if (argv.length !== 6 || Object.values(options).some((value) => value === null)) {
    fail('expected exactly --artifact, --signature, and --public-key');
  }
  return options;
}

async function main() {
  try {
    const result = await verifyTauriUpdaterSignature(parseArguments(process.argv.slice(2)));
    process.stdout.write(`Updater signature verified for key ${result.keyId}.\n`);
  } catch (error) {
    const message =
      error instanceof VerificationError ? error.message : 'unexpected verification failure';
    process.stderr.write(`Updater signature verification failed: ${message}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
