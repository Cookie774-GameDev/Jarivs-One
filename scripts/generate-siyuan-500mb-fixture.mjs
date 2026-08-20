import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File } from './prepare-siyuan-runtime.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PARENT = path.resolve(
  'D:\\VibeSpace-Testing\\SiYuan-Context-OpenCode-RLM-Feature-Testing',
);
const DEFAULT_FIXTURE_ROOT = FIXTURE_PARENT;
const DEFAULT_RUNTIME_ROOT = path.join(FIXTURE_PARENT, 'runtime-resources');
const WORKSPACE_NAME = 'fixture-workspace';
const PROGRESS_FILE = 'fixture-progress.json';
const EVIDENCE_FILE = 'fixture-evidence.json';
const DOCUMENT_COUNT = 500;
const DOCUMENT_BYTES = 1_000_000;
const TOTAL_MARKDOWN_BYTES = DOCUMENT_COUNT * DOCUMENT_BYTES;
const RUNTIME_TAG = 'v3.8.1';
const RUNTIME_COMMIT = 'afa823b6b4e4f183511e0bc0a3be93caa94c7c97';
const RUNTIME_FINGERPRINT = '59ce62549b891a1e0fb8fce530442ec95882e240b3349795ed517ca8761d603c';
const KERNEL_RELATIVE_PATH = path.join('kernel', 'SiYuan-Kernel.exe');
const KERNEL_BYTES = 106_248_136;
const KERNEL_SHA256 = '583794c497a87c0cb2aed46a64d1a7b790793ffa91173998e0e36cc0e9bfb29b';
const NOTEBOOK_NAME = 'VibeSpace deterministic 500 MB fixture';

export function deterministicDocumentId(index) {
  if (!Number.isInteger(index) || index < 0 || index >= DOCUMENT_COUNT) {
    throw new Error('SiYuan fixture document index is invalid');
  }
  return `20260820084600-${index.toString(36).padStart(7, '0')}`;
}

export function deterministicDocument(index, targetBytes = DOCUMENT_BYTES) {
  if (!Number.isInteger(targetBytes) || targetBytes < 4_096) {
    throw new Error('SiYuan fixture document size is invalid');
  }
  const ordinal = String(index).padStart(4, '0');
  const prefix = [
    `# VibeSpace SiYuan Fixture ${ordinal}`,
    '',
    `VIBESPACE_SIYUAN_500MB_SENTINEL_${ordinal}`,
    `DOCUMENT_ID=${deterministicDocumentId(index)}`,
    `CROSS_SOURCE_CHAIN_${String(index % 5).padStart(2, '0')}=cobalt-${ordinal}-quartz`,
  ].join('\n');
  const seed = `fixture-${ordinal}-offline-local-first-lossless-context-evidence `;
  const blockOpen = '\n\n```text\n';
  const blockClose = '\n```';
  const blockOverhead = Buffer.byteLength(blockOpen) + Buffer.byteLength(blockClose);
  let remaining = targetBytes - Buffer.byteLength(prefix);
  const blocks = [];
  while (remaining > 0) {
    if (remaining <= blockOverhead) throw new Error('SiYuan fixture document target is too small');
    let payloadBytes = Math.min(32_000, remaining - blockOverhead);
    const leftover = remaining - blockOverhead - payloadBytes;
    if (leftover > 0 && leftover <= blockOverhead) payloadBytes += leftover;
    const payload = seed.repeat(Math.ceil(payloadBytes / seed.length)).slice(0, payloadBytes);
    blocks.push(`${blockOpen}${payload}${blockClose}`);
    remaining -= blockOverhead + payloadBytes;
  }
  const document = `${prefix}${blocks.join('')}`;
  if (Buffer.byteLength(document) !== targetBytes) {
    throw new Error('SiYuan fixture document byte contract failed');
  }
  return document;
}

export function validateFixtureRoot(value) {
  const root = path.resolve(value);
  if (root !== FIXTURE_PARENT) throw new Error('SiYuan fixture root is outside reserved authority');
  return root;
}

export function parseApiEnvelope(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`SiYuan ${label} response is invalid`);
  }
  const envelope = value;
  if (!Number.isInteger(envelope.code) || typeof envelope.msg !== 'string') {
    throw new Error(`SiYuan ${label} response envelope is invalid`);
  }
  if (envelope.code !== 0) throw new Error(`SiYuan ${label} failed with code ${envelope.code}`);
  return envelope.data;
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function verifyRuntimeRoot(runtimeRoot) {
  const root = path.resolve(runtimeRoot);
  const marker = JSON.parse(await readFile(path.join(root, 'VIBESPACE_SIYUAN_READY.json'), 'utf8'));
  if (
    marker.schemaVersion !== 1 ||
    marker.tag !== RUNTIME_TAG ||
    marker.commitSha !== RUNTIME_COMMIT ||
    marker.fingerprint !== RUNTIME_FINGERPRINT ||
    marker.uncompressedBytes !== 445_983_251 ||
    marker.fileCount !== 1_153
  ) {
    throw new Error('SiYuan fixture runtime marker is invalid');
  }
  const kernel = path.resolve(root, KERNEL_RELATIVE_PATH);
  const kernelInfo = await lstat(kernel);
  if (
    kernelInfo.isSymbolicLink() ||
    !kernelInfo.isFile() ||
    kernelInfo.size !== KERNEL_BYTES ||
    (await sha256File(kernel)) !== KERNEL_SHA256 ||
    !kernel.startsWith(root)
  ) {
    throw new Error('SiYuan fixture kernel authority is invalid');
  }
  return { root, kernel };
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    server.close();
    throw new Error('SiYuan fixture loopback reservation failed');
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function fetchEnvelope(baseUrl, apiPath, body, cookie) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`SiYuan ${apiPath} returned HTTP ${response.status}`);
  return { response, data: parseApiEnvelope(await response.json(), apiPath) };
}

async function waitForBoot(baseUrl, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('SiYuan fixture kernel exited during boot');
    try {
      const { data } = await fetchEnvelope(baseUrl, '/api/system/bootProgress', {}, undefined);
      if (data?.progress === 100) return;
    } catch {
      // The private loopback server is expected to reject until boot completes.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('SiYuan fixture kernel boot timed out');
}

async function login(baseUrl, accessCode) {
  const { response } = await fetchEnvelope(
    baseUrl,
    '/api/system/loginAuth',
    { authCode: accessCode, captcha: '', rememberMe: false },
    undefined,
  );
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = /(?:^|[,;]\s*)(siyuan=[^;,\s]+)/u.exec(setCookie);
  if (!match) throw new Error('SiYuan fixture session cookie was not established');
  return match[1];
}

async function api(baseUrl, cookie, apiPath, body) {
  return (await fetchEnvelope(baseUrl, apiPath, body, cookie)).data;
}

async function atomicJson(target, value) {
  const temporary = `${target}.partial-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  await rename(temporary, target);
}

async function existingProgress(progressPath) {
  try {
    return JSON.parse(await readFile(progressPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function freshProgress() {
  return {
    schemaVersion: 1,
    runtimeTag: RUNTIME_TAG,
    documentCount: DOCUMENT_COUNT,
    bytesPerDocument: DOCUMENT_BYTES,
    submittedMarkdownBytes: TOTAL_MARKDOWN_BYTES,
    notebookId: null,
    completed: {},
  };
}

function validateProgress(progress) {
  if (
    progress?.schemaVersion !== 1 ||
    progress.runtimeTag !== RUNTIME_TAG ||
    progress.documentCount !== DOCUMENT_COUNT ||
    progress.bytesPerDocument !== DOCUMENT_BYTES ||
    progress.submittedMarkdownBytes !== TOTAL_MARKDOWN_BYTES ||
    !progress.completed ||
    typeof progress.completed !== 'object' ||
    Array.isArray(progress.completed)
  ) {
    throw new Error('SiYuan fixture progress contract is invalid');
  }
  return progress;
}

async function ensureNotebook(baseUrl, cookie, progress, progressPath) {
  if (typeof progress.notebookId === 'string' && progress.notebookId) return progress.notebookId;
  const data = await api(baseUrl, cookie, '/api/notebook/createNotebook', { name: NOTEBOOK_NAME });
  const notebookId = data?.notebook?.id;
  if (typeof notebookId !== 'string' || !/^[0-9]{14}-[a-z0-9]{7}$/u.test(notebookId)) {
    throw new Error('SiYuan fixture notebook response is invalid');
  }
  progress.notebookId = notebookId;
  await atomicJson(progressPath, progress);
  return notebookId;
}

async function readStoredDocument(baseUrl, cookie, id) {
  try {
    const data = await api(baseUrl, cookie, '/api/block/getBlockKramdown', { id });
    if (data?.id !== id || typeof data.kramdown !== 'string') return undefined;
    return data.kramdown;
  } catch {
    return undefined;
  }
}

async function waitForStoredDocument(baseUrl, cookie, id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stored = await readStoredDocument(baseUrl, cookie, id);
    if (stored !== undefined) return stored;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

async function createCorpus(baseUrl, cookie, notebookId, progress, progressPath) {
  let recoveringFirstIncomplete = true;
  for (let index = 0; index < DOCUMENT_COUNT; index += 1) {
    const key = String(index);
    if (progress.completed[key]) continue;
    const id = deterministicDocumentId(index);
    const markdown = deterministicDocument(index);
    let stored = recoveringFirstIncomplete
      ? await waitForStoredDocument(baseUrl, cookie, id, 5_000)
      : await readStoredDocument(baseUrl, cookie, id);
    if (stored === undefined) {
      const created = await api(baseUrl, cookie, '/api/filetree/createDocWithMd', {
        notebook: notebookId,
        path: `/Fixture ${String(index).padStart(4, '0')}`,
        markdown,
        id,
      });
      if (created !== id) throw new Error('SiYuan fixture create-document identity drifted');
      stored = await waitForStoredDocument(baseUrl, cookie, id, 60_000);
    }
    if (
      stored === undefined ||
      !stored.includes(`VIBESPACE_SIYUAN_500MB_SENTINEL_${String(index).padStart(4, '0')}`)
    ) {
      throw new Error(`SiYuan fixture stored document ${index} is invalid`);
    }
    progress.completed[key] = {
      id,
      submittedBytes: Buffer.byteLength(markdown),
      submittedSha256: sha256Text(markdown),
      storedBytes: Buffer.byteLength(stored),
      storedSha256: sha256Text(stored),
    };
    recoveringFirstIncomplete = false;
    await atomicJson(progressPath, progress);
    if ((index + 1) % 10 === 0)
      console.log(`SiYuan fixture progress: ${index + 1}/${DOCUMENT_COUNT}`);
  }
}

async function waitForSentinel(baseUrl, cookie) {
  const sentinel = 'VIBESPACE_SIYUAN_500MB_SENTINEL_0499';
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const data = await api(baseUrl, cookie, '/api/search/fullTextSearchBlock', {
      query: sentinel,
      page: 1,
      pageSize: 20,
      method: 0,
    });
    if (
      Array.isArray(data?.blocks) &&
      data.blocks.some((block) => block?.content?.includes(sentinel))
    ) {
      return { sentinel, matchedBlockCount: data.matchedBlockCount ?? data.blocks.length };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('SiYuan fixture full-text sentinel was not indexed');
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    new Promise((resolve) => child.once('exit', (code) => resolve(code))),
    new Promise((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
  ]);
}

async function measureDirectory(root) {
  let bytes = 0;
  let files = 0;
  const visit = async (target) => {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error('SiYuan fixture workspace contains a symlink');
    if (info.isFile()) {
      bytes += info.size;
      files += 1;
      return;
    }
    if (!info.isDirectory()) throw new Error('SiYuan fixture workspace entry is unsupported');
    for (const entry of await readdir(target)) await visit(path.join(target, entry));
  };
  await visit(root);
  return { bytes, files };
}

export async function generateSiyuan500MbFixture(options = {}) {
  const startedAt = Date.now();
  const fixtureRoot = validateFixtureRoot(options.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  const runtime = await verifyRuntimeRoot(options.runtimeRoot ?? DEFAULT_RUNTIME_ROOT);
  const workspaceBase = path.join(fixtureRoot, WORKSPACE_NAME);
  const workspace = path.join(workspaceBase, 'workspace');
  const runtimeHome = path.join(workspaceBase, 'runtime-home');
  const progressPath = path.join(fixtureRoot, PROGRESS_FILE);
  const evidencePath = path.join(fixtureRoot, EVIDENCE_FILE);
  let progress = await existingProgress(progressPath);
  if (!progress) {
    try {
      const entries = await readdir(workspaceBase);
      if (entries.length > 0) throw new Error('SiYuan fixture workspace exists without progress');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    progress = freshProgress();
    await mkdir(runtimeHome, { recursive: true });
    await atomicJson(progressPath, progress);
  } else {
    validateProgress(progress);
  }
  await mkdir(workspace, { recursive: true });
  await mkdir(path.join(runtimeHome, 'AppData', 'Roaming'), { recursive: true });
  await mkdir(path.join(runtimeHome, 'AppData', 'Local'), { recursive: true });
  const port = await reserveLoopbackPort();
  const accessCode = randomBytes(32).toString('base64url');
  const args = [
    'serve',
    `--workspace=${workspace}`,
    `--wd=${runtime.root}`,
    `--port=${port}`,
    '--readonly=false',
    '--lang=en',
    '--mode=prod',
    '--ssl=false',
    '--attach-ui=false',
    '--safe-mode=true',
    '--enable-pprof=false',
  ];
  const child = spawn(runtime.kernel, args, {
    cwd: runtime.root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      SIYUAN_ACCESS_AUTH_CODE: accessCode,
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      APPDATA: path.join(runtimeHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(runtimeHome, 'AppData', 'Local'),
    },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  let gracefulShutdown = false;
  try {
    await waitForBoot(baseUrl, child);
    const cookie = await login(baseUrl, accessCode);
    const version = await api(baseUrl, cookie, '/api/system/version', {});
    if (version !== '3.8.1') throw new Error('SiYuan fixture runtime version drifted');
    const notebookId = await ensureNotebook(baseUrl, cookie, progress, progressPath);
    await createCorpus(baseUrl, cookie, notebookId, progress, progressPath);
    const search = await waitForSentinel(baseUrl, cookie);
    await api(baseUrl, cookie, '/api/system/exit', {
      force: false,
      execInstallPkg: 1,
      setCurrentWorkspace: false,
    });
    gracefulShutdown = (await waitForExit(child, 60_000)) !== undefined;
    if (!gracefulShutdown) throw new Error('SiYuan fixture kernel did not exit gracefully');
    const completed = Object.values(progress.completed);
    const workspaceMeasure = await measureDirectory(workspaceBase);
    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runtimeTag: RUNTIME_TAG,
      runtimeCommit: RUNTIME_COMMIT,
      runtimeFingerprint: RUNTIME_FINGERPRINT,
      fixtureRoot,
      workspace,
      notebookId,
      documentCount: completed.length,
      bytesPerDocument: DOCUMENT_BYTES,
      submittedMarkdownBytes: completed.reduce((sum, item) => sum + item.submittedBytes, 0),
      storedKramdownBytes: completed.reduce((sum, item) => sum + item.storedBytes, 0),
      corpusDigest: sha256Text(completed.map((item) => item.storedSha256).join('\n')),
      indexedSentinel: search.sentinel,
      matchedBlockCount: search.matchedBlockCount,
      workspaceBytes: workspaceMeasure.bytes,
      workspaceFiles: workspaceMeasure.files,
      loopbackHost: '127.0.0.1',
      observedPort: port,
      observedPid: child.pid,
      sessionCookieEstablished: true,
      gracefulShutdown: true,
      processExited: child.exitCode !== null,
      secretLogged: false,
      elapsedMs: Date.now() - startedAt,
    };
    if (
      evidence.documentCount !== DOCUMENT_COUNT ||
      evidence.submittedMarkdownBytes !== TOTAL_MARKDOWN_BYTES ||
      !evidence.processExited
    ) {
      throw new Error('SiYuan fixture final evidence contract failed');
    }
    await atomicJson(evidencePath, evidence);
    return evidence;
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await waitForExit(child, 15_000);
    }
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error('SiYuan fixture arguments must be --name value pairs');
    if (key === '--fixture-root') options.fixtureRoot = value;
    else if (key === '--runtime-root') options.runtimeRoot = value;
    else throw new Error(`Unknown SiYuan fixture argument: ${key}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateSiyuan500MbFixture(parseArgs(process.argv.slice(2)))
    .then((evidence) => {
      console.log(
        `SiYuan 500 MB fixture: PASS (${evidence.documentCount} documents, ${evidence.submittedMarkdownBytes} submitted bytes, ${evidence.workspaceBytes} workspace bytes)`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
