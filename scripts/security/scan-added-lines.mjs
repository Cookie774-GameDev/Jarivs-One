import { createHash } from 'node:crypto';
import {
  lstatSync,
  openSync,
  closeSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

const SCHEMA_VERSION = 'vibespace.added-line-secret-scan.v1';
const ALLOWLIST_SCHEMA_VERSION = 'vibespace.added-line-secret-allowlist.v1';
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_BINARY_BYTES = 4 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;
const EXIT_FINDINGS = 2;
const EXIT_SCANNER_ERROR = 3;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const KNOWN_RULE_IDS = new Set([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'GENERIC_PASSWORD',
  'GITHUB_TOKEN',
  'OPENAI_PROJECT_KEY',
  'PRIVATE_KEY_HEADER',
  'STRIPE_LIVE_SECRET',
  'SUPABASE_SERVICE_ROLE_JWT',
  'URL_CREDENTIALS',
]);
const PROTECTED_EXACT_PATHS = new Set([
  'app/pnpm-lock.yaml',
  'app/pnpm-workspace.yaml',
  'install/install.ps1',
]);

class ScanError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ScanError';
    this.code = code;
  }
}

function fail(code) {
  throw new ScanError(code);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function decodeUtf8(buffer, code = 'UNSUPPORTED_ENCODING') {
  try {
    return UTF8.decode(buffer);
  } catch {
    fail(code);
  }
}

function normalizeRelativePath(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 1024) {
    fail('INVALID_PATH');
  }
  if (/[\u0000-\u001f\u007f]/u.test(input) || input !== input.normalize('NFC')) {
    fail('AMBIGUOUS_PATH');
  }
  const slashed = input.replaceAll('\\', '/');
  if (
    path.posix.isAbsolute(slashed) ||
    path.win32.isAbsolute(input) ||
    /^[A-Za-z]:/u.test(input) ||
    slashed.endsWith('/')
  ) {
    fail('INVALID_PATH');
  }
  const segments = slashed.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.trimEnd() !== segment,
    )
  ) {
    fail('AMBIGUOUS_PATH');
  }
  const normalized = path.posix.normalize(slashed);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail('INVALID_PATH');
  }
  return normalized;
}

function pathIdentity(relativePath) {
  return process.platform === 'win32' ? relativePath.toLowerCase() : relativePath;
}

function isProtected(relativePath) {
  const identity = pathIdentity(relativePath);
  if ([...PROTECTED_EXACT_PATHS].some((item) => pathIdentity(item) === identity)) {
    return true;
  }
  return pathIdentity(path.posix.basename(relativePath)) === '_wprobe.txt';
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function containedRegularFile(repository, relativePath) {
  const absolute = path.resolve(repository, ...relativePath.split('/'));
  if (!isWithin(repository, absolute)) {
    fail('PATH_ESCAPE');
  }
  let metadata;
  try {
    metadata = lstatSync(absolute);
  } catch {
    fail('UNREADABLE_INPUT');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('UNSUPPORTED_INPUT_TYPE');
  }
  let real;
  try {
    real = realpathSync(absolute);
  } catch {
    fail('UNREADABLE_INPUT');
  }
  if (!isWithin(repository, real)) {
    fail('PATH_ESCAPE');
  }
  return { absolute, metadata };
}

function readPrefix(absolute, count = 8192) {
  let descriptor;
  try {
    descriptor = openSync(absolute, 'r');
    const buffer = Buffer.alloc(count);
    const bytesRead = readSync(descriptor, buffer, 0, count, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    fail('UNREADABLE_INPUT');
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

function hasKnownBinarySignature(buffer) {
  const signatures = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from('GIF8'),
    Buffer.from('PK\x03\x04', 'binary'),
    Buffer.from('%PDF-'),
    Buffer.from([0x00, 0x61, 0x73, 0x6d]),
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    Buffer.from('MZ'),
  ];
  return (
    buffer.includes(0) ||
    signatures.some((signature) => buffer.subarray(0, signature.length).equals(signature))
  );
}

function readCandidateText(repository, relativePath) {
  const { absolute, metadata } = containedRegularFile(repository, relativePath);
  const prefix = readPrefix(absolute);
  if (hasKnownBinarySignature(prefix)) {
    if (metadata.size > MAX_BINARY_BYTES) {
      fail('OVERSIZED_BINARY');
    }
    return { binary: true, bytes: readFileSync(absolute) };
  }
  if (metadata.size > MAX_TEXT_BYTES) {
    fail('OVERSIZED_TEXT');
  }
  let bytes;
  try {
    bytes = readFileSync(absolute);
  } catch {
    fail('UNREADABLE_INPUT');
  }
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    fail('UNSUPPORTED_ENCODING');
  }
  const text = decodeUtf8(bytes);
  return {
    binary: false,
    bytes,
    text: text.startsWith('\uFEFF') ? text.slice(1) : text,
  };
}

function runGit(repository, args, code = 'GIT_FAILURE') {
  const result = spawnSync('git', args, {
    cwd: repository,
    encoding: null,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
    },
    input: undefined,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail(code);
  }
  return result.stdout;
}

function splitNullPaths(buffer) {
  const decoded = decodeUtf8(buffer, 'INVALID_GIT_PATH_ENCODING');
  const rawPaths = decoded.split('\0');
  if (rawPaths.at(-1) !== '') {
    fail('MALFORMED_GIT_PATH_LIST');
  }
  rawPaths.pop();
  const paths = rawPaths.map(normalizeRelativePath);
  const identities = new Set();
  for (const relativePath of paths) {
    const identity = pathIdentity(relativePath);
    if (identities.has(identity)) {
      fail('AMBIGUOUS_GIT_PATH');
    }
    identities.add(identity);
  }
  return paths.sort((left, right) => left.localeCompare(right, 'en'));
}

function resolveRepository(input) {
  let repository;
  try {
    repository = realpathSync(path.resolve(input));
    if (!statSync(repository).isDirectory()) {
      fail('INVALID_REPOSITORY');
    }
  } catch (error) {
    if (error instanceof ScanError) throw error;
    fail('INVALID_REPOSITORY');
  }
  const root = decodeUtf8(
    runGit(repository, ['rev-parse', '--show-toplevel'], 'INVALID_REPOSITORY'),
    'INVALID_REPOSITORY',
  ).trim();
  let resolvedRoot;
  try {
    resolvedRoot = realpathSync(root);
  } catch {
    fail('INVALID_REPOSITORY');
  }
  if (pathIdentity(resolvedRoot) !== pathIdentity(repository)) {
    fail('REPOSITORY_ROOT_REQUIRED');
  }
  return repository;
}

function resolveCommit(repository, revision, code) {
  if (
    typeof revision !== 'string' ||
    revision.length === 0 ||
    revision.length > 200 ||
    revision.startsWith('-') ||
    /[\u0000-\u0020\u007f]/u.test(revision)
  ) {
    fail(code);
  }
  const output = decodeUtf8(
    runGit(repository, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], code),
    code,
  ).trim();
  if (!/^[a-f0-9]{40,64}$/u.test(output)) {
    fail(code);
  }
  return output;
}

function parseArguments(argv) {
  const options = {
    allowlist: null,
    base: null,
    excludes: [],
    includeUntracked: [],
    json: false,
    repository: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      if (options.json) fail('DUPLICATE_OPTION');
      options.json = true;
      continue;
    }
    const keyMap = new Map([
      ['--allowlist', 'allowlist'],
      ['--base', 'base'],
      ['--exclude', 'excludes'],
      ['--include-untracked', 'includeUntracked'],
      ['--repo', 'repository'],
    ]);
    const key = keyMap.get(argument);
    if (!key || index + 1 >= argv.length) {
      fail('INVALID_ARGUMENT');
    }
    const value = argv[index + 1];
    index += 1;
    if (Array.isArray(options[key])) {
      options[key].push(value);
    } else {
      if (options[key] !== null) fail('DUPLICATE_OPTION');
      options[key] = value;
    }
  }
  if (!options.repository) fail('REPOSITORY_REQUIRED');
  return options;
}

function candidateMatches(line) {
  const matches = [];
  const isDynamicReference = (value) =>
    value.includes('${') ||
    /^(?:process|Deno)\.env/u.test(value) ||
    /^\$env:/iu.test(value) ||
    /^env\(/u.test(value);
  const add = (ruleId, value) => {
    if (value && !matches.some((match) => match.ruleId === ruleId && match.value === value)) {
      matches.push({ ruleId, value });
    }
  };
  const structured = [
    ['OPENAI_PROJECT_KEY', /\bsk-proj-[A-Za-z0-9_-]{20,}\b/gu],
    ['STRIPE_LIVE_SECRET', /\bsk_live_[A-Za-z0-9]{16,}\b/gu],
    ['GITHUB_TOKEN', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu],
    ['AWS_ACCESS_KEY_ID', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu],
    ['PRIVATE_KEY_HEADER', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/gu],
  ];
  for (const [ruleId, pattern] of structured) {
    for (const match of line.matchAll(pattern)) add(ruleId, match[0]);
  }

  const supabase =
    /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\b\s*[:=]\s*["']?((?:eyJ)[A-Za-z0-9_-]{20,}\.(?:eyJ)[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,})/giu.exec(
      line,
    );
  if (supabase) add('SUPABASE_SERVICE_ROLE_JWT', supabase[1]);

  const awsSecret =
    /\bAWS_SECRET_ACCESS_KEY\b\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?:["']|$|\s)/gu.exec(line);
  if (awsSecret) add('AWS_SECRET_ACCESS_KEY', awsSecret[1]);

  const urlCredentials = /\b[a-z][a-z0-9+.-]{2,}:\/\/[^\s/:@]+:([^@\s/]{8,})@[^\s/]+/giu.exec(line);
  if (urlCredentials && !isDynamicReference(urlCredentials[1])) {
    add('URL_CREDENTIALS', urlCredentials[1]);
  }

  const password =
    /\b(?:password|passwd|pwd)\b\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\s#;,]+))/iu.exec(line);
  if (password) {
    const value = password[1] ?? password[2] ?? password[3] ?? '';
    const placeholder =
      value.length === 0 ||
      /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/u.test(value) ||
      isDynamicReference(value) ||
      /^<[^>]+>$/u.test(value) ||
      /^(?:changeme|redacted|placeholder|example|dummy|none|null)$/iu.test(value);
    const strong =
      value.length >= 12 &&
      /[a-z]/u.test(value) &&
      /[A-Z]/u.test(value) &&
      /\d/u.test(value) &&
      /[^A-Za-z0-9]/u.test(value);
    if (!placeholder && strong) add('GENERIC_PASSWORD', value);
  }
  return matches;
}

function findingFor(relativePath, lineNumber, ruleId, value) {
  return {
    fingerprint: sha256(`${ruleId}\0${relativePath}\0${lineNumber}\0${value}`),
    line: lineNumber,
    path: relativePath,
    ruleId,
  };
}

function scanTextLines(relativePath, text) {
  const findings = [];
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/u)) {
    lineNumber += 1;
    for (const match of candidateMatches(line)) {
      findings.push(findingFor(relativePath, lineNumber, match.ruleId, match.value));
    }
  }
  return { addedLines: lineNumber - (text.endsWith('\n') ? 1 : 0), findings };
}

export function parseAddedLines(relativePath, diffBuffer) {
  if (
    diffBuffer.includes(Buffer.from('GIT binary patch')) ||
    diffBuffer.includes(Buffer.from('Binary files '))
  ) {
    return { addedLines: 0, binary: true, findings: [] };
  }
  const diff = decodeUtf8(diffBuffer, 'UNSUPPORTED_DIFF_ENCODING');
  const lines = diff.split('\n');
  const findings = [];
  let addedLines = 0;
  let inHunk = false;
  let newLine = 0;
  let remainingNewLines = 0;

  const finishHunk = () => {
    if (inHunk && remainingNewLines !== 0) {
      fail('MALFORMED_DIFF');
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('@@')) {
      finishHunk();
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@(?: .*)?$/u.exec(line);
      if (!match) fail('MALFORMED_DIFF');
      newLine = Number(match[1]);
      remainingNewLines = match[2] === undefined ? 1 : Number(match[2]);
      if (!Number.isSafeInteger(newLine) || !Number.isSafeInteger(remainingNewLines)) {
        fail('MALFORMED_DIFF');
      }
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (
        (line.startsWith('+') && !line.startsWith('+++ ')) ||
        (line.startsWith('-') && !line.startsWith('--- '))
      ) {
        fail('MALFORMED_DIFF');
      }
      continue;
    }
    if (line.startsWith('+')) {
      const content = line.slice(1);
      for (const match of candidateMatches(content)) {
        findings.push(findingFor(relativePath, newLine, match.ruleId, match.value));
      }
      addedLines += 1;
      newLine += 1;
      remainingNewLines -= 1;
    } else if (line.startsWith('-')) {
      // Deleted-side lines never advance the added-side line number.
    } else if (line.startsWith(' ')) {
      newLine += 1;
      remainingNewLines -= 1;
    } else if (line === '\\ No newline at end of file') {
      // Git metadata, not content.
    } else if (line === '' && index === lines.length - 1) {
      // Final split sentinel.
    } else {
      fail('MALFORMED_DIFF');
    }
    if (remainingNewLines < 0) fail('MALFORMED_DIFF');
  }
  finishHunk();
  return { addedLines, binary: false, findings };
}

function sortFindings(findings) {
  return findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path, 'en') ||
      left.line - right.line ||
      left.ruleId.localeCompare(right.ruleId, 'en') ||
      left.fingerprint.localeCompare(right.fingerprint, 'en'),
  );
}

function loadAllowlist(repository, relativePath, allFindings) {
  if (!relativePath) {
    return {
      binding: null,
      remaining: allFindings,
      summary: { configured: 0, used: 0 },
    };
  }
  const normalized = normalizeRelativePath(relativePath);
  if (isProtected(normalized)) fail('PROTECTED_ALLOWLIST');
  const candidate = readCandidateText(repository, normalized);
  if (candidate.binary) fail('INVALID_ALLOWLIST');
  let parsed;
  try {
    parsed = JSON.parse(candidate.text);
  } catch {
    fail('INVALID_ALLOWLIST');
  }
  if (
    !parsed ||
    parsed.schemaVersion !== ALLOWLIST_SCHEMA_VERSION ||
    !Array.isArray(parsed.entries) ||
    Object.keys(parsed).sort().join(',') !== 'entries,schemaVersion'
  ) {
    fail('INVALID_ALLOWLIST');
  }
  const entries = [];
  const exact = new Set();
  const fingerprintOwners = new Map();
  for (const raw of parsed.entries) {
    if (
      !raw ||
      Object.keys(raw).sort().join(',') !== 'fingerprint,justification,line,path,ruleId' ||
      !Number.isSafeInteger(raw.line) ||
      raw.line <= 0 ||
      !KNOWN_RULE_IDS.has(raw.ruleId) ||
      !/^[a-f0-9]{64}$/u.test(raw.fingerprint) ||
      typeof raw.justification !== 'string' ||
      raw.justification.trim().length === 0 ||
      raw.justification.length > 500
    ) {
      fail('INVALID_ALLOWLIST');
    }
    const entry = { ...raw, path: normalizeRelativePath(raw.path) };
    const identity = `${entry.path}\0${entry.line}\0${entry.ruleId}\0${entry.fingerprint}`;
    if (exact.has(identity)) fail('DUPLICATE_ALLOWLIST_ENTRY');
    exact.add(identity);
    const owner = fingerprintOwners.get(entry.fingerprint);
    const semanticOwner = `${entry.path}\0${entry.line}\0${entry.ruleId}`;
    if (owner && owner !== semanticOwner) fail('CONFLICTING_ALLOWLIST_ENTRY');
    fingerprintOwners.set(entry.fingerprint, semanticOwner);
    entries.push(entry);
  }
  const findingsByIdentity = new Map(
    allFindings.map((finding) => [
      `${finding.path}\0${finding.line}\0${finding.ruleId}\0${finding.fingerprint}`,
      finding,
    ]),
  );
  for (const entry of entries) {
    const identity = `${entry.path}\0${entry.line}\0${entry.ruleId}\0${entry.fingerprint}`;
    if (!findingsByIdentity.has(identity)) fail('STALE_ALLOWLIST_ENTRY');
    findingsByIdentity.delete(identity);
  }
  const canonicalEntries = [...entries].sort(
    (left, right) =>
      left.path.localeCompare(right.path, 'en') ||
      left.line - right.line ||
      left.ruleId.localeCompare(right.ruleId, 'en') ||
      left.fingerprint.localeCompare(right.fingerprint, 'en') ||
      left.justification.localeCompare(right.justification, 'en'),
  );
  return {
    binding: {
      entriesSha256: sha256(JSON.stringify(canonicalEntries)),
      path: normalized,
      schemaVersion: ALLOWLIST_SCHEMA_VERSION,
      sha256: sha256(candidate.bytes),
    },
    remaining: sortFindings([...findingsByIdentity.values()]),
    summary: { configured: entries.length, used: entries.length },
  };
}

function scanRepository(options) {
  const repository = resolveRepository(options.repository);
  const head = resolveCommit(repository, 'HEAD', 'INVALID_HEAD');
  const base = options.base ? resolveCommit(repository, options.base, 'INVALID_BASE') : head;
  const mode = options.base ? 'base' : 'worktree';
  const explicitExclusions = new Set();
  const explicitExclusionIdentities = new Set();
  for (const rawExclusion of options.excludes) {
    const normalized = normalizeRelativePath(rawExclusion);
    const identity = pathIdentity(normalized);
    if (explicitExclusionIdentities.has(identity)) {
      fail('DUPLICATE_EXCLUSION');
    }
    explicitExclusions.add(normalized);
    explicitExclusionIdentities.add(identity);
  }

  const unresolved = splitNullPaths(
    runGit(repository, ['diff', '--name-only', '--diff-filter=U', '-z', base, '--']),
  );
  if (unresolved.length > 0) fail('UNMERGED_INPUT');

  const trackedPaths = splitNullPaths(
    runGit(repository, ['diff', '--name-only', '--diff-filter=ACMRTUXB', '-z', base, '--']),
  );
  const exclusions = new Set(explicitExclusions);
  const findings = [];
  const trackedBindings = [];
  let trackedFiles = 0;
  let untrackedFiles = 0;
  let textFiles = 0;
  let binaryFiles = 0;
  let addedLines = 0;

  for (const relativePath of trackedPaths) {
    if (isProtected(relativePath)) {
      exclusions.add(relativePath);
      continue;
    }
    if (explicitExclusionIdentities.has(pathIdentity(relativePath))) continue;
    const diff = runGit(
      repository,
      ['diff', '--no-color', '--no-ext-diff', '--unified=0', base, '--', relativePath],
      'TRACKED_DIFF_FAILURE',
    );
    const parsed = parseAddedLines(relativePath, diff);
    trackedBindings.push(`${relativePath}\0${sha256(diff)}`);
    trackedFiles += 1;
    if (parsed.binary) {
      binaryFiles += 1;
    } else {
      const absolute = path.resolve(repository, ...relativePath.split('/'));
      try {
        if (statSync(absolute).size > MAX_TEXT_BYTES) fail('OVERSIZED_TEXT');
      } catch (error) {
        if (error instanceof ScanError) throw error;
        // Deleted files legitimately have no worktree path and no additions.
        if (parsed.addedLines > 0) fail('UNREADABLE_INPUT');
      }
      textFiles += 1;
      addedLines += parsed.addedLines;
      findings.push(...parsed.findings);
    }
  }

  const availableUntracked = new Map(
    splitNullPaths(
      runGit(repository, ['ls-files', '--others', '--exclude-standard', '-z', '--']),
    ).map((relativePath) => [pathIdentity(relativePath), relativePath]),
  );
  const requestedIdentities = new Set();
  const untrackedBindings = [];
  for (const rawPath of options.includeUntracked) {
    const requested = normalizeRelativePath(rawPath);
    const identity = pathIdentity(requested);
    if (requestedIdentities.has(identity)) fail('DUPLICATE_UNTRACKED_INPUT');
    requestedIdentities.add(identity);
    if (isProtected(requested)) {
      exclusions.add(requested);
      continue;
    }
    if (explicitExclusionIdentities.has(identity)) continue;
    const canonicalPath = availableUntracked.get(identity);
    if (!canonicalPath || canonicalPath !== requested) {
      fail('INVALID_UNTRACKED_INPUT');
    }
    const candidate = readCandidateText(repository, canonicalPath);
    untrackedBindings.push(`${canonicalPath}\0${sha256(candidate.bytes)}`);
    untrackedFiles += 1;
    if (candidate.binary) {
      binaryFiles += 1;
      continue;
    }
    const scanned = scanTextLines(canonicalPath, candidate.text);
    textFiles += 1;
    addedLines += scanned.addedLines;
    findings.push(...scanned.findings);
  }

  const sortedFindings = sortFindings(findings);
  const allowlist = loadAllowlist(repository, options.allowlist, sortedFindings);
  const trackedDiffSha256 = sha256(trackedBindings.sort().join('\n'));
  const untrackedInputsSha256 = sha256(untrackedBindings.sort().join('\n'));
  const inputSha256 = sha256(
    JSON.stringify({
      allowlist: allowlist.binding,
      base,
      exclusions: [...exclusions].sort(),
      head,
      trackedDiffSha256,
      untrackedInputsSha256,
    }),
  );
  return {
    report: {
      allowlist: allowlist.summary,
      base: options.base ? base : null,
      binding: {
        allowlist: allowlist.binding,
        head,
        inputSha256,
        trackedDiffSha256,
        untrackedInputsSha256,
      },
      exclusions: [...exclusions].sort((left, right) => left.localeCompare(right, 'en')),
      findings: allowlist.remaining,
      inputs: {
        addedLines,
        binaryFiles,
        textFiles,
        trackedFiles,
        untrackedFiles,
      },
      mode,
      schemaVersion: SCHEMA_VERSION,
    },
    repository,
  };
}

function printHuman(report) {
  const status = report.findings.length === 0 ? 'CLEAN' : 'FINDINGS';
  process.stdout.write(`Added-line secret scan: ${status}\n`);
  process.stdout.write(
    `mode=${report.mode} tracked=${report.inputs.trackedFiles} untracked=${report.inputs.untrackedFiles} addedLines=${report.inputs.addedLines} excluded=${report.exclusions.length} allowlisted=${report.allowlist.used}\n`,
  );
  for (const finding of report.findings) {
    process.stdout.write(
      `${finding.path}:${finding.line} ${finding.ruleId} ${finding.fingerprint}\n`,
    );
  }
  process.stdout.write(`inputSha256=${report.binding.inputSha256}\n`);
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    const { report } = scanRepository(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else {
      printHuman(report);
    }
    return report.findings.length === 0 ? 0 : EXIT_FINDINGS;
  } catch (error) {
    const code = error instanceof ScanError ? error.code : 'INTERNAL_FAILURE';
    process.stderr.write(`Added-line secret scan error [${code}].\n`);
    return EXIT_SCANNER_ERROR;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && path.resolve(fileURLToPath(import.meta.url)) === invokedPath) {
  process.exitCode = main();
}
