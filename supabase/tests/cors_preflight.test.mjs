import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../functions/', import.meta.url);
const required = [
  'call-start', 'claim-launch-promo', 'get-call-usage', 'get-message-usage',
  'get-voice-usage', 'model-manifest', 'sms-send', 'stack-complete', 'tts-speak',
];

test('shared Supabase preflight preserves restrictive CORS headers', () => {
  const shared = readFileSync(new URL('_shared/voice.ts', root), 'utf8');
  assert.match(shared, /export function preflight/);
  assert.match(shared, /status:\s*204/);
  assert.match(shared, /headers:\s*corsHeaders\(origin\)/);
});

test('deployed desktop functions use the preflight helper, never Headers spreading', () => {
  for (const slug of required) {
    const source = readFileSync(new URL(`${slug}/index.ts`, root), 'utf8');
    assert.match(source, /preflight\(origin\)/, `${slug} must use preflight(origin)`);
    assert.doesNotMatch(source, /json\(\{\},\s*200,\s*origin\)\.headers/);
  }
});