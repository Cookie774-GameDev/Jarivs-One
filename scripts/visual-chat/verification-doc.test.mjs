import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const docPath = path.join(root, 'docs', 'origami-chat-verification.md');
const sha256File = (rel) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(root, rel)))
    .digest('hex');

const baseline = readJson('tests/visual/chat/baseline-metadata.json');
const ledger = readJson('tests/visual/chat/pass-ledger.json');
const integrity = readJson('tests/visual/chat/reference/reference-integrity.json');
const manifest = readJson('tests/visual/chat/asset-manifest.json');
const spec = readJson('tests/visual/chat/reference/reference-spec.json');
const finalMetadata = readJson('tests/visual/chat/final-metadata.json');
const scopeAllowlist = readJson('tests/visual/chat/scope-allowlist.json');
const liveEvidence = readJson('tests/visual/chat/live-verification-evidence.json');

const EVIDENCE_COMMIT = 'e71cb480cbbcfccdbc5cd2d7f772fb6a8ca4a774';
const LEDGER_PATH = 'tests/visual/chat/pass-ledger.json';
const INTERACTION_RECEIPT_PATH =
  '.artifacts/origami-chat/origami-final-interaction-20260729-i.receipt.json';
const NONCHAT_RECEIPT_PATH =
  '.artifacts/origami-chat/origami-final-nonchat-20260729-g.receipt.json';
const FINAL_SCREENSHOT_PATH = '.artifacts/origami-chat/pass-012-assistant-spacing/chat.png';
const FINAL_METADATA_PATH = 'tests/visual/chat/final-metadata.json';
const SCOPE_ALLOWLIST_PATH = 'tests/visual/chat/scope-allowlist.json';
const LIVE_EVIDENCE_PATH = 'tests/visual/chat/live-verification-evidence.json';
const ignoreLocalArtifacts = process.env.ORIGAMI_IGNORE_LOCAL_ARTIFACTS === '1';

const optionalJson = (rel) => {
  if (ignoreLocalArtifacts) return null;
  const absolute = path.join(root, rel);
  return fs.existsSync(absolute) ? JSON.parse(fs.readFileSync(absolute, 'utf8')) : null;
};
const interactionReceipt = optionalJson(INTERACTION_RECEIPT_PATH);
const nonChatReceipt = optionalJson(NONCHAT_RECEIPT_PATH);

const EXPECTED_EVIDENCE_HASHES = {
  interaction: '727ccb81dd975243f5f92af6eed802350410615a77343c6c7fb637797b67a826',
  nonChat: '86f29a6c7aa937460aafb46d67adfd5146a3344d1f7158ece8def93cc2737090',
  finalScreenshot: '2f5a34cdbb8b1f1b54f523f13db3f2864acf67a392b02561cca65fe1c6cb9582',
  finalMetadata: '99ccb5c6e13af5a172fa4c0d61e136cd56a0631f4596c6787a0d96e4e487a40c',
  scopeAllowlist: '80c0699c1c446e9500b5fdbfc574b2cb30e3c35583682e5b2190c448b02fa596',
  liveEvidence: 'a86b1fad4b93b2d059a46f025f98d288cd258e87fe12d5209ead0c7837c0bb26',
};

const COORDINATOR_FINAL_COMPARISON = {
  fullDiff: 0.17304709944119306,
  weightedDiff: 0.21474210831767848,
};

const HUMAN_MISMATCHES = [
  'header/Jarvis positioning',
  'sidebar/foliage overlap',
  'pet covering upper-left crane',
  'typography/assistant layout',
  'composer/session alignment',
  'flower/crane scale/placement',
];

const EXPECTED_PRODUCTION_PATHS = [
  'app/public/assets/origami-chat/bottom-mountains.svg',
  'app/public/assets/origami-chat/crane.webp',
  'app/public/assets/origami-chat/jarvis-frame-9slice.webp',
  'app/public/assets/origami-chat/left-foliage.webp',
  'app/public/assets/origami-chat/panel-9slice.webp',
  'app/public/assets/origami-chat/paper-base.webp',
  'app/public/assets/origami-chat/paper-grain.webp',
  'app/public/assets/origami-chat/right-flower.webp',
  'app/public/assets/origami-chat/sidebar-active-row-9slice.webp',
  'app/public/assets/origami-chat/sidebar-row-9slice.webp',
  'app/public/assets/origami-chat/top-ribbon.svg',
  'app/src/features/chat/ChatView.tsx',
  'app/src/features/chat/OrigamiChatDecor.tsx',
  'app/src/main.tsx',
  'app/src/styles/origami-chat.css',
  'app/src/styles/vibespace-theme.css',
];

const HASH_RE = /\b[0-9a-f]{64}\b/g;
const SCORE_RE = /\b0\.\d{6,}\b/g;
const PLACEHOLDER_RE = /\b(?:TODO|TBD|FIXME|XXX|PLACEHOLDER)\b|<fill>|\{\{|\}\}/;

const REQUIRED_FIELDS = [
  'Baseline Full-Page Diff Ratio',
  'Baseline Weighted Diff Ratio',
  'Baseline Per-Region Diff Table',
  'Baseline Evidence Hashes',
  'Reference Target And Contract Integrity',
  'Locked Design Specification',
  'Design Tokens',
  'Files Changed',
  'Files And Assets Inventory',
  'Tool Accountability',
  'GitHub And Live-Service Disposition',
  'Chat-Only Scope',
  'Measured Pass Ledger',
  'Canonical Viewport And Geometry',
  'Functional Smoke Tests',
  'Other-Route Appearance',
  'Final Full-Page Diff Ratio',
  'Final Weighted Diff Ratio',
  'Final Per-Region Diff Table',
  'Final Pass Count',
  'Final Screenshot Path',
  'Final Visible Mismatches',
  'Pixel-Perfect Attestation',
];

const PIXEL_FORBIDDEN = [
  /pixel[- ]?perfect\s+(?:match|render|output|result|copy)/i,
  /\bis\s+pixel[- ]?perfect\b/i,
  /\bidentical\s+to\s+the\s+reference\b/i,
  /\b100%\s+(?:identical|match|pixel)/i,
  /\bzero\s+(?:pixel\s+)?diff/i,
  /\bperfect\s+1:1\s+match\b/i,
];

const LIVE_FORBIDDEN = [
  /\bpushed\s+to\s+github\b/i,
  /\bmerged\s+(?:the\s+)?pull\s+request\b/i,
  /\bopened\s+a\s+pull\s+request\b/i,
  /\bci\s+(?:passed|is\s+green|succeeded)\b/i,
  /\bdeployed\s+to\s+production\b/i,
  /\blive\s+(?:charge|refund|payment)\b/i,
  /\bcreated\s+a\s+live\b/i,
];

function loadDoc() {
  assert.ok(fs.existsSync(docPath), 'expected docs/origami-chat-verification.md to exist');
  const text = fs.readFileSync(docPath, 'utf8');
  assert.ok(text.trim().length > 0, 'verification doc must not be empty');
  return text;
}

function fieldSections(doc) {
  const map = new Map();
  let current = null;
  let buf = [];
  for (const line of doc.split('\n')) {
    const heading = line.match(/^###\s+(.*)$/);
    if (heading) {
      if (current !== null) map.set(current, buf.join('\n'));
      current = heading[1].trim();
      buf = [];
      continue;
    }
    if (current !== null) {
      if (/^##\s+/.test(line)) {
        map.set(current, buf.join('\n'));
        current = null;
        buf = [];
      } else {
        buf.push(line);
      }
    }
  }
  if (current !== null) map.set(current, buf.join('\n'));
  return map;
}

function statusOf(sectionText) {
  const m = sectionText.match(/-\s*Status:\s*([A-Z_]+)/);
  return m ? m[1] : null;
}

function overallStatus(doc) {
  const m = doc.match(/-\s*Overall Status:\s*([A-Z]+)/);
  return m ? m[1] : null;
}

function jsonFences(doc) {
  return [...doc.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

function boundBaselineBlock(doc) {
  const fences = jsonFences(doc);
  assert.ok(fences.length >= 1, 'expected a Machine-Bound Baseline ```json block');
  return JSON.parse(fences[0]);
}

function hasFinalBindBlock(doc) {
  return jsonFences(doc).some((body) => {
    try {
      const value = JSON.parse(body);
      return (
        Object.prototype.hasOwnProperty.call(value, 'final') &&
        Object.prototype.hasOwnProperty.call(value, 'passLedgerSha256')
      );
    } catch {
      return false;
    }
  });
}

function boundFinalBlock(doc) {
  for (const body of jsonFences(doc)) {
    const value = JSON.parse(body);
    if (
      Object.prototype.hasOwnProperty.call(value, 'final') &&
      Object.prototype.hasOwnProperty.call(value, 'passLedgerSha256')
    ) {
      return value;
    }
  }
  assert.fail('expected a Machine-Bound Final Metadata ```json block');
}

function collectHashes(value, set = new Set()) {
  if (typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)) {
    set.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectHashes(item, set);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectHashes(item, set);
  }
  return set;
}

function allowedHashUniverse() {
  const set = collectHashes(baseline);
  collectHashes(ledger, set);
  collectHashes(integrity, set);
  collectHashes(manifest, set);
  collectHashes(finalMetadata, set);
  collectHashes(scopeAllowlist, set);
  collectHashes(liveEvidence, set);
  if (interactionReceipt) collectHashes(interactionReceipt, set);
  if (nonChatReceipt) collectHashes(nonChatReceipt, set);
  for (const hash of Object.values(EXPECTED_EVIDENCE_HASHES)) set.add(hash);
  return set;
}

function boundScoreSet() {
  const set = new Set();
  set.add(baseline.scores.fullDiffRatio);
  set.add(baseline.scores.weightedDiffRatio);
  for (const value of Object.values(baseline.scores.regions)) set.add(value);
  set.add(finalMetadata.final.fullDiff);
  set.add(finalMetadata.final.weightedDiff);
  for (const value of Object.values(finalMetadata.final.regions)) set.add(value);
  set.add(COORDINATOR_FINAL_COMPARISON.fullDiff);
  set.add(COORDINATOR_FINAL_COMPARISON.weightedDiff);
  return set;
}

test('verification doc exists and is non-empty', () => {
  loadDoc();
});

test('overall status is a valid gate token', () => {
  const status = overallStatus(loadDoc());
  assert.ok(status, 'doc must declare an Overall Status');
  assert.ok(
    status === 'INCOMPLETE' || status === 'FINAL',
    `Overall Status must be INCOMPLETE or FINAL, got ${status}`,
  );
});

test('every required field section is present with a valid status', () => {
  const sections = fieldSections(loadDoc());
  for (const field of REQUIRED_FIELDS) {
    assert.ok(sections.has(field), `missing required field section: ${field}`);
    const status = statusOf(sections.get(field));
    assert.ok(
      status === 'VERIFIED' || status === 'PENDING_EVIDENCE',
      `field "${field}" must have Status VERIFIED or PENDING_EVIDENCE, got ${status}`,
    );
  }
});

test('every 64-character hash cited is bound to committed evidence', () => {
  const doc = loadDoc();
  const allowed = allowedHashUniverse();
  const cited = [...new Set(doc.match(HASH_RE) || [])];
  assert.ok(cited.length > 0, 'doc should cite at least one committed evidence hash');
  for (const hash of cited) {
    assert.ok(allowed.has(hash), `unbound SHA-256 cited in doc: ${hash}`);
  }
});

test('tracked reference and asset hashes and inventory counts are re-derived', () => {
  const doc = loadDoc();
  assert.ok(
    doc.includes(`${integrity.entries.length} SHA-256 entries`),
    'reference-integrity entry count must match tracked metadata',
  );
  for (const entry of integrity.entries) {
    const rel = path.posix.join('tests/visual/chat/reference', entry.path);
    const bytes = fs.readFileSync(path.join(root, rel));
    assert.equal(bytes.length, entry.bytes, `${rel} byte count`);
    assert.equal(sha256File(rel), entry.sha256, `${rel} SHA-256`);
  }

  const assets = Object.values(manifest.assets);
  assert.ok(
    doc.includes(`inventories ${assets.length} assets`),
    'asset inventory count must match tracked metadata',
  );
  for (const asset of assets) {
    assert.equal(sha256File(asset.file), asset.sha256, `${asset.file} SHA-256`);
  }
});

test('coordinator-verified evidence files have the exact accepted hashes', () => {
  assert.equal(liveEvidence.interaction.receiptSha256, EXPECTED_EVIDENCE_HASHES.interaction);
  assert.equal(liveEvidence.nonChat.receiptSha256, EXPECTED_EVIDENCE_HASHES.nonChat);
  assert.equal(liveEvidence.finalScreenshot.sha256, EXPECTED_EVIDENCE_HASHES.finalScreenshot);
  assert.equal(sha256File(LIVE_EVIDENCE_PATH), EXPECTED_EVIDENCE_HASHES.liveEvidence);
  assert.equal(sha256File(FINAL_METADATA_PATH), EXPECTED_EVIDENCE_HASHES.finalMetadata);
  assert.equal(sha256File(SCOPE_ALLOWLIST_PATH), EXPECTED_EVIDENCE_HASHES.scopeAllowlist);
  for (const [relativePath, expectedHash] of [
    [INTERACTION_RECEIPT_PATH, EXPECTED_EVIDENCE_HASHES.interaction],
    [NONCHAT_RECEIPT_PATH, EXPECTED_EVIDENCE_HASHES.nonChat],
    [FINAL_SCREENSHOT_PATH, EXPECTED_EVIDENCE_HASHES.finalScreenshot],
  ]) {
    if (!ignoreLocalArtifacts && fs.existsSync(path.join(root, relativePath))) {
      assert.equal(sha256File(relativePath), expectedHash, `${relativePath} local cross-check`);
    }
  }
  assert.equal(
    finalMetadata.final.evidence.screenshotSha256,
    EXPECTED_EVIDENCE_HASHES.finalScreenshot,
    'final metadata must bind the accepted screenshot',
  );
});

test('exact scope allowlist and production inventory remain bound', () => {
  const chatGate =
    "html[data-theme='vibespace'] body:has(main[aria-label='Workspace'] [data-vibespace-page='chat'])";
  assert.equal(scopeAllowlist.schemaVersion, 1);
  assert.equal(scopeAllowlist.approvedPaths.length, 71);
  assert.equal(scopeAllowlist.approvedSelectors.length, 57);
  assert.equal(scopeAllowlist.approvedAssets.length, 11);
  assert.ok(
    scopeAllowlist.approvedSelectors.every((selector) => selector.startsWith(chatGate)),
    'every approved selector must stay under the exact Chat gate',
  );
  assert.deepEqual(
    scopeAllowlist.approvedAssets,
    EXPECTED_PRODUCTION_PATHS.filter((item) => item.startsWith('app/public/assets/')),
  );
  const productionPaths = scopeAllowlist.approvedPaths.filter(
    (item) => item.startsWith('app/') && !item.endsWith('.test.ts') && !item.endsWith('.test.tsx'),
  );
  assert.deepEqual(productionPaths, EXPECTED_PRODUCTION_PATHS);

  const section = fieldSections(loadDoc()).get('Files Changed');
  for (const item of EXPECTED_PRODUCTION_PATHS) {
    assert.ok(section.includes(`\`${item}\``), `report missing production path ${item}`);
  }
  assert.ok(section.includes(`${scopeAllowlist.approvedPaths.length} approved paths`));
  assert.ok(section.includes(`${scopeAllowlist.approvedSelectors.length} approved selectors`));
  assert.ok(section.includes(`${scopeAllowlist.approvedAssets.length} approved assets`));
});

test('real Edge six-case non-Chat receipt proves the Chat gate stayed inactive', () => {
  const evidence = liveEvidence.nonChat;
  assert.equal(evidence.browserSource, 'msedge');
  assert.equal(evidence.cases.length, 6);
  assert.equal(
    evidence.chatGateScope,
    "html[data-theme='vibespace'] body:has(main[aria-label='Workspace'] [data-vibespace-page='chat'])",
  );
  assert.deepEqual(
    evidence.cases.map(({ caseId, route, documentTheme, captured, gateActive }) => ({
      caseId,
      route,
      documentTheme,
      captured,
      gateActive,
    })),
    [
      {
        caseId: 'schedule-vibespace',
        route: 'schedule',
        documentTheme: 'vibespace',
        captured: true,
        gateActive: false,
      },
      {
        caseId: 'terminal-vibespace',
        route: 'terminal',
        documentTheme: 'vibespace',
        captured: true,
        gateActive: false,
      },
      {
        caseId: 'settings-appearance-vibespace',
        route: 'settings-appearance',
        documentTheme: 'vibespace',
        captured: true,
        gateActive: false,
      },
      {
        caseId: 'chat-default',
        route: 'chat',
        documentTheme: 'dark',
        captured: true,
        gateActive: false,
      },
      {
        caseId: 'chat-jarvis',
        route: 'chat',
        documentTheme: 'jarvis',
        captured: true,
        gateActive: false,
      },
      {
        caseId: 'chat-monochrome',
        route: 'chat',
        documentTheme: 'monochrome',
        captured: true,
        gateActive: false,
      },
    ],
  );
  if (nonChatReceipt) {
    assert.equal(nonChatReceipt.browserSource, evidence.browserSource);
    assert.deepEqual(
      nonChatReceipt.verification.cases.map(
        ({ caseId, route, documentTheme, captured, gateActive, sha256 }) => ({
          caseId,
          route,
          documentTheme,
          captured,
          gateActive,
          screenshotSha256: sha256,
        }),
      ),
      evidence.cases,
    );
  }
});

test('real Edge interaction receipt binds controls, submissions, focus, Jarvis, and cleanup', () => {
  const audit = liveEvidence.interaction;
  assert.equal(audit.browserSource, 'msedge');
  assert.deepEqual(audit.structure, {
    root: 1,
    chat: 1,
    session: 1,
    composer: 1,
    thread: 1,
  });
  assert.deepEqual(audit.submission, {
    ctrlEnter: true,
    sendButton: true,
    messagesRendered: true,
  });
  assert.deepEqual(audit.focusTargets, [
    'composer',
    'modelSelector',
    'agentMode',
    'send',
    'dictation',
    'jarvisOpener',
    'sessionExpand',
    'navToggle',
    'createProject',
    'createChat',
  ]);
  assert.deepEqual(audit.reducedMotion, { media: true, jarvisPanel: true });
  assert.deepEqual(audit.sessionExpand, { toggled: true, restored: true });
  assert.equal(audit.modelSelector.opened, true);
  assert.equal(audit.modelSelector.closed, true);
  assert.equal(audit.agentMode.opened, true);
  assert.equal(audit.agentMode.closed, true);
  assert.equal(audit.jarvis.opened, true);
  assert.equal(audit.jarvis.commandCenterExpanded, true);
  assert.equal(audit.jarvis.transcriptPresent, true);
  assert.equal(audit.jarvis.closed, true);
  assert.deepEqual(audit.unexpectedPageErrors, []);
  if (interactionReceipt) {
    assert.deepEqual(interactionReceipt.verification.interaction.structure, audit.structure);
    assert.deepEqual(interactionReceipt.verification.interaction.submission, audit.submission);
    assert.deepEqual(
      interactionReceipt.verification.interaction.focusSemantics.focused,
      audit.focusTargets,
    );
    assert.deepEqual(interactionReceipt.verification.capture.unexpectedPageErrors, []);
  }
});

test('report states the accepted comparison and human-visible mismatch review exactly', () => {
  const doc = loadDoc();
  assert.ok(doc.includes(String(COORDINATOR_FINAL_COMPARISON.fullDiff)));
  assert.ok(doc.includes(String(COORDINATOR_FINAL_COMPARISON.weightedDiff)));
  for (const mismatch of HUMAN_MISMATCHES) {
    assert.ok(doc.includes(mismatch), `report missing visible mismatch: ${mismatch}`);
  }
  for (const [name, hash] of Object.entries(EXPECTED_EVIDENCE_HASHES)) {
    assert.ok(doc.includes(hash), `report missing ${name} evidence hash`);
  }
  for (const evidencePath of [
    INTERACTION_RECEIPT_PATH,
    NONCHAT_RECEIPT_PATH,
    FINAL_SCREENSHOT_PATH,
    FINAL_METADATA_PATH,
    SCOPE_ALLOWLIST_PATH,
    LIVE_EVIDENCE_PATH,
  ]) {
    assert.ok(doc.includes(evidencePath), `report missing evidence path ${evidencePath}`);
  }
});

test('every high-precision score cited is a machine-bound baseline or final value', () => {
  const doc = loadDoc();
  const allowed = boundScoreSet();
  const cited = [...new Set(doc.match(SCORE_RE) || [])];
  assert.ok(cited.length > 0, 'doc should cite machine-bound scores');
  for (const score of cited) {
    assert.ok(allowed.has(Number(score)), `unbound diff score cited as prose: ${score}`);
  }
});

test('machine-bound baseline block equals committed baseline metadata', () => {
  const block = boundBaselineBlock(loadDoc());
  assert.equal(block.sourceCommit, baseline.sourceCommit, 'sourceCommit mismatch');
  assert.equal(block.origamiCommit, baseline.origamiCommit, 'origamiCommit mismatch');
  assert.equal(block.route, baseline.route, 'route mismatch');
  assert.deepEqual(block.viewport, baseline.viewport, 'viewport mismatch');
  assert.equal(
    block.referenceTargetSha256,
    baseline.referenceTargetSha256,
    'referenceTargetSha256',
  );
  assert.equal(block.fixtureSha256, baseline.fixtureSha256, 'fixtureSha256');
  assert.equal(block.screenshotSha256, baseline.screenshotSha256, 'screenshotSha256');
  assert.equal(block.reportSha256, baseline.reportSha256, 'reportSha256');
  assert.equal(block.diffSha256, ledger.baseline.evidence.diffSha256, 'baseline diffSha256');
  assert.equal(
    block.overlaySha256,
    ledger.baseline.evidence.overlaySha256,
    'baseline overlaySha256',
  );
  assert.equal(block.fullDiff, baseline.scores.fullDiffRatio, 'fullDiff');
  assert.equal(block.weightedDiff, baseline.scores.weightedDiffRatio, 'weightedDiff');
  assert.deepEqual(block.regions, baseline.scores.regions, 'baseline regions');
  assert.deepEqual(block.regions, ledger.baseline.regions, 'ledger baseline regions');
});

test('baseline per-region table equals committed baseline regions', () => {
  const sections = fieldSections(loadDoc());
  const section = sections.get('Baseline Per-Region Diff Table');
  assert.ok(section, 'missing Baseline Per-Region Diff Table section');
  const table = new Map();
  for (const line of section.split('\n')) {
    const row = line.match(/^\|\s*([a-z_]+)\s*\|\s*(0\.\d+)\s*\|$/);
    if (row) table.set(row[1], Number(row[2]));
  }
  const expected = baseline.scores.regions;
  assert.deepEqual([...table.keys()].sort(), Object.keys(expected).sort(), 'region name set');
  for (const [name, value] of table) {
    assert.equal(value, expected[name], `region ${name} value mismatch`);
  }
});

test('accepted evidence commit contains the measured ledger used by the report', () => {
  const doc = loadDoc();
  assert.ok(doc.includes(EVIDENCE_COMMIT), 'doc must identify the accepted evidence commit');
  const committedLedger = JSON.parse(
    execFileSync('git', ['show', `${EVIDENCE_COMMIT}:${LEDGER_PATH}`], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(committedLedger, ledger, 'working ledger differs from accepted evidence commit');
});

test('final metadata is derived exactly from the accepted 12-pass ledger', () => {
  const ledgerBytes = fs.readFileSync(path.join(root, LEDGER_PATH));
  assert.equal(
    finalMetadata.passLedgerSha256,
    createHash('sha256').update(ledgerBytes).digest('hex'),
    'pass-ledger hash mismatch',
  );
  assert.equal(ledger.passes.length, ledger.maximumPassesBeforeReassessment);
  assert.equal(finalMetadata.passCount, ledger.passes.length);
  assert.equal(
    finalMetadata.keptPassCount,
    ledger.passes.filter((pass) => pass.decision === 'kept').length,
  );
  assert.equal(
    finalMetadata.rejectedPassCount,
    ledger.passes.filter((pass) => pass.decision === 'rejected').length,
  );
  assert.deepEqual(finalMetadata.baseline, ledger.baseline);

  const acceptedPass = ledger.passes.filter((pass) => pass.decision === 'kept').at(-1);
  assert.ok(acceptedPass, 'ledger must contain an accepted pass');
  assert.equal(acceptedPass.id, 'pass-012');
  assert.deepEqual(finalMetadata.final.revision, acceptedPass.revision);
  assert.equal(finalMetadata.final.fullDiff, acceptedPass.fullDiff);
  assert.equal(finalMetadata.final.weightedDiff, acceptedPass.weightedDiff);
  assert.deepEqual(finalMetadata.final.regions, acceptedPass.regions);
  assert.deepEqual(finalMetadata.final.evidence, acceptedPass.evidence);
  assert.deepEqual(finalMetadata.final.viewport, {
    width: spec.viewport.width,
    height: spec.viewport.height,
    deviceScaleFactor: spec.viewport.device_scale_factor,
    browserZoomPercent: spec.viewport.browser_zoom_percent,
  });
  assert.equal(finalMetadata.referenceTargetSha256, manifest.source.target_sha256);
  assert.ok(
    ledger.reassessments.some((entry) => entry.afterPassId === acceptedPass.id),
    'the maximum-pass accepted result must have a reassessment',
  );
});

test('machine-bound final block equals dependency-produced final metadata', () => {
  assert.deepEqual(boundFinalBlock(loadDoc()), finalMetadata);
});

test('coordinator-verified evidence settles every required final-report field', () => {
  const sections = fieldSections(loadDoc());
  for (const field of REQUIRED_FIELDS) {
    assert.equal(statusOf(sections.get(field)), 'VERIFIED', `${field} must be VERIFIED`);
  }
  assert.equal(overallStatus(loadDoc()), 'FINAL');
});

test('stale pass-ledger seed wording and stale revision are absent', () => {
  const doc = loadDoc();
  assert.ok(!/HEAD commit:\s*c7ee2b4/i.test(doc), 'stale c7ee2b4 HEAD must not appear');
  assert.ok(
    !/pass-ledger seed[\s\S]{0,120}c7ee2b4/i.test(doc),
    'stale c7ee2b4 pass-ledger seed must not appear',
  );
  assert.ok(!doc.includes('passes: []'), 'measured ledger must not be described as an empty seed');
  assert.ok(!doc.includes('reassessments: []'), 'measured reassessment must not be omitted');
});

test('no affirmative pixel-perfect or identical claim is made', () => {
  const doc = loadDoc();
  assert.ok(doc.includes('Pixel-Perfect Claim: NOT_MADE'), 'doc must record NOT_MADE marker');
  for (const re of PIXEL_FORBIDDEN) {
    assert.ok(!re.test(doc), `forbidden pixel-perfect claim pattern matched: ${re}`);
  }
});

test('no affirmative GitHub or live-service mutation claim is made', () => {
  const doc = loadDoc();
  assert.ok(
    doc.includes('Live-Service / GitHub Mutation: NONE_PERFORMED'),
    'doc must record NONE_PERFORMED marker',
  );
  assert.ok(
    doc.includes(
      'This Origami verification slice performed no GitHub or pull-request mutation and did not push or update existing PR #30',
    ),
    'doc must state the task-scoped existing-PR truth boundary',
  );
  assert.ok(
    !/No pull request was opened, merged, or pushed/i.test(doc),
    'doc must not imply that existing PR #30 does not exist',
  );
  for (const re of LIVE_FORBIDDEN) {
    assert.ok(!re.test(doc), `forbidden live-service/GitHub claim pattern matched: ${re}`);
  }
});

test('final-status gate rejects inconsistent states', () => {
  const doc = loadDoc();
  const status = overallStatus(doc);
  const sections = fieldSections(doc);
  const pendingFields = REQUIRED_FIELDS.filter(
    (f) => statusOf(sections.get(f)) === 'PENDING_EVIDENCE',
  );
  const finalBindPresent = hasFinalBindBlock(doc);
  const placeholders = PLACEHOLDER_RE.test(doc);

  if (status === 'FINAL') {
    assert.equal(
      pendingFields.length,
      0,
      `FINAL status with pending fields: ${pendingFields.join(', ')}`,
    );
    assert.ok(!placeholders, 'FINAL status must not contain unresolved placeholder tokens');
    assert.ok(finalBindPresent, 'FINAL status requires a complete bound final comparison block');
    for (const field of REQUIRED_FIELDS) {
      assert.equal(statusOf(sections.get(field)), 'VERIFIED', `FINAL requires ${field} VERIFIED`);
    }
  } else {
    assert.ok(
      pendingFields.length > 0,
      'INCOMPLETE status requires at least one pending evidence field',
    );
    assert.ok(
      finalBindPresent,
      'measured final metadata must remain bound while status is incomplete',
    );
  }
});

test('canonical viewport binding matches the reference specification', () => {
  const block = boundBaselineBlock(loadDoc());
  assert.equal(block.viewport.width, spec.viewport.width, 'viewport width');
  assert.equal(block.viewport.height, spec.viewport.height, 'viewport height');
  assert.equal(block.viewport.deviceScaleFactor, spec.viewport.device_scale_factor, 'device scale');
  assert.equal(block.viewport.browserZoomPercent, spec.viewport.browser_zoom_percent, 'zoom');
  assert.equal(
    ledger.maximumPassesBeforeReassessment,
    spec.acceptance.maximum_passes_before_reassessment,
    'maximum pass count',
  );
  assert.equal(
    Object.keys(block.regions).length,
    Object.keys(spec.regions).filter((name) => name !== 'full_page').length,
    'diagnostic region count',
  );
});
