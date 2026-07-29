import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  REQUIRED_CHAT_SCOPE,
  ScopeAuditInputError,
  auditScopeChanges,
  collectGitChangedFiles,
  parseScopeAuditArguments,
  runScopeAuditCli,
  validateScopeAllowlist,
} from './scope-audit.mjs';

const STYLE_PATH = 'app/src/styles/origami-chat.css';
const DECOR_PATH = 'app/src/features/chat/OrigamiChatDecor.tsx';
const ASSET_PATH = 'app/public/assets/origami-chat/crane.webp';
const CHAT_STAGE_SELECTOR = `${REQUIRED_CHAT_SCOPE} [data-vibespace-page='chat']`;
const CRANE_SELECTOR = `${REQUIRED_CHAT_SCOPE} .origami-chat-crane`;

function createRepository() {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'vibespace-scope-audit-'));
  const absolute = (path) => join(rootDirectory, ...path.split('/'));
  const write = (path, content = '') => {
    const absolutePath = absolute(path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  };
  const junction = (path, target) => {
    const absolutePath = absolute(path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    symlinkSync(absolute(target), absolutePath, 'junction');
  };
  return {
    absolute,
    junction,
    rootDirectory,
    write,
    cleanup: () => rmSync(rootDirectory, { recursive: true, force: true }),
  };
}

function validAllowlist(overrides = {}) {
  return {
    schemaVersion: 1,
    approvedPaths: [STYLE_PATH, DECOR_PATH, ASSET_PATH],
    approvedSelectors: [CHAT_STAGE_SELECTOR, CRANE_SELECTOR],
    approvedAssets: [ASSET_PATH],
    ...overrides,
  };
}

function validCss() {
  return `${CHAT_STAGE_SELECTOR} {
  --origami-paper: #fdf4e6;
  background-image: url('/assets/origami-chat/crane.webp');
}

${CRANE_SELECTOR} {
  pointer-events: none;
}
`;
}

function audit({
  allowlist = validAllowlist(),
  changedFiles = [
    { path: STYLE_PATH, status: 'modified', beforeContent: '', afterContent: validCss() },
    { path: ASSET_PATH, status: 'added', binary: true },
  ],
  repositoryFiles = {
    [STYLE_PATH]: validCss(),
    [DECOR_PATH]:
      '<div className="origami-chat-crane" aria-hidden="true" data-origami-decoration />',
  },
} = {}) {
  return auditScopeChanges({
    rootDirectory: 'C:/synthetic/vibespace',
    allowlist,
    changedFiles,
    repositoryFiles,
  });
}

function codes(result) {
  return result.violations.map(({ code }) => code);
}

function runGit(rootDirectory, argumentsList) {
  const result = spawnSync('git', argumentsList, {
    cwd: rootDirectory,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `git ${argumentsList.join(' ')} failed: ${result.stderr || result.error?.message || 'unknown error'}`,
  );
  return result.stdout.trim();
}

function targetSizedPngHeader() {
  const content = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(content);
  content.writeUInt32BE(13, 8);
  content.write('IHDR', 12, 'ascii');
  content.writeUInt32BE(1672, 16);
  content.writeUInt32BE(941, 20);
  return content;
}

function targetSizedLossyWebpHeader() {
  const content = Buffer.alloc(30);
  content.write('RIFF', 0, 'ascii');
  content.writeUInt32LE(22, 4);
  content.write('WEBP', 8, 'ascii');
  content.write('VP8 ', 12, 'ascii');
  content.writeUInt32LE(10, 16);
  Buffer.from([0x9d, 0x01, 0x2a]).copy(content, 23);
  content.writeUInt16LE(1672, 26);
  content.writeUInt16LE(941, 28);
  return content;
}

function targetSizedLosslessWebpHeader() {
  const content = Buffer.alloc(25);
  content.write('RIFF', 0, 'ascii');
  content.writeUInt32LE(17, 4);
  content.write('WEBP', 8, 'ascii');
  content.write('VP8L', 12, 'ascii');
  content.writeUInt32LE(5, 16);
  content[20] = 0x2f;
  content.writeUInt32LE((1672 - 1) | ((941 - 1) << 14), 21);
  return content;
}

test('accepts exact Chat-scoped paths, selectors, and a referenced local asset', () => {
  const result = audit();

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.auditedPaths, [ASSET_PATH, STYLE_PATH]);
  assert.deepEqual(result.approvedAssets, [ASSET_PATH]);
});

test('compares CSS rules and audits only selectors changed from the supplied before-content', () => {
  const legacyCss = "html[data-theme='vibespace'] { color: #54362a; }\n";
  const result = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: legacyCss,
        afterContent: `${legacyCss}${validCss()}`,
      },
      { path: ASSET_PATH, status: 'added', binary: true },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedSelectors, [CHAT_STAGE_SELECTOR, CRANE_SELECTOR].sort());
});

test('rejects every changed at-rule that cannot be proven Chat-scoped', () => {
  for (const source of [
    '@layer reset, origami;',
    '@counter-style origami-folds { system: cyclic; symbols: "◆"; suffix: " "; }',
    "@import './paper.css';",
    '@property --origami-fold { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    '@font-face { font-family: Origami; src: url("/assets/origami-chat/crane.webp"); }',
    '@page { margin: 0; }',
  ]) {
    const result = audit({
      allowlist: validAllowlist({
        approvedPaths: [STYLE_PATH, DECOR_PATH],
        approvedAssets: [],
      }),
      changedFiles: [
        {
          path: STYLE_PATH,
          status: 'modified',
          beforeContent: '',
          afterContent: source,
        },
      ],
      repositoryFiles: { [STYLE_PATH]: source, [DECOR_PATH]: '' },
    });

    assert.ok(codes(result).includes('CSS_AT_RULE_NOT_ALLOWED'), source);
  }
});

test('allows only proven rule wrappers and ignores unchanged legacy global at-rules', () => {
  const wrappedCss = `@media (min-width: 800px) {
  ${CHAT_STAGE_SELECTOR} { background-image: url('/assets/origami-chat/crane.webp'); }
}
@supports (display: grid) {
  ${CRANE_SELECTOR} { display: block; }
}
@container chat (min-width: 600px) {
  ${CRANE_SELECTOR} { pointer-events: none; }
}
`;
  const wrapped = audit({
    changedFiles: [
      { path: STYLE_PATH, status: 'modified', beforeContent: '', afterContent: wrappedCss },
      { path: ASSET_PATH, status: 'added', binary: true },
    ],
    repositoryFiles: { [STYLE_PATH]: wrappedCss, [DECOR_PATH]: '' },
  });
  assert.equal(wrapped.ok, true);

  const legacy = '@layer reset, origami;\n';
  const afterContent = `${legacy}${validCss()}`;
  const unchangedLegacy = audit({
    changedFiles: [
      { path: STYLE_PATH, status: 'modified', beforeContent: legacy, afterContent },
      { path: ASSET_PATH, status: 'added', binary: true },
    ],
    repositoryFiles: { [STYLE_PATH]: afterContent, [DECOR_PATH]: '' },
  });
  assert.equal(unchangedLegacy.ok, true);
});

test('rejects changed paths outside the exact approved path allowlist', () => {
  const result = audit({
    changedFiles: [
      {
        path: 'app/src/features/chat/Unapproved.tsx',
        status: 'modified',
        afterContent: 'export const unapproved = true;',
      },
    ],
  });

  assert.deepEqual(codes(result), ['PATH_NOT_APPROVED']);
  assert.match(result.violations[0].message, /not present in approvedPaths/u);
});

test('rejects Schedule and Terminals paths even when a malformed allowlist tries to approve them', () => {
  for (const forbiddenPath of [
    'app/src/features/schedule/SchedulePage.tsx',
    'app/src/features/terminal/TerminalPage.tsx',
  ]) {
    assert.throws(
      () =>
        validateScopeAllowlist(
          validAllowlist({
            approvedPaths: [...validAllowlist().approvedPaths, forbiddenPath],
          }),
          { rootDirectory: 'C:/synthetic/vibespace' },
        ),
      (error) => {
        assert.ok(error instanceof ScopeAuditInputError);
        assert.equal(error.code, 'ALLOWLIST_FORBIDDEN_PATH');
        assert.match(error.message, /Schedule|Terminal/iu);
        return true;
      },
    );
  }
});

test('rejects Schedule and Terminal selector targeting beneath an otherwise valid Chat prefix', () => {
  for (const forbiddenSelector of [
    `${REQUIRED_CHAT_SCOPE} [data-vibespace-page='schedule']`,
    `${REQUIRED_CHAT_SCOPE} .xterm-screen`,
    `${REQUIRED_CHAT_SCOPE} .settings-modal`,
  ]) {
    const result = audit({
      changedFiles: [
        {
          path: STYLE_PATH,
          status: 'modified',
          beforeContent: '',
          afterContent: `${forbiddenSelector} { color: red; }`,
        },
      ],
      repositoryFiles: {
        [STYLE_PATH]: `${forbiddenSelector} { color: red; }`,
        [DECOR_PATH]: '',
      },
    });

    assert.ok(codes(result).includes('FORBIDDEN_ROUTE_TARGET'), forbiddenSelector);
  }
});

test('rejects unrelated route imports from an approved Chat production path', () => {
  const source = "import { SchedulePage } from '@/features/schedule/SchedulePage';";
  const result = audit({
    changedFiles: [
      {
        path: DECOR_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: source,
      },
    ],
    repositoryFiles: {
      [STYLE_PATH]: validCss(),
      [DECOR_PATH]: source,
    },
  });

  assert.ok(codes(result).includes('FORBIDDEN_ROUTE_TARGET'));
});

test('rejects relative unrelated-route imports from an approved Chat production path', () => {
  for (const source of [
    "import { SchedulePage } from '../schedule/SchedulePage';",
    "import /* scope-evasion */ '../schedule/SchedulePage';",
    "const SchedulePage = require('../schedule/SchedulePage');",
    "const SchedulePage = require /* gap */ ( /* gap */ '../schedule/SchedulePage');",
    'const SchedulePage = import(`../schedule/SchedulePage`);',
    "const SchedulePage = import('../sche' + 'dule/SchedulePage');",
    "const SchedulePage = require(('../schedule/SchedulePage'));",
    "const label = `${import('../schedule/SchedulePage')}`;",
    'const Page = import(`../${route}/Page`);',
    "const SchedulePage = require('../sche\\u0064ule/SchedulePage');",
  ]) {
    const result = audit({
      changedFiles: [
        {
          path: DECOR_PATH,
          status: 'modified',
          beforeContent: '',
          afterContent: source,
        },
      ],
      repositoryFiles: {
        [STYLE_PATH]: validCss(),
        [DECOR_PATH]: source,
      },
    });

    assert.ok(codes(result).includes('FORBIDDEN_ROUTE_TARGET'), source);
  }
});

test('rejects indeterminate dynamic import and require arguments', () => {
  for (const source of [
    'const Page = import(routeName);',
    'const Page = require(getRoute());',
    'const Page = import();',
    'const Page = require();',
  ]) {
    const result = audit({
      changedFiles: [
        {
          path: DECOR_PATH,
          status: 'modified',
          beforeContent: '',
          afterContent: source,
        },
      ],
      repositoryFiles: {
        [STYLE_PATH]: validCss(),
        [DECOR_PATH]: source,
      },
    });

    assert.ok(codes(result).includes('FORBIDDEN_ROUTE_TARGET'), source);
  }
});

test('ignores comment-only route imports and preserves Chat-local module specifiers', () => {
  const source = `// require('../schedule/SchedulePage')
/* import(\`../schedule/SchedulePage\`) */
// import('../sche' + 'dule/SchedulePage')
/* require(('../schedule/SchedulePage')) */
import { OrigamiChatDecor } from './OrigamiChatDecor';
const chatThread = require('../chat/ChatThread');
const chatView = import(\`../chat/ChatView\`);
const react = require('react');
const packageView = import('@scope/package-view');
const documentation = \`import('../schedule/SchedulePage')\`;
export { OrigamiChatDecor, chatThread, chatView, react, packageView, documentation };
`;
  const result = audit({
    changedFiles: [
      {
        path: DECOR_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: source,
      },
    ],
    repositoryFiles: {
      [STYLE_PATH]: validCss(),
      [DECOR_PATH]: source,
    },
  });

  assert.equal(result.ok, true);
});

test('rejects unscoped global theme token replacement', () => {
  const result = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: "html[data-theme='vibespace'] { --background: 30 50% 95%; }",
      },
    ],
    repositoryFiles: { [STYLE_PATH]: '', [DECOR_PATH]: '' },
  });

  assert.ok(codes(result).includes('GLOBAL_THEME_TOKEN_REPLACEMENT'));
  assert.ok(codes(result).includes('SELECTOR_SCOPE_ESCAPE'));
});

test('rejects remote URLs in changed Origami production source', () => {
  const result = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: `${CHAT_STAGE_SELECTOR} { background-image: url('https://example.test/paper.png'); }`,
      },
    ],
    repositoryFiles: { [STYLE_PATH]: '', [DECOR_PATH]: '' },
  });

  assert.ok(codes(result).includes('REMOTE_URL'));
});

test('does not mistake approved dependency metadata URLs for remote presentation sources', () => {
  const lockPath = 'package-lock.json';
  const allowlist = validAllowlist({
    approvedPaths: [...validAllowlist().approvedPaths, lockPath],
  });
  const result = audit({
    allowlist,
    changedFiles: [
      { path: STYLE_PATH, status: 'modified', beforeContent: '', afterContent: validCss() },
      { path: ASSET_PATH, status: 'added', binary: true },
      {
        path: lockPath,
        status: 'modified',
        beforeContent: '{"packages":{}}',
        afterContent:
          '{"packages":{"node_modules/example":{"resolved":"https://registry.npmjs.org/example/-/example-1.0.0.tgz"}}}',
      },
    ],
  });

  assert.equal(result.ok, true);
});

test('rejects the complete target screenshot as a production background', () => {
  const result = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: `${CHAT_STAGE_SELECTOR} { background-image: url('/assets/origami-chat/target-chat.png'); }`,
      },
    ],
    repositoryFiles: { [STYLE_PATH]: '', [DECOR_PATH]: '' },
  });

  assert.ok(codes(result).includes('FULL_TARGET_BACKGROUND'));
});

test('rejects a target-sized screenshot hidden behind an approved asset name', () => {
  for (const targetContent of [
    targetSizedPngHeader(),
    targetSizedLossyWebpHeader(),
    targetSizedLosslessWebpHeader(),
  ]) {
    const result = audit({
      changedFiles: [
        { path: STYLE_PATH, status: 'modified', beforeContent: '', afterContent: validCss() },
        {
          path: ASSET_PATH,
          status: 'added',
          binary: true,
          afterContent: targetContent,
        },
      ],
      repositoryFiles: {
        [STYLE_PATH]: validCss(),
        [DECOR_PATH]: '',
        [ASSET_PATH]: targetContent,
      },
    });

    assert.ok(codes(result).includes('FULL_TARGET_BACKGROUND'));
  }
});

test('rejects a target-sized screenshot embedded as a data URI', () => {
  const dataUri = `data:image/png;base64,${targetSizedPngHeader().toString('base64')}`;
  const source = `${CHAT_STAGE_SELECTOR} { background-image: url('${dataUri}'); }`;
  const result = audit({
    allowlist: validAllowlist({
      approvedPaths: [STYLE_PATH, DECOR_PATH],
      approvedAssets: [],
    }),
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: source,
      },
    ],
    repositoryFiles: { [STYLE_PATH]: source, [DECOR_PATH]: '' },
  });

  assert.ok(codes(result).includes('FULL_TARGET_BACKGROUND'));
});

test('rejects every escaping member of a comma-separated selector list', () => {
  const result = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: `${CHAT_STAGE_SELECTOR}, body .origami-chat-escape { color: #54362a; }`,
      },
    ],
    repositoryFiles: { [STYLE_PATH]: '', [DECOR_PATH]: '' },
  });

  assert.ok(codes(result).includes('SELECTOR_SCOPE_ESCAPE'));
  assert.ok(codes(result).includes('SELECTOR_NOT_APPROVED'));
  assert.match(
    result.violations.find(({ code }) => code === 'SELECTOR_SCOPE_ESCAPE').message,
    /body \.origami-chat-escape/u,
  );
});

test('rejects traversal, absolute, backslash, and remote allowlist paths', () => {
  for (const unsafePath of [
    '../outside.css',
    '/absolute.css',
    'C:/outside.css',
    'app\\src\\styles\\origami-chat.css',
    'https://example.test/origami.css',
  ]) {
    assert.throws(
      () =>
        validateScopeAllowlist(
          validAllowlist({ approvedPaths: [unsafePath, DECOR_PATH, ASSET_PATH] }),
          { rootDirectory: 'C:/synthetic/vibespace' },
        ),
      (error) => {
        assert.ok(error instanceof ScopeAuditInputError);
        assert.equal(error.code, 'ALLOWLIST_PATH_INVALID');
        return true;
      },
    );
  }

  const changedTraversal = audit({
    changedFiles: [{ path: '../outside.css', status: 'modified', afterContent: validCss() }],
  });
  assert.deepEqual(codes(changedTraversal), ['CHANGED_PATH_INVALID']);
});

test('rejects selectors that mention Chat only inside an excluding negation', () => {
  const excludingSelector =
    "html[data-theme='vibespace'] body:not(:has(main[aria-label='Workspace'] [data-vibespace-page='chat'])) .origami-escape";
  assert.throws(
    () =>
      validateScopeAllowlist(
        validAllowlist({
          approvedSelectors: [CHAT_STAGE_SELECTOR, CRANE_SELECTOR, excludingSelector],
        }),
        { rootDirectory: 'C:/synthetic/vibespace' },
      ),
    (error) => error instanceof ScopeAuditInputError && error.code === 'ALLOWLIST_SELECTOR_SCOPE',
  );
});

test('rejects malformed, extra-key, and duplicate allowlist entries with stable input codes', () => {
  const cases = [
    [{ ...validAllowlist(), schemaVersion: 2 }, 'ALLOWLIST_SCHEMA'],
    [{ ...validAllowlist(), unexpected: true }, 'ALLOWLIST_KEYS'],
    [
      {
        ...validAllowlist(),
        approvedPaths: [...validAllowlist().approvedPaths, STYLE_PATH],
      },
      'ALLOWLIST_DUPLICATE_PATH',
    ],
    [
      {
        ...validAllowlist(),
        approvedSelectors: [...validAllowlist().approvedSelectors, CHAT_STAGE_SELECTOR],
      },
      'ALLOWLIST_DUPLICATE_SELECTOR',
    ],
    [
      {
        ...validAllowlist(),
        approvedAssets: [...validAllowlist().approvedAssets, ASSET_PATH],
      },
      'ALLOWLIST_DUPLICATE_ASSET',
    ],
  ];

  for (const [allowlist, expectedCode] of cases) {
    assert.throws(
      () =>
        validateScopeAllowlist(allowlist, {
          rootDirectory: 'C:/synthetic/vibespace',
        }),
      (error) => {
        assert.ok(error instanceof ScopeAuditInputError);
        assert.equal(error.code, expectedCode);
        return true;
      },
    );
  }
});

test('rejects undeclared and declared-but-unused Origami assets', () => {
  const undeclared = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: `${CHAT_STAGE_SELECTOR} { background: url('/assets/origami-chat/ghost.webp'); }`,
      },
    ],
    repositoryFiles: {
      [STYLE_PATH]: `${CHAT_STAGE_SELECTOR} { background: url('/assets/origami-chat/ghost.webp'); }`,
      [DECOR_PATH]: '',
    },
  });
  assert.ok(codes(undeclared).includes('UNDECLARED_ASSET'));

  const unused = audit({
    changedFiles: [{ path: ASSET_PATH, status: 'added', binary: true }],
    repositoryFiles: { [STYLE_PATH]: '', [DECOR_PATH]: '' },
  });
  assert.deepEqual(codes(unused), ['UNUSED_ASSET']);
});

test('does not count a comment-only asset mention as production use', () => {
  const source = `${CHAT_STAGE_SELECTOR} { color: #54362a; }
/* /assets/origami-chat/crane.webp is intentionally not used. */
`;
  const result = audit({
    changedFiles: [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: '',
        afterContent: source,
      },
      { path: ASSET_PATH, status: 'added', binary: true },
    ],
    repositoryFiles: { [STYLE_PATH]: source, [DECOR_PATH]: '' },
  });

  assert.ok(codes(result).includes('UNUSED_ASSET'));
});

test('rejects production deletion and generated artifact paths', () => {
  const deletion = audit({
    changedFiles: [{ path: DECOR_PATH, status: 'deleted', beforeContent: '<div />' }],
  });
  assert.deepEqual(codes(deletion), ['PRODUCTION_DELETION']);

  const generated = audit({
    changedFiles: [
      {
        path: '.artifacts/origami-chat/chat-diff.png',
        status: 'added',
        binary: true,
      },
    ],
  });
  assert.ok(codes(generated).includes('FORBIDDEN_GENERATED_PATH'));

  const privateLog = audit({
    changedFiles: [
      { path: 'private/capture-session.log', status: 'added', afterContent: 'secret' },
    ],
  });
  assert.ok(codes(privateLog).includes('FORBIDDEN_GENERATED_PATH'));
});

test('collects a caller-supplied Git comparison range through an injected argv-only boundary', () => {
  const calls = [];
  const outputs = new Map([
    [
      'diff --name-status -z --no-renames BASE..HEAD --',
      { status: 0, stdout: `M\0${STYLE_PATH}\0A\0${ASSET_PATH}\0`, stderr: '' },
    ],
    [
      `ls-tree -z BASE -- ${STYLE_PATH}`,
      { status: 0, stdout: `100644 blob a1b2c3\t${STYLE_PATH}\0`, stderr: '' },
    ],
    [
      `ls-tree -z HEAD -- ${STYLE_PATH}`,
      { status: 0, stdout: `100644 blob d4e5f6\t${STYLE_PATH}\0`, stderr: '' },
    ],
    [
      `ls-tree -z HEAD -- ${ASSET_PATH}`,
      { status: 0, stdout: `100644 blob abc123\t${ASSET_PATH}\0`, stderr: '' },
    ],
    [`show BASE:${STYLE_PATH}`, { status: 0, stdout: 'before css', stderr: '' }],
    [`show HEAD:${STYLE_PATH}`, { status: 0, stdout: 'after css', stderr: '' }],
    [`show HEAD:${ASSET_PATH}`, { status: 0, stdout: Buffer.from('binary bytes'), stderr: '' }],
  ]);
  const runGit = (argumentsList) => {
    calls.push(argumentsList);
    const result = outputs.get(argumentsList.join(' '));
    assert.ok(result, `unexpected Git call: ${argumentsList.join(' ')}`);
    return result;
  };

  const changedFiles = collectGitChangedFiles({
    rootDirectory: 'C:/synthetic/vibespace',
    comparisonRange: 'BASE..HEAD',
    runGit,
  });

  assert.deepEqual(
    changedFiles.map(({ path, status, beforeContent, afterContent }) => ({
      path,
      status,
      beforeContent,
      afterContent,
    })),
    [
      {
        path: STYLE_PATH,
        status: 'modified',
        beforeContent: 'before css',
        afterContent: 'after css',
      },
      {
        path: ASSET_PATH,
        status: 'added',
        beforeContent: undefined,
        afterContent: Buffer.from('binary bytes'),
      },
    ],
  );
  assert.deepEqual(calls[0], ['diff', '--name-status', '-z', '--no-renames', 'BASE..HEAD', '--']);
});

test('uses the merge base as before-content for a triple-dot comparison', () => {
  const calls = [];
  const outputs = new Map([
    [
      'diff --name-status -z --no-renames FEATURE...MAIN --',
      { status: 0, stdout: `M\0${STYLE_PATH}\0`, stderr: '' },
    ],
    ['merge-base FEATURE MAIN', { status: 0, stdout: 'MERGE_BASE\n', stderr: '' }],
    [
      `ls-tree -z MERGE_BASE -- ${STYLE_PATH}`,
      { status: 0, stdout: `100644 blob a1b2c3\t${STYLE_PATH}\0`, stderr: '' },
    ],
    [
      `ls-tree -z MAIN -- ${STYLE_PATH}`,
      { status: 0, stdout: `100644 blob d4e5f6\t${STYLE_PATH}\0`, stderr: '' },
    ],
    [`show MERGE_BASE:${STYLE_PATH}`, { status: 0, stdout: 'merge-base css', stderr: '' }],
    [`show MAIN:${STYLE_PATH}`, { status: 0, stdout: 'main css', stderr: '' }],
  ]);
  const runGit = (argumentsList) => {
    calls.push(argumentsList);
    const result = outputs.get(argumentsList.join(' '));
    assert.ok(result, `unexpected Git call: ${argumentsList.join(' ')}`);
    return result;
  };

  const changedFiles = collectGitChangedFiles({
    rootDirectory: 'C:/synthetic/vibespace',
    comparisonRange: 'FEATURE...MAIN',
    runGit,
  });

  assert.equal(changedFiles[0].beforeContent, 'merge-base css');
  assert.equal(changedFiles[0].afterContent, 'main css');
  assert.deepEqual(calls[1], ['merge-base', 'FEATURE', 'MAIN']);
});

test('rejects a Git-range binary asset whose tree mode is a symlink', () => {
  const outputs = new Map([
    [
      'diff --name-status -z --no-renames BASE..HEAD --',
      { status: 0, stdout: `A\0${ASSET_PATH}\0`, stderr: '' },
    ],
    [
      `ls-tree -z HEAD -- ${ASSET_PATH}`,
      { status: 0, stdout: `120000 blob deadbeef\t${ASSET_PATH}\0`, stderr: '' },
    ],
  ]);
  const runGit = (argumentsList) => {
    const result = outputs.get(argumentsList.join(' '));
    assert.ok(result, `unexpected Git call: ${argumentsList.join(' ')}`);
    return result;
  };

  assert.throws(
    () =>
      collectGitChangedFiles({
        rootDirectory: 'C:/synthetic/vibespace',
        comparisonRange: 'BASE..HEAD',
        runGit,
      }),
    (error) => error instanceof ScopeAuditInputError && error.code === 'GIT_FILE_MODE_INVALID',
  );
});

test('rejects a Git runner that returns UTF-8-corrupted text for binary content', () => {
  const outputs = new Map([
    [
      'diff --name-status -z --no-renames BASE..HEAD --',
      { status: 0, stdout: `A\0${ASSET_PATH}\0`, stderr: '' },
    ],
    [
      `ls-tree -z HEAD -- ${ASSET_PATH}`,
      { status: 0, stdout: `100644 blob deadbeef\t${ASSET_PATH}\0`, stderr: '' },
    ],
    [
      `show HEAD:${ASSET_PATH}`,
      { status: 0, stdout: targetSizedPngHeader().toString('utf8'), stderr: '' },
    ],
  ]);
  const corruptingRunner = (argumentsList) => {
    const result = outputs.get(argumentsList.join(' '));
    assert.ok(result, `unexpected Git call: ${argumentsList.join(' ')}`);
    return result;
  };

  assert.throws(
    () =>
      collectGitChangedFiles({
        rootDirectory: 'C:/synthetic/vibespace',
        comparisonRange: 'BASE..HEAD',
        runGit: corruptingRunner,
      }),
    (error) => error instanceof ScopeAuditInputError && error.code === 'GIT_BINARY_OUTPUT_INVALID',
  );
});

test('real Git range mode preserves high-bit target bytes and rejects the renamed asset', async () => {
  const repository = createRepository();
  try {
    repository.write('scope.json', `${JSON.stringify(validAllowlist())}\n`);
    repository.write(STYLE_PATH, '');
    repository.write(DECOR_PATH, 'export const OrigamiChatDecor = () => null;');
    runGit(repository.rootDirectory, ['init', '-q']);
    runGit(repository.rootDirectory, ['config', 'user.email', 'scope-audit@example.test']);
    runGit(repository.rootDirectory, ['config', 'user.name', 'Scope Audit Test']);
    runGit(repository.rootDirectory, ['add', '--', '.']);
    runGit(repository.rootDirectory, ['commit', '-qm', 'base']);
    const base = runGit(repository.rootDirectory, ['rev-parse', 'HEAD']);

    repository.write(STYLE_PATH, validCss());
    repository.write(ASSET_PATH, targetSizedPngHeader());
    runGit(repository.rootDirectory, ['add', '--', '.']);
    runGit(repository.rootDirectory, ['commit', '-qm', 'target asset']);
    const head = runGit(repository.rootDirectory, ['rev-parse', 'HEAD']);
    const stdout = [];
    const stderr = [];

    const exitCode = await runScopeAuditCli({
      argumentsList: [
        '--root',
        repository.rootDirectory,
        '--allowlist',
        'scope.json',
        '--range',
        `${base}..${head}`,
      ],
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(stderr, []);
    const receipt = JSON.parse(stdout.join(''));
    assert.ok(
      receipt.violations.some(
        ({ code, path }) => code === 'FULL_TARGET_BACKGROUND' && path === ASSET_PATH,
      ),
    );
  } finally {
    repository.cleanup();
  }
});

test('parses exactly one range or explicit changed-file mode and rejects ambiguous CLI input', () => {
  assert.deepEqual(
    parseScopeAuditArguments([
      '--allowlist',
      'scope.json',
      '--range',
      'BASE..HEAD',
      '--root',
      'C:/repo',
    ]),
    {
      allowlistPath: 'scope.json',
      comparisonRange: 'BASE..HEAD',
      changedFilePaths: [],
      rootDirectory: 'C:/repo',
    },
  );
  assert.deepEqual(
    parseScopeAuditArguments([
      '--allowlist',
      'scope.json',
      '--changed-file',
      STYLE_PATH,
      '--changed-file',
      ASSET_PATH,
    ]),
    {
      allowlistPath: 'scope.json',
      changedFilePaths: [STYLE_PATH, ASSET_PATH],
      rootDirectory: undefined,
    },
  );
  assert.throws(
    () =>
      parseScopeAuditArguments([
        '--allowlist',
        'scope.json',
        '--range',
        'BASE..HEAD',
        '--changed-file',
        STYLE_PATH,
      ]),
    (error) => error instanceof ScopeAuditInputError && error.code === 'CLI_MODE',
  );
});

test('runs explicit-file CLI audit without Git and emits a deterministic JSON receipt', async () => {
  const repository = createRepository();
  try {
    const allowlist = validAllowlist();
    repository.write('scope.json', `${JSON.stringify(allowlist)}\n`);
    repository.write(STYLE_PATH, validCss());
    repository.write(DECOR_PATH, '<div className="origami-chat-crane" aria-hidden="true" />');
    repository.write(ASSET_PATH, 'synthetic-binary');
    const run = async () => {
      const stdout = [];
      const stderr = [];
      const exitCode = await runScopeAuditCli({
        argumentsList: [
          '--root',
          repository.rootDirectory,
          '--allowlist',
          'scope.json',
          '--changed-file',
          STYLE_PATH,
          '--changed-file',
          ASSET_PATH,
        ],
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
        runGit: () => {
          throw new Error('Git must not run in explicit-file mode');
        },
      });
      return { exitCode, stderr, stdout: stdout.join('') };
    };

    const first = await run();
    const second = await run();
    assert.deepEqual(second, first);
    assert.equal(first.exitCode, 0);
    assert.deepEqual(first.stderr, []);
    const receipt = JSON.parse(first.stdout);
    assert.equal(receipt.ok, true);
    assert.deepEqual(receipt.auditedPaths, [ASSET_PATH, STYLE_PATH]);
    assert.deepEqual(receipt.violations, []);
  } finally {
    repository.cleanup();
  }
});

test('explicit-file mode rejects regular and dangling asset reparse-point paths', async () => {
  for (const target of ['asset-store', 'missing-store']) {
    const repository = createRepository();
    try {
      const allowlist = validAllowlist();
      repository.write('scope.json', `${JSON.stringify(allowlist)}\n`);
      repository.write(STYLE_PATH, validCss());
      repository.write(DECOR_PATH, '<div className="origami-chat-crane" aria-hidden="true" />');
      if (target === 'asset-store') {
        repository.write('asset-store/crane.webp', 'synthetic-binary');
      }
      repository.junction('app/public/assets/origami-chat', target);
      const stdout = [];
      const stderr = [];

      const exitCode = await runScopeAuditCli({
        argumentsList: [
          '--root',
          repository.rootDirectory,
          '--allowlist',
          'scope.json',
          '--changed-file',
          STYLE_PATH,
          '--changed-file',
          ASSET_PATH,
        ],
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      });

      assert.equal(exitCode, 2, target);
      assert.deepEqual(stdout, []);
      assert.match(stderr.join(''), /CHANGED_PATH_SYMLINK/u);
    } finally {
      repository.cleanup();
    }
  }
});
