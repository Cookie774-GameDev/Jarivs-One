import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as fixtureAuthority from './fixtures.ts';
import * as manifestAuthority from './fixture-manifest.ts';

const SOURCE_COMMIT = '7eb708e184ee4f054a49d3e70d73e80fd4eb97ae';

const EXPECTED_FIXTURES = {
  chat: {
    id: 'chat',
    clock: '2026-07-16T12:00:00.000Z',
    activeConversationId: 'fixture-chat-001',
    messages: [
      { id: 'fixture-message-001', role: 'user', text: 'Summarize the deterministic workspace.' },
      {
        id: 'fixture-message-002',
        role: 'assistant',
        text: 'The workspace fixture is local, synthetic, and ready for review.',
      },
    ],
  },
  'settings-appearance': {
    id: 'settings-appearance',
    clock: '2026-07-16T12:00:00.000Z',
    selectedTheme: 'monochrome',
    density: 'compact',
    reducedMotion: true,
  },
  'terminal-workbench': {
    id: 'terminal-workbench',
    clock: '2026-07-16T12:00:00.000Z',
    workspaceName: 'Synthetic audit workspace',
    terminalLines: ['$ npm run verify:fixture', 'fixture status: deterministic'],
    panels: ['terminal', 'files', 'jarvis'],
  },
} as const;

function fixtureHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertDeepFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeepFrozen(nested);
}

test('the deterministic fixture authority exists before visual consumers run', () => {
  const fixturesPath = fileURLToPath(new URL('./fixtures.ts', import.meta.url));
  const manifestPath = fileURLToPath(new URL('./fixture-manifest.ts', import.meta.url));

  assert.equal(existsSync(fixturesPath), true, 'missing deterministic visual fixtures');
  assert.equal(existsSync(manifestPath), true, 'missing deterministic fixture manifest');
});

test('fixtures are immutable deterministic literals with no user or network data', () => {
  assert.deepEqual(fixtureAuthority.MONOCHROME_VISUAL_FIXTURES, EXPECTED_FIXTURES);
  assertDeepFrozen(fixtureAuthority.MONOCHROME_VISUAL_FIXTURES);

  const serialized = JSON.stringify(fixtureAuthority.MONOCHROME_VISUAL_FIXTURES);
  assert.doesNotMatch(serialized, /(?:@|https?:|Bearer |token|password|phone|customer)/iu);
  assert.equal(serialized.includes('2026-07-16T12:00:00.000Z'), true);
});

test('fixture manifest freezes provenance, hashes, consumers, and validator command', () => {
  const manifest = manifestAuthority.MONOCHROME_FIXTURE_MANIFEST as Record<string, unknown>;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(manifest.captureMode, 'retroactive-source-freeze');
  assert.deepEqual(manifest.ownedPaths, [
    'tests/visual/monochrome/fixture-manifest.test.ts',
    'tests/visual/monochrome/fixture-manifest.ts',
    'tests/visual/monochrome/fixtures.ts',
  ]);
  assert.deepEqual(manifest.fixtureIds, ['chat', 'settings-appearance', 'terminal-workbench']);
  assert.deepEqual(manifest.fixtureHashes, {
    chat: fixtureHash(EXPECTED_FIXTURES.chat),
    'settings-appearance': fixtureHash(EXPECTED_FIXTURES['settings-appearance']),
    'terminal-workbench': fixtureHash(EXPECTED_FIXTURES['terminal-workbench']),
  });
  assert.deepEqual(manifest.consumerTasks, ['MC4', 'MC5', 'MC6']);
  assert.equal(
    manifest.validatorCommand,
    'node --test tests/visual/monochrome/fixture-manifest.test.ts',
  );
});

test('fixture validator rejects duplicate or unstable fixture ids and hash drift', () => {
  const validate = manifestAuthority.validateMonochromeFixtureManifest;
  assert.equal(typeof validate, 'function', 'missing fixture manifest validator');
  if (typeof validate !== 'function') return;

  const manifest = manifestAuthority.MONOCHROME_FIXTURE_MANIFEST;
  assert.deepEqual(validate(manifest, fixtureAuthority.MONOCHROME_VISUAL_FIXTURES), []);
  assert.match(
    validate(
      { ...manifest, fixtureIds: ['chat', 'chat'] },
      fixtureAuthority.MONOCHROME_VISUAL_FIXTURES,
    ).join('\n'),
    /duplicate|stable order/iu,
  );
  assert.match(
    validate(
      { ...manifest, fixtureHashes: { ...manifest.fixtureHashes, chat: '0'.repeat(64) } },
      fixtureAuthority.MONOCHROME_VISUAL_FIXTURES,
    ).join('\n'),
    /hash/iu,
  );
});
