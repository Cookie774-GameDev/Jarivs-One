import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

export const REQUIRED_CHAT_SCOPE =
  "html[data-theme='vibespace'] body:has(main[aria-label='Workspace'] [data-vibespace-page='chat'])";

const ALLOWLIST_KEYS = Object.freeze([
  'approvedAssets',
  'approvedPaths',
  'approvedSelectors',
  'schemaVersion',
]);
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.scss',
  '.svg',
  '.ts',
  '.tsx',
]);
const BINARY_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
  '.woff',
  '.woff2',
]);
const FORBIDDEN_ROUTE_NAMES = Object.freeze([
  'account',
  'agents',
  'benchmarks',
  'files',
  'history',
  'kanban',
  'plugins',
  'providers',
  'schedule',
  'settings',
  'skills',
  'terminal',
  'terminals',
  'tools',
]);
const FORBIDDEN_ROUTE_NAME_SET = new Set(FORBIDDEN_ROUTE_NAMES);
const FORBIDDEN_PATH_PATTERN = new RegExp(
  `^app/src/(?:features|pages)/(?:${FORBIDDEN_ROUTE_NAMES.join('|')})(?:/|$)`,
  'iu',
);
const FORBIDDEN_ROUTE_ATTRIBUTE_PATTERN = new RegExp(
  `(?:data-vibespace-page|data-route|data-page|aria-label)\\s*=\\s*['"][^'"]*(?:${FORBIDDEN_ROUTE_NAMES.join('|')})[^'"]*['"]`,
  'iu',
);
const FORBIDDEN_SELECTOR_TOKEN_PATTERN = new RegExp(
  `(?:^|[\\s>+~.#:[(="'_-])(?:${FORBIDDEN_ROUTE_NAMES.join('|')})(?:\\b|[-_])`,
  'iu',
);
const FORBIDDEN_ROUTE_SOURCE_PATTERN = new RegExp(
  `/(?:features|pages)/(?:${FORBIDDEN_ROUTE_NAMES.join('|')})(?:/|\\b)`,
  'iu',
);
const FORBIDDEN_ROUTE_SOURCE_GLOBAL_PATTERN = new RegExp(
  `/(?:features|pages)/(?:${FORBIDDEN_ROUTE_NAMES.join('|')})(?:/|\\b)`,
  'giu',
);
const FORBIDDEN_TERMINAL_PATTERN =
  /(?:\.xterm(?:\b|-)|jarvis-terminal-surface|data-terminal(?:\b|-)|terminal-workbench)/iu;
const EXACT_CHAT_TERMINAL_DROP_MARKER = "[data-terminal-drop='chat']";
const REMOTE_URL_PATTERN = /(?:https?:)?\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s"'<>)]*)?/giu;
const FULL_TARGET_PATTERN =
  /(?:^|[/\\])(?:target-chat|full-target|origami-chat-target)\.(?:avif|gif|jpe?g|png|webp)(?=[?#'")\s]|$)/iu;
const IMAGE_DATA_URI_PATTERN =
  /data:image\/(?:avif|gif|jpe?g|png|webp);base64,([A-Za-z0-9+/=]+)/giu;
const LOCKED_TARGET_DIMENSIONS = Object.freeze({ width: 1672, height: 941 });
const SAFE_RULE_WRAPPER_AT_RULE_NAMES = new Set(['container', 'media', 'supports']);
const REGULAR_GIT_FILE_MODES = new Set(['100644', '100755']);
const GENERATED_PATH_PATTERN =
  /(?:^|\/)(?:\.artifacts|artifacts|browser-profile|playwright-report|test-results)(?:\/|$)|(?:^|\/)(?:diff|overlay|screenshot)s?(?:\/|$)|(?:-diff|-overlay)\.(?:jpe?g|png|webp)$|(?:^|\/)private(?:\/|$)|\.(?:log|tar|tar\.gz|zip)$/iu;
const ORIGAMI_ASSET_REFERENCE_PATTERN =
  /(?:app\/public)?\/?assets\/origami-chat\/([A-Za-z0-9][A-Za-z0-9._/-]*)/gu;

export class ScopeAuditInputError extends Error {
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = 'ScopeAuditInputError';
    this.code = code;
  }
}

function inputError(code, message) {
  throw new ScopeAuditInputError(code, message);
}

function normalizedSelector(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizedSelectorForScope(value) {
  return normalizedSelector(value).replaceAll('"', "'").toLowerCase();
}

function isChatScopedSelector(selector) {
  const normalized = normalizedSelectorForScope(selector);
  const required = normalizedSelectorForScope(REQUIRED_CHAT_SCOPE);
  return (
    normalized === required ||
    normalized.startsWith(`${required} `) ||
    normalized.startsWith(`${required}:`)
  );
}

function forbiddenRouteTarget(value, { allowExactChatTerminalDrop = false } = {}) {
  const exactChatDropCount = value.split(EXACT_CHAT_TERMINAL_DROP_MARKER).length - 1;
  const inspectedValue =
    allowExactChatTerminalDrop && exactChatDropCount === 1
      ? value.replaceAll(EXACT_CHAT_TERMINAL_DROP_MARKER, '')
      : value;
  return (
    FORBIDDEN_ROUTE_ATTRIBUTE_PATTERN.test(inspectedValue) ||
    FORBIDDEN_SELECTOR_TOKEN_PATTERN.test(inspectedValue) ||
    FORBIDDEN_ROUTE_SOURCE_PATTERN.test(inspectedValue) ||
    moduleSpecifierTargetsForbiddenRoute(inspectedValue) ||
    FORBIDDEN_TERMINAL_PATTERN.test(inspectedValue) ||
    /\[data-theme\s*=\s*['"](?:default|dark|light|jarvis|monochrome)['"]\]/iu.test(inspectedValue)
  );
}

function moduleSpecifierTargetsForbiddenRoute(source) {
  const syntax = scanActiveModuleSyntax(source);
  if (syntax.malformed) return true;
  for (const argument of syntax.loaderArguments) {
    const specifier = exactStaticLoaderSpecifier(argument);
    if (specifier === undefined) return true;
    if (relativeSpecifierTargetsForbiddenRoute(specifier)) return true;
  }
  for (const specifier of syntax.staticSpecifiers) {
    if (relativeSpecifierTargetsForbiddenRoute(specifier)) return true;
  }
  return false;
}

function relativeSpecifierTargetsForbiddenRoute(specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
  if (specifier.includes('${') || specifier.includes('\\')) return true;
  const path = specifier.split(/[?#]/u, 1)[0];
  return path
    .split('/')
    .filter(Boolean)
    .some((segment) => FORBIDDEN_ROUTE_NAME_SET.has(segment.toLowerCase()));
}

function isIdentifierStart(character) {
  return typeof character === 'string' && /[A-Za-z_$]/u.test(character);
}

function isIdentifierContinue(character) {
  return typeof character === 'string' && /[A-Za-z0-9_$]/u.test(character);
}

function skipWhitespace(source, start) {
  let index = start;
  while (index < source.length && /\s/u.test(source[index])) index += 1;
  return index;
}

function previousNonWhitespace(source, start) {
  for (let index = start - 1; index >= 0; index -= 1) {
    if (!/\s/u.test(source[index])) return source[index];
  }
  return undefined;
}

function readQuotedLiteral(source, start) {
  const quote = source[start];
  if (!['"', "'", '`'].includes(quote)) return undefined;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === quote) {
      return {
        closed: true,
        end: index + 1,
        value: source.slice(start + 1, index),
      };
    }
  }
  return { closed: false, end: source.length, value: source.slice(start + 1) };
}

function readBalancedTemplateExpression(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (['"', "'"].includes(source[index])) {
      const literal = readQuotedLiteral(source, index);
      if (!literal?.closed) {
        return { closed: false, end: source.length, source: source.slice(openIndex + 1) };
      }
      index = literal.end - 1;
      continue;
    }
    if (source[index] === '`') {
      const template = readTemplateLiteral(source, index);
      if (!template.closed) {
        return { closed: false, end: source.length, source: source.slice(openIndex + 1) };
      }
      index = template.end - 1;
      continue;
    }
    if (source[index] === '{') {
      depth += 1;
      continue;
    }
    if (source[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) {
      return {
        closed: true,
        end: index + 1,
        source: source.slice(openIndex + 1, index),
      };
    }
  }
  return { closed: false, end: source.length, source: source.slice(openIndex + 1) };
}

function readTemplateLiteral(source, start) {
  const expressions = [];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === '`') {
      return { closed: true, end: index + 1, expressions };
    }
    if (source[index] !== '$' || source[index + 1] !== '{') continue;
    const expression = readBalancedTemplateExpression(source, index + 1);
    expressions.push(expression.source);
    if (!expression.closed) {
      return { closed: false, end: source.length, expressions };
    }
    index = expression.end - 1;
  }
  return { closed: false, end: source.length, expressions };
}

function readBalancedCallArgument(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '`') {
      const template = readTemplateLiteral(source, index);
      if (!template.closed) {
        return { argument: source.slice(openIndex + 1), closed: false, end: source.length };
      }
      index = template.end - 1;
      continue;
    }
    if (['"', "'"].includes(source[index])) {
      const literal = readQuotedLiteral(source, index);
      if (!literal?.closed) {
        return { argument: source.slice(openIndex + 1), closed: false, end: source.length };
      }
      index = literal.end - 1;
      continue;
    }
    if (source[index] === '(') {
      depth += 1;
      continue;
    }
    if (source[index] !== ')') continue;
    depth -= 1;
    if (depth === 0) {
      return {
        argument: source.slice(openIndex + 1, index),
        closed: true,
        end: index + 1,
      };
    }
  }
  return { argument: source.slice(openIndex + 1), closed: false, end: source.length };
}

function scanActiveModuleSyntax(source) {
  const loaderArguments = [];
  const staticSpecifiers = [];
  let malformed = false;
  for (let index = 0; index < source.length; ) {
    if (source[index] === '`') {
      const template = readTemplateLiteral(source, index);
      malformed ||= !template.closed;
      for (const expression of template.expressions) {
        const nested = scanActiveModuleSyntax(expression);
        loaderArguments.push(...nested.loaderArguments);
        staticSpecifiers.push(...nested.staticSpecifiers);
        malformed ||= nested.malformed;
      }
      index = template.end;
      continue;
    }
    if (['"', "'"].includes(source[index])) {
      const literal = readQuotedLiteral(source, index);
      if (!literal?.closed) {
        malformed = true;
        break;
      }
      index = literal.end;
      continue;
    }
    if (!isIdentifierStart(source[index])) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < source.length && isIdentifierContinue(source[end])) end += 1;
    const identifier = source.slice(index, end);
    const memberAccess = previousNonWhitespace(source, index) === '.';
    const valueStart = skipWhitespace(source, end);
    if (!memberAccess && ['import', 'require'].includes(identifier) && source[valueStart] === '(') {
      const call = readBalancedCallArgument(source, valueStart);
      loaderArguments.push(call.argument);
      malformed ||= !call.closed;
      index = call.end;
      continue;
    }
    if (!memberAccess && ['from', 'import'].includes(identifier)) {
      const literal = readQuotedLiteral(source, valueStart);
      if (literal) {
        staticSpecifiers.push(literal.value);
        malformed ||= !literal.closed;
        index = literal.end;
        continue;
      }
    }
    index = end;
  }
  return { loaderArguments, malformed, staticSpecifiers };
}

function exactStaticLoaderSpecifier(argument) {
  const trimmed = argument.trim();
  if (trimmed.length < 2) return undefined;
  const literal = readQuotedLiteral(trimmed, 0);
  if (
    !literal?.closed ||
    literal.end !== trimmed.length ||
    literal.value.length === 0 ||
    literal.value.includes('\\') ||
    (trimmed[0] === '`' && literal.value.includes('${'))
  ) {
    return undefined;
  }
  return literal.value;
}

function pathEscapesRoot(root, candidate) {
  const offset = relative(root, candidate);
  return (
    offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset) || offset.includes('\0')
  );
}

function safeRepositoryPath(value, code, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    inputError(code, `${label} must be a non-empty, trim-stable string.`);
  }
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    value.includes('\n') ||
    value.includes('\r') ||
    isAbsolute(value) ||
    /^[a-z]:/iu.test(value) ||
    /^(?:[a-z][a-z0-9+.-]*:)?\/\//iu.test(value)
  ) {
    inputError(code, `${label} must be a repository-relative POSIX path: ${value}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    inputError(code, `${label} must not contain empty, dot, or traversal segments: ${value}`);
  }
  return value;
}

function assertPathContained(rootDirectory, repositoryPath, code, label) {
  const root = resolve(rootDirectory);
  const candidate = resolve(root, ...repositoryPath.split('/'));
  if (pathEscapesRoot(root, candidate)) {
    inputError(code, `${label} escapes the repository root: ${repositoryPath}`);
  }
  if (existsSync(candidate) && existsSync(root)) {
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    if (pathEscapesRoot(realRoot, realCandidate)) {
      inputError(code, `${label} resolves outside the repository root: ${repositoryPath}`);
    }
  }
  return candidate;
}

function inspectRepositoryPath(rootDirectory, repositoryPath, code, label) {
  const root = resolve(rootDirectory);
  const absolutePath = assertPathContained(root, repositoryPath, code, label);
  let current = root;
  for (const segment of repositoryPath.split('/')) {
    current = resolve(current, segment);
    let entry;
    try {
      entry = lstatSync(current);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return { absolutePath, exists: false };
      }
      throw error;
    }
    if (entry.isSymbolicLink()) {
      inputError(code, `${label} traverses a symbolic link or reparse point: ${repositoryPath}`);
    }
  }
  return { absolutePath, exists: true, stat: lstatSync(absolutePath) };
}

function requireArray(value, label) {
  if (!Array.isArray(value)) inputError('ALLOWLIST_SCHEMA', `${label} must be an array.`);
  return value;
}

function rejectDuplicates(values, code, label, normalize = (value) => value) {
  const seen = new Set();
  for (const value of values) {
    const key = normalize(value);
    if (seen.has(key)) inputError(code, `${label} contains a duplicate entry: ${String(value)}`);
    seen.add(key);
  }
}

export function validateScopeAllowlist(allowlist, { rootDirectory = process.cwd() } = {}) {
  if (!allowlist || typeof allowlist !== 'object' || Array.isArray(allowlist)) {
    inputError('ALLOWLIST_SCHEMA', 'The scope allowlist must be an object.');
  }
  const keys = Object.keys(allowlist).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...ALLOWLIST_KEYS].sort())) {
    inputError(
      'ALLOWLIST_KEYS',
      `The scope allowlist keys must be exactly: ${ALLOWLIST_KEYS.join(', ')}.`,
    );
  }
  if (allowlist.schemaVersion !== 1) {
    inputError('ALLOWLIST_SCHEMA', 'schemaVersion must equal 1.');
  }

  const approvedPaths = requireArray(allowlist.approvedPaths, 'approvedPaths').map((path) =>
    safeRepositoryPath(path, 'ALLOWLIST_PATH_INVALID', 'approvedPaths entry'),
  );
  if (approvedPaths.length === 0) {
    inputError('ALLOWLIST_SCHEMA', 'approvedPaths must contain at least one exact path.');
  }
  rejectDuplicates(approvedPaths, 'ALLOWLIST_DUPLICATE_PATH', 'approvedPaths');
  for (const path of approvedPaths) {
    assertPathContained(rootDirectory, path, 'ALLOWLIST_PATH_INVALID', 'approvedPaths entry');
    if (FORBIDDEN_PATH_PATTERN.test(path)) {
      inputError(
        'ALLOWLIST_FORBIDDEN_PATH',
        `Schedule, Terminal, and unrelated route paths cannot be approved: ${path}`,
      );
    }
  }

  const approvedSelectors = requireArray(allowlist.approvedSelectors, 'approvedSelectors').map(
    (selector) => {
      if (typeof selector !== 'string' || selector.length === 0 || selector.trim() !== selector) {
        inputError(
          'ALLOWLIST_SELECTOR_INVALID',
          'approvedSelectors entries must be non-empty, trim-stable strings.',
        );
      }
      if (selector.includes(',')) {
        inputError(
          'ALLOWLIST_SELECTOR_INVALID',
          `Each approvedSelectors entry must contain one exact selector: ${selector}`,
        );
      }
      const normalized = normalizedSelector(selector);
      if (!isChatScopedSelector(normalized)) {
        inputError(
          'ALLOWLIST_SELECTOR_SCOPE',
          `Approved selector is not scoped to VibeSpace Workspace Chat: ${selector}`,
        );
      }
      if (
        forbiddenRouteTarget(normalized, {
          allowExactChatTerminalDrop: isChatScopedSelector(normalized),
        })
      ) {
        inputError(
          'ALLOWLIST_FORBIDDEN_SELECTOR',
          `Approved selector targets an unrelated route or theme: ${selector}`,
        );
      }
      return normalized;
    },
  );
  rejectDuplicates(
    approvedSelectors,
    'ALLOWLIST_DUPLICATE_SELECTOR',
    'approvedSelectors',
    normalizedSelectorForScope,
  );

  const approvedAssets = requireArray(allowlist.approvedAssets, 'approvedAssets').map((path) =>
    safeRepositoryPath(path, 'ALLOWLIST_PATH_INVALID', 'approvedAssets entry'),
  );
  rejectDuplicates(approvedAssets, 'ALLOWLIST_DUPLICATE_ASSET', 'approvedAssets');
  for (const assetPath of approvedAssets) {
    assertPathContained(rootDirectory, assetPath, 'ALLOWLIST_PATH_INVALID', 'approvedAssets entry');
    if (!assetPath.startsWith('app/public/assets/origami-chat/')) {
      inputError(
        'ALLOWLIST_ASSET_ROOT',
        `Approved Origami assets must stay under app/public/assets/origami-chat: ${assetPath}`,
      );
    }
    if (!approvedPaths.includes(assetPath)) {
      inputError(
        'ALLOWLIST_ASSET_PATH',
        `Every approved asset must also appear in approvedPaths: ${assetPath}`,
      );
    }
    if (FULL_TARGET_PATTERN.test(assetPath)) {
      inputError(
        'ALLOWLIST_FULL_TARGET_ASSET',
        `The complete target screenshot cannot be an approved production asset: ${assetPath}`,
      );
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    approvedPaths: Object.freeze([...approvedPaths].sort()),
    approvedSelectors: Object.freeze([...approvedSelectors].sort()),
    approvedAssets: Object.freeze([...approvedAssets].sort()),
  });
}

function violation(code, path, message) {
  return { code, path, message: `[${code}] ${message}` };
}

function stableViolations(values) {
  const unique = new Map();
  for (const value of values) {
    const key = `${value.code}\0${value.path}\0${value.message}`;
    unique.set(key, value);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.path.localeCompare(right.path) ||
      left.message.localeCompare(right.message),
  );
}

function addedText(beforeContent, afterContent) {
  if (typeof afterContent !== 'string') return '';
  if (typeof beforeContent !== 'string') return afterContent;
  const beforeCounts = new Map();
  for (const line of beforeContent.split(/\r?\n/u)) {
    beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1);
  }
  const additions = [];
  for (const line of afterContent.split(/\r?\n/u)) {
    const remaining = beforeCounts.get(line) ?? 0;
    if (remaining > 0) beforeCounts.set(line, remaining - 1);
    else additions.push(line);
  }
  return additions.join('\n');
}

function parseCssRules(source, path) {
  const rules = new Map();
  if (typeof source !== 'string' || source.length === 0) return rules;
  const root = postcss.parse(source, { from: path });
  root.walkRules((rule) => {
    const signature = rule.toString().replace(/\s+/gu, ' ').trim();
    for (const selector of rule.selectors) {
      const normalized = normalizedSelector(selector);
      const record = rules.get(normalized) ?? { signatures: [], hasCustomProperties: false };
      record.signatures.push(signature);
      record.hasCustomProperties ||= rule.nodes?.some(
        (node) => node.type === 'decl' && node.prop.startsWith('--'),
      );
      rules.set(normalized, record);
    }
  });
  return rules;
}

function changedCssRules(beforeContent, afterContent, path) {
  const before = parseCssRules(beforeContent, path);
  const after = parseCssRules(afterContent, path);
  const changed = [];
  for (const [selector, record] of after) {
    const previous = before.get(selector);
    if (
      previous &&
      JSON.stringify(previous.signatures.sort()) === JSON.stringify([...record.signatures].sort())
    ) {
      continue;
    }
    changed.push({ selector, hasCustomProperties: record.hasCustomProperties });
  }
  return changed;
}

function cssAtRuleSignatures(source, path) {
  const atRules = [];
  if (typeof source !== 'string' || source.length === 0) return atRules;
  const root = postcss.parse(source, { from: path });
  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    let descendantRuleCount = 0;
    atRule.walkRules(() => {
      descendantRuleCount += 1;
    });
    const safeRuleWrapper =
      SAFE_RULE_WRAPPER_AT_RULE_NAMES.has(name) &&
      descendantRuleCount > 0 &&
      !atRule.nodes?.some((node) => node.type === 'decl');
    atRules.push({
      name,
      safeRuleWrapper,
      signature: atRule.toString().replace(/\s+/gu, ' ').trim(),
    });
  });
  return atRules;
}

function changedUnsafeCssAtRules(beforeContent, afterContent, path) {
  const beforeCounts = new Map();
  for (const { signature } of cssAtRuleSignatures(beforeContent, path)) {
    beforeCounts.set(signature, (beforeCounts.get(signature) ?? 0) + 1);
  }
  const changed = [];
  for (const atRule of cssAtRuleSignatures(afterContent, path)) {
    const remaining = beforeCounts.get(atRule.signature) ?? 0;
    if (remaining > 0) beforeCounts.set(atRule.signature, remaining - 1);
    else if (!atRule.safeRuleWrapper) changed.push(atRule);
  }
  return changed;
}

function sourceWithoutStandardSvgNamespace(source) {
  return source.replaceAll(/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/giu, '');
}

function sourceWithoutComments(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/(^|[^:])\/\/[^\r\n]*/gmu, '$1');
}

function normalizedMarker(value) {
  return value.replace(/\s+/gu, '').toLowerCase();
}

function collectForbiddenSourceMarkers(source) {
  const activeSource = sourceWithoutComments(typeof source === 'string' ? source : '');
  const markers = new Map();
  const addMarker = (marker) => markers.set(marker, (markers.get(marker) ?? 0) + 1);
  const addMatches = (pattern, prefix) => {
    pattern.lastIndex = 0;
    for (const match of activeSource.matchAll(pattern)) {
      addMarker(`${prefix}:${normalizedMarker(match[0])}`);
    }
  };

  addMatches(
    new RegExp(
      `(?:data-vibespace-page|data-route|data-page|aria-label)\\s*=\\s*['"][^'"]*(?:${FORBIDDEN_ROUTE_NAMES.join('|')})[^'"]*['"]`,
      'giu',
    ),
    'route-attribute',
  );
  addMatches(
    /(?:data-vibespace-page|data-route|data-page)\s*=\s*\{[^}\r\n]*\}/giu,
    'dynamic-route-attribute',
  );
  addMatches(FORBIDDEN_ROUTE_SOURCE_GLOBAL_PATTERN, 'route-source');
  addMatches(
    /(?:(?:\.|\b)xterm(?:\b|-)[A-Za-z0-9_-]*|jarvis-terminal-surface|terminal-workbench)/giu,
    'terminal-surface',
  );
  addMatches(
    /data-terminal[A-Za-z0-9_-]*(?:\s*=\s*(?:\{[^}\r\n]*\}|['"][^'"]*['"]))?/giu,
    'terminal-attribute',
  );
  addMatches(
    /(?:\[\s*)?data-theme\s*=\s*['"](?:default|dark|light|jarvis|monochrome)['"](?:\s*\])?/giu,
    'theme',
  );

  const syntax = scanActiveModuleSyntax(activeSource);
  if (syntax.malformed) addMarker('module:malformed');
  for (const argument of syntax.loaderArguments) {
    const specifier = exactStaticLoaderSpecifier(argument);
    if (specifier === undefined) {
      addMarker(`module:dynamic:${normalizedMarker(argument)}`);
    } else if (relativeSpecifierTargetsForbiddenRoute(specifier)) {
      addMarker(`module:${specifier.toLowerCase()}`);
    }
  }
  for (const specifier of syntax.staticSpecifiers) {
    if (relativeSpecifierTargetsForbiddenRoute(specifier)) {
      addMarker(`module:${specifier.toLowerCase()}`);
    }
  }
  return markers;
}

function introducesForbiddenSourceTarget(beforeContent, afterContent) {
  const before = collectForbiddenSourceMarkers(beforeContent);
  return [...collectForbiddenSourceMarkers(afterContent)].some(
    ([marker, count]) => count > (before.get(marker) ?? 0),
  );
}

function collectAssetReferences(source) {
  const references = new Set();
  if (typeof source !== 'string') return references;
  for (const match of sourceWithoutComments(source).matchAll(ORIGAMI_ASSET_REFERENCE_PATTERN)) {
    references.add(`app/public/assets/origami-chat/${match[1]}`);
  }
  return references;
}

function imageDimensions(content) {
  const bytes =
    Buffer.isBuffer(content) || content instanceof Uint8Array ? Buffer.from(content) : undefined;
  if (!bytes || bytes.length < 10) return undefined;
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    bytes.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (
    bytes.length >= 10 &&
    (bytes.toString('ascii', 0, 6) === 'GIF87a' || bytes.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (
    bytes.length >= 30 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.toString('ascii', 12, 16) === 'VP8X'
  ) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (
    bytes.length >= 30 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.toString('ascii', 12, 16) === 'VP8 ' &&
    bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (
    bytes.length >= 25 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.toString('ascii', 12, 16) === 'VP8L' &&
    bytes[20] === 0x2f
  ) {
    const dimensions = bytes.readUInt32LE(21);
    return {
      width: 1 + (dimensions & 0x3fff),
      height: 1 + ((dimensions >>> 14) & 0x3fff),
    };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 8 < bytes.length; ) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  const ispeOffset = bytes.indexOf(Buffer.from('ispe'));
  if (ispeOffset >= 0 && ispeOffset + 16 <= bytes.length) {
    return {
      width: bytes.readUInt32BE(ispeOffset + 8),
      height: bytes.readUInt32BE(ispeOffset + 12),
    };
  }
  return undefined;
}

function isFullTargetImageContent(content) {
  const dimensions = imageDimensions(content);
  return (
    dimensions?.width === LOCKED_TARGET_DIMENSIONS.width &&
    dimensions.height === LOCKED_TARGET_DIMENSIONS.height
  );
}

function containsFullTargetDataUri(source) {
  if (typeof source !== 'string') return false;
  IMAGE_DATA_URI_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(IMAGE_DATA_URI_PATTERN)) {
    if (isFullTargetImageContent(Buffer.from(match[1], 'base64'))) return true;
  }
  return false;
}

function isProductionPath(path) {
  return (
    path.startsWith('app/src/') ||
    path.startsWith('app/public/') ||
    path.startsWith('app/src-tauri/') ||
    ['package.json', 'package-lock.json'].includes(path)
  );
}

function isTextPath(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function isPresentationSourcePath(path) {
  return (
    (path.startsWith('app/src/') && isTextPath(path) && !/\.(?:spec|test)\.[^/]+$/iu.test(path)) ||
    (path.startsWith('app/public/assets/origami-chat/') && extname(path).toLowerCase() === '.svg')
  );
}

function isBinaryPath(path) {
  return BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

function repositoryContentMap(rootDirectory, allowlist, supplied) {
  const contents = new Map(
    supplied instanceof Map
      ? supplied
      : Object.entries(supplied && typeof supplied === 'object' ? supplied : {}),
  );
  for (const path of allowlist.approvedPaths) {
    if (contents.has(path) || (!isTextPath(path) && !allowlist.approvedAssets.includes(path))) {
      continue;
    }
    const absolutePath = resolve(rootDirectory, ...path.split('/'));
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      contents.set(path, readFileSync(absolutePath, isTextPath(path) ? 'utf8' : undefined));
    }
  }
  return contents;
}

function changedPathOrViolation(path, rootDirectory, violations) {
  try {
    const safePath = safeRepositoryPath(path, 'CHANGED_PATH_INVALID', 'changed file path');
    assertPathContained(rootDirectory, safePath, 'CHANGED_PATH_INVALID', 'changed file path');
    return safePath;
  } catch (error) {
    if (!(error instanceof ScopeAuditInputError)) throw error;
    violations.push(
      violation(
        'CHANGED_PATH_INVALID',
        typeof path === 'string' ? path : '<non-string>',
        error.message.replace(/^\[[^\]]+\]\s*/u, ''),
      ),
    );
    return undefined;
  }
}

export function auditScopeChanges({
  rootDirectory = process.cwd(),
  allowlist: inputAllowlist,
  changedFiles,
  repositoryFiles,
}) {
  const allowlist = validateScopeAllowlist(inputAllowlist, { rootDirectory });
  if (!Array.isArray(changedFiles)) {
    inputError('CHANGED_FILES_SCHEMA', 'changedFiles must be an array.');
  }
  const violations = [];
  const auditedPaths = [];
  const changedSelectors = new Set();
  const seenChangedPaths = new Set();
  const currentContents = repositoryContentMap(rootDirectory, allowlist, repositoryFiles);

  for (const change of changedFiles) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      violations.push(
        violation('CHANGED_FILE_SCHEMA', '<unknown>', 'Each changedFiles entry must be an object.'),
      );
      continue;
    }
    const path = changedPathOrViolation(change.path, rootDirectory, violations);
    if (!path) continue;
    auditedPaths.push(path);
    if (seenChangedPaths.has(path)) {
      violations.push(
        violation('CHANGED_PATH_DUPLICATE', path, `Changed path appears more than once: ${path}`),
      );
      continue;
    }
    seenChangedPaths.add(path);
    if (!['added', 'modified', 'deleted'].includes(change.status)) {
      violations.push(
        violation(
          'CHANGED_STATUS_INVALID',
          path,
          `Changed file status must be added, modified, or deleted: ${String(change.status)}`,
        ),
      );
      continue;
    }
    if (GENERATED_PATH_PATTERN.test(path)) {
      violations.push(
        violation(
          'FORBIDDEN_GENERATED_PATH',
          path,
          `Generated screenshots, diffs, overlays, profiles, and artifacts are forbidden: ${path}`,
        ),
      );
    }
    if (!allowlist.approvedPaths.includes(path)) {
      violations.push(
        violation(
          'PATH_NOT_APPROVED',
          path,
          `Changed path is not present in approvedPaths: ${path}`,
        ),
      );
      continue;
    }
    if (FORBIDDEN_PATH_PATTERN.test(path)) {
      violations.push(
        violation(
          'FORBIDDEN_ROUTE_PATH',
          path,
          `Changed path targets Schedule, Terminals, or another unrelated route: ${path}`,
        ),
      );
    }
    if (change.status === 'deleted' && isProductionPath(path)) {
      violations.push(
        violation(
          'PRODUCTION_DELETION',
          path,
          `Production deletion is forbidden by the functionality-preservation contract: ${path}`,
        ),
      );
      currentContents.delete(path);
      continue;
    }
    if (
      typeof change.afterContent === 'string' ||
      Buffer.isBuffer(change.afterContent) ||
      change.afterContent instanceof Uint8Array
    ) {
      currentContents.set(path, change.afterContent);
    }
    if (change.binary === true || isBinaryPath(path) || !isTextPath(path)) continue;
    if (typeof change.afterContent !== 'string') {
      violations.push(
        violation(
          'CHANGED_CONTENT_MISSING',
          path,
          `Textual changed file requires afterContent: ${path}`,
        ),
      );
      continue;
    }
    if (!isPresentationSourcePath(path)) continue;

    const additions = sourceWithoutStandardSvgNamespace(
      addedText(change.beforeContent, change.afterContent),
    );
    const activeAdditions = sourceWithoutComments(additions);
    REMOTE_URL_PATTERN.lastIndex = 0;
    if (REMOTE_URL_PATTERN.test(activeAdditions)) {
      violations.push(
        violation('REMOTE_URL', path, `Changed Origami source contains a remote URL: ${path}`),
      );
    }
    if (FULL_TARGET_PATTERN.test(activeAdditions)) {
      violations.push(
        violation(
          'FULL_TARGET_BACKGROUND',
          path,
          `Changed Origami source references the complete target screenshot: ${path}`,
        ),
      );
    }
    if (containsFullTargetDataUri(activeAdditions)) {
      violations.push(
        violation(
          'FULL_TARGET_BACKGROUND',
          path,
          `Changed Origami source embeds a target-sized screenshot: ${path}`,
        ),
      );
    }
    const isCss = extname(path).toLowerCase() === '.css';
    const containsForbiddenTarget = isCss
      ? forbiddenRouteTarget(activeAdditions, {
          allowExactChatTerminalDrop: true,
        })
      : introducesForbiddenSourceTarget(change.beforeContent, change.afterContent);
    if (containsForbiddenTarget) {
      violations.push(
        violation(
          'FORBIDDEN_ROUTE_TARGET',
          path,
          `Changed Origami source targets Schedule, Terminals, an unrelated route, or another theme: ${path}`,
        ),
      );
    }

    if (!isCss) {
      if (/setProperty\s*\(\s*['"]--[A-Za-z0-9_-]+['"]/u.test(activeAdditions)) {
        violations.push(
          violation(
            'GLOBAL_THEME_TOKEN_REPLACEMENT',
            path,
            `Changed production code mutates global theme tokens: ${path}`,
          ),
        );
      }
      continue;
    }

    let cssRules;
    let cssAtRules;
    try {
      cssRules = changedCssRules(change.beforeContent, change.afterContent, path);
      cssAtRules = changedUnsafeCssAtRules(change.beforeContent, change.afterContent, path);
    } catch (error) {
      violations.push(
        violation(
          'CSS_PARSE_ERROR',
          path,
          `Changed stylesheet cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }
    for (const atRule of cssAtRules) {
      violations.push(
        violation(
          'CSS_AT_RULE_NOT_ALLOWED',
          path,
          `Changed stylesheet uses an at-rule that cannot be proven Chat-scoped: @${atRule.name}`,
        ),
      );
    }
    for (const rule of cssRules) {
      changedSelectors.add(rule.selector);
      const scoped = isChatScopedSelector(rule.selector);
      if (!scoped) {
        violations.push(
          violation(
            'SELECTOR_SCOPE_ESCAPE',
            path,
            `Changed selector escapes VibeSpace Workspace Chat scope: ${rule.selector}`,
          ),
        );
      }
      if (!allowlist.approvedSelectors.includes(rule.selector)) {
        violations.push(
          violation(
            'SELECTOR_NOT_APPROVED',
            path,
            `Changed selector is not present in approvedSelectors: ${rule.selector}`,
          ),
        );
      }
      if (
        forbiddenRouteTarget(rule.selector, {
          allowExactChatTerminalDrop: scoped,
        })
      ) {
        violations.push(
          violation(
            'FORBIDDEN_ROUTE_TARGET',
            path,
            `Changed selector targets Schedule, Terminals, an unrelated route, or another theme: ${rule.selector}`,
          ),
        );
      }
      if (rule.hasCustomProperties && !scoped) {
        violations.push(
          violation(
            'GLOBAL_THEME_TOKEN_REPLACEMENT',
            path,
            `Changed custom properties are not scoped to VibeSpace Workspace Chat: ${rule.selector}`,
          ),
        );
      }
    }
  }

  for (const assetPath of allowlist.approvedAssets) {
    if (isFullTargetImageContent(currentContents.get(assetPath))) {
      violations.push(
        violation(
          'FULL_TARGET_BACKGROUND',
          assetPath,
          `Approved Origami asset contains the complete target-sized screenshot: ${assetPath}`,
        ),
      );
    }
  }

  const referencedAssets = new Set();
  for (const [path, content] of currentContents) {
    if (
      !allowlist.approvedPaths.includes(path) ||
      !isPresentationSourcePath(path) ||
      typeof content !== 'string'
    ) {
      continue;
    }
    for (const assetPath of collectAssetReferences(content)) referencedAssets.add(assetPath);
  }
  for (const assetPath of referencedAssets) {
    if (!allowlist.approvedAssets.includes(assetPath)) {
      violations.push(
        violation(
          'UNDECLARED_ASSET',
          assetPath,
          `Origami production source references an asset absent from approvedAssets: ${assetPath}`,
        ),
      );
    }
  }
  for (const assetPath of allowlist.approvedAssets) {
    if (!referencedAssets.has(assetPath)) {
      violations.push(
        violation(
          'UNUSED_ASSET',
          assetPath,
          `Approved Origami asset is not referenced by any approved source path: ${assetPath}`,
        ),
      );
    }
  }

  const finalViolations = stableViolations(violations);
  return {
    schemaVersion: 1,
    ok: finalViolations.length === 0,
    auditedPaths: [...new Set(auditedPaths)].sort(),
    changedSelectors: [...changedSelectors].sort(),
    approvedAssets: [...allowlist.approvedAssets],
    violations: finalViolations,
  };
}

function defaultRunGit(rootDirectory, argumentsList) {
  const result = spawnSync('git', argumentsList, {
    cwd: rootDirectory,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  };
}

function requireComparisonRange(value) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.startsWith('-') ||
    /[\0\r\n\s]/u.test(value)
  ) {
    inputError(
      'COMPARISON_RANGE_INVALID',
      'comparisonRange must be one argv-safe Git revision range.',
    );
  }
  return value;
}

function comparisonEndpoints(comparisonRange) {
  for (const separator of ['...', '..']) {
    const index = comparisonRange.indexOf(separator);
    if (index >= 0) {
      const beforeRevision = comparisonRange.slice(0, index);
      const afterRevision = comparisonRange.slice(index + separator.length);
      if (!beforeRevision || !afterRevision) {
        inputError('COMPARISON_RANGE_INVALID', 'A comparison range must provide both revisions.');
      }
      return { beforeRevision, afterRevision, mergeBase: separator === '...' };
    }
  }
  return { beforeRevision: comparisonRange, afterRevision: undefined, mergeBase: false };
}

function gitCommandResult(runGit, argumentsList, code) {
  const result = runGit(argumentsList);
  if (!result || result.status !== 0) {
    const stderr = Buffer.isBuffer(result?.stderr)
      ? result.stderr.toString('utf8')
      : String(result?.stderr ?? '');
    inputError(
      code,
      `Git command failed (${argumentsList.join(' ')}): ${stderr.trim() || 'unknown error'}`,
    );
  }
  return result.stdout ?? '';
}

function gitResult(runGit, argumentsList, code) {
  const stdout = gitCommandResult(runGit, argumentsList, code);
  return Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout);
}

function gitShowText(runGit, revision, path) {
  return gitResult(runGit, ['show', `${revision}:${path}`], 'GIT_SHOW_FAILED');
}

function gitShowBinary(runGit, revision, path) {
  const stdout = gitCommandResult(runGit, ['show', `${revision}:${path}`], 'GIT_SHOW_FAILED');
  if (Buffer.isBuffer(stdout)) return stdout;
  if (stdout instanceof Uint8Array) return Buffer.from(stdout);
  inputError(
    'GIT_BINARY_OUTPUT_INVALID',
    `Git runner must return byte-preserving binary stdout for ${revision}:${path}.`,
  );
}

function assertRegularGitTreeEntry(runGit, revision, path) {
  const output = gitResult(runGit, ['ls-tree', '-z', revision, '--', path], 'GIT_LS_TREE_FAILED');
  const entries = output.split('\0').filter(Boolean);
  if (entries.length !== 1) {
    inputError(
      'GIT_FILE_MODE_INVALID',
      `Expected one Git tree entry for ${revision}:${path}; observed ${entries.length}.`,
    );
  }
  const match = entries[0].match(/^(\d{6})\s+(\S+)\s+([0-9a-f]+)\t([\s\S]+)$/u);
  if (!match || match[4] !== path) {
    inputError(
      'GIT_FILE_MODE_INVALID',
      `Git tree entry for ${revision}:${path} had an unexpected format.`,
    );
  }
  const [, mode, type] = match;
  if (!REGULAR_GIT_FILE_MODES.has(mode) || type !== 'blob') {
    inputError(
      'GIT_FILE_MODE_INVALID',
      `Git path must be a regular file, not mode ${mode} type ${type}: ${revision}:${path}`,
    );
  }
}

export function collectGitChangedFiles({
  rootDirectory = process.cwd(),
  comparisonRange: inputRange,
  runGit: injectedRunGit,
}) {
  const comparisonRange = requireComparisonRange(inputRange);
  const root = resolve(rootDirectory);
  const runGit = injectedRunGit
    ? (argumentsList) => injectedRunGit(argumentsList)
    : (argumentsList) => defaultRunGit(root, argumentsList);
  const nameStatus = gitResult(
    runGit,
    ['diff', '--name-status', '-z', '--no-renames', comparisonRange, '--'],
    'GIT_DIFF_FAILED',
  );
  const fields = nameStatus.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) {
    inputError('GIT_DIFF_FORMAT', 'Git name-status output had an unexpected field count.');
  }
  const endpoints = comparisonEndpoints(comparisonRange);
  let beforeRevision = endpoints.beforeRevision;
  const afterRevision = endpoints.afterRevision;
  if (endpoints.mergeBase) {
    const mergeBase = gitResult(
      runGit,
      ['merge-base', endpoints.beforeRevision, afterRevision],
      'GIT_MERGE_BASE_FAILED',
    ).trim();
    if (!mergeBase || /[\0\r\n\s]/u.test(mergeBase)) {
      inputError('GIT_MERGE_BASE_FAILED', 'Git merge-base output was empty or malformed.');
    }
    beforeRevision = mergeBase;
  }
  const changedFiles = [];
  for (let index = 0; index < fields.length; index += 2) {
    const gitStatus = fields[index];
    const path = safeRepositoryPath(fields[index + 1], 'CHANGED_PATH_INVALID', 'Git changed path');
    const status =
      gitStatus === 'A'
        ? 'added'
        : gitStatus === 'M' || gitStatus === 'T'
          ? 'modified'
          : gitStatus === 'D'
            ? 'deleted'
            : undefined;
    if (!status) {
      inputError('GIT_DIFF_FORMAT', `Unsupported Git change status: ${gitStatus}`);
    }
    const binary = isBinaryPath(path);
    if (status !== 'added') assertRegularGitTreeEntry(runGit, beforeRevision, path);
    let workingTreePath;
    if (status !== 'deleted') {
      if (afterRevision) {
        assertRegularGitTreeEntry(runGit, afterRevision, path);
      } else {
        const inspected = inspectRepositoryPath(
          root,
          path,
          'GIT_FILE_MODE_INVALID',
          'Git working-tree path',
        );
        if (!inspected.exists || !inspected.stat.isFile()) {
          inputError(
            'GIT_FILE_MODE_INVALID',
            `Git working-tree path is not a regular file: ${path}`,
          );
        }
        workingTreePath = inspected.absolutePath;
      }
    }
    let beforeContent;
    let afterContent;
    if (!binary && status !== 'added') {
      beforeContent = gitShowText(runGit, beforeRevision, path);
    }
    if (status !== 'deleted') {
      if (afterRevision) {
        afterContent = binary
          ? gitShowBinary(runGit, afterRevision, path)
          : gitShowText(runGit, afterRevision, path);
      } else {
        afterContent = readFileSync(workingTreePath, binary ? undefined : 'utf8');
      }
    }
    changedFiles.push({
      path,
      status,
      ...(binary ? { binary: true } : {}),
      ...(beforeContent === undefined ? {} : { beforeContent }),
      ...(afterContent === undefined ? {} : { afterContent }),
    });
  }
  return changedFiles;
}

export function parseScopeAuditArguments(argumentsList) {
  if (!Array.isArray(argumentsList)) {
    inputError('CLI_ARGUMENTS', 'CLI arguments must be an array.');
  }
  let allowlistPath;
  let comparisonRange;
  let rootDirectory;
  const changedFilePaths = [];
  const takeValue = (index, flag) => {
    const value = argumentsList[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      inputError('CLI_ARGUMENTS', `${flag} requires a value.`);
    }
    return value;
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const flag = argumentsList[index];
    if (flag === '--allowlist') allowlistPath = takeValue(index++, flag);
    else if (flag === '--range') comparisonRange = takeValue(index++, flag);
    else if (flag === '--root') rootDirectory = takeValue(index++, flag);
    else if (flag === '--changed-file') changedFilePaths.push(takeValue(index++, flag));
    else inputError('CLI_ARGUMENTS', `Unknown scope-audit argument: ${String(flag)}`);
  }
  if (!allowlistPath) inputError('CLI_ARGUMENTS', '--allowlist is required.');
  if (Boolean(comparisonRange) === changedFilePaths.length > 0) {
    inputError(
      'CLI_MODE',
      'Provide exactly one comparison mode: --range or one or more --changed-file values.',
    );
  }
  return {
    allowlistPath,
    ...(comparisonRange ? { comparisonRange } : {}),
    changedFilePaths,
    rootDirectory,
  };
}

function containedCliInput(rootDirectory, inputPath, code, label) {
  if (typeof inputPath !== 'string' || inputPath.trim() !== inputPath || inputPath.length === 0) {
    inputError(code, `${label} must be a non-empty, trim-stable path.`);
  }
  const root = resolve(rootDirectory);
  const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath);
  if (pathEscapesRoot(root, candidate)) inputError(code, `${label} must stay inside ${root}.`);
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    inputError(code, `${label} does not name an existing file: ${inputPath}`);
  }
  const realRoot = realpathSync(root);
  const realCandidate = realpathSync(candidate);
  if (pathEscapesRoot(realRoot, realCandidate)) {
    inputError(code, `${label} resolves outside ${realRoot}.`);
  }
  return candidate;
}

function readJsonFile(path, code, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    inputError(
      code,
      `${label} is not valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
}

function explicitChangedFiles(rootDirectory, paths) {
  return paths.map((inputPath) => {
    const path = safeRepositoryPath(inputPath, 'CHANGED_PATH_INVALID', '--changed-file');
    const inspected = inspectRepositoryPath(
      rootDirectory,
      path,
      'CHANGED_PATH_SYMLINK',
      '--changed-file',
    );
    if (!inspected.exists) return { path, status: 'deleted' };
    if (!inspected.stat.isFile()) {
      inputError('CHANGED_PATH_INVALID', `--changed-file must name a file: ${path}`);
    }
    if (isBinaryPath(path)) {
      return {
        path,
        status: 'modified',
        binary: true,
        afterContent: readFileSync(inspected.absolutePath),
      };
    }
    return { path, status: 'modified', afterContent: readFileSync(inspected.absolutePath, 'utf8') };
  });
}

export async function runScopeAuditCli({
  argumentsList = process.argv.slice(2),
  stdout = (value) => process.stdout.write(value),
  stderr = (value) => process.stderr.write(value),
  runGit,
} = {}) {
  try {
    const options = parseScopeAuditArguments(argumentsList);
    const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
    const allowlistPath = containedCliInput(
      rootDirectory,
      options.allowlistPath,
      'CLI_ALLOWLIST_PATH',
      'allowlist path',
    );
    const allowlist = readJsonFile(allowlistPath, 'CLI_ALLOWLIST_JSON', 'scope allowlist');
    const changedFiles = options.comparisonRange
      ? collectGitChangedFiles({
          rootDirectory,
          comparisonRange: options.comparisonRange,
          runGit,
        })
      : explicitChangedFiles(rootDirectory, options.changedFilePaths);
    const result = auditScopeChanges({
      rootDirectory,
      allowlist,
      changedFiles,
    });
    stdout(
      `${JSON.stringify(
        {
          ...result,
          mode: options.comparisonRange ? 'comparison-range' : 'explicit-files',
          ...(options.comparisonRange ? { comparisonRange: options.comparisonRange } : {}),
        },
        null,
        2,
      )}\n`,
    );
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`${message}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runScopeAuditCli();
}
