import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function position(fragment: string): number {
  const index = source.indexOf(fragment);
  assert.notEqual(index, -1, `missing source fragment: ${fragment}`);
  return index;
}

test('checks authoritative app access under the user JWT before billable work', () => {
  assert.match(
    source,
    /createClient\(SUPABASE_URL, SUPABASE_ANON_KEY, \{[\s\S]*?Authorization: `Bearer \$\{jwt\}`/,
  );
  const auth = position('await userClient.auth.getUser(jwt)');
  const access = position("await userClient.rpc('get_app_access'");
  const admin = position("await admin.rpc('is_app_admin'");
  const rate = position("await admin.rpc('voice_rate_limit_hit'");
  const reserve = position(".rpc('reserve_call_budget'");
  const provider = position('audio = await callOpenAI');

  assert.ok(auth < access);
  assert.ok(access < admin);
  assert.ok(access < rate);
  assert.ok(access < reserve);
  assert.ok(access < provider);
});

test('uses the shared server app version and fails closed on access ambiguity', () => {
  assert.match(
    source,
    /const APP_VERSION = resolveServerAppVersion\(Deno\.env\.get\('APP_VERSION'\)\)/,
  );
  assert.match(source, /p_app_version:\s*appVersion/);
  assert.match(
    source,
    /import \{[\s\S]*?isAuthoritativePrelaunchConfig,[\s\S]*?resolveServerAppVersion,[\s\S]*?\} from '\.\.\/_shared\/appVersion\.ts'/,
  );
  assert.match(
    source,
    /import \{ evaluateAppAccessGate \} from '\.\.\/_shared\/appAccessGate\.ts'/,
  );
  assert.match(source, /const accessDecision = evaluateAppAccessGate\(accessData\)/);
  assert.match(source, /accessDecision\.kind !== 'allow'/);
  assert.doesNotMatch(source, /USABLE_APP_ACCESS_STATUSES/);
  assert.doesNotMatch(source, /function isUsableAppAccess/);
  assert.doesNotMatch(source, /body\.(?:appVersion|app_version|canUseApp|accessStatus)/);
});

test('allows absent version only under the authoritative prelaunch row', () => {
  const auth = position('await userClient.auth.getUser(jwt)');
  const launchConfig = position(".from('app_access_launch_config')");
  const access = position("await userClient.rpc('get_app_access'");
  const provider = position('audio = await callOpenAI');

  assert.ok(auth < launchConfig);
  assert.ok(launchConfig < access);
  assert.ok(access < provider);
  assert.match(source, /APP_VERSION\.kind === 'version'/);
  assert.match(source, /!isAuthoritativePrelaunchConfig\(launchConfig\)/);
  assert.match(
    source,
    /launchConfigError \|\| !isAuthoritativePrelaunchConfig\(launchConfig\)[\s\S]*?access_unavailable/,
  );
});

test('denied or unavailable app access returns safely before provider and billing effects', () => {
  assert.match(
    source,
    /if \(accessError\)\s*return json\(\{ error: 'access_unavailable' \}, 503, origin\)/,
  );
  assert.match(
    source,
    /if \(accessDecision\.kind !== 'allow'\)\s*return json\(\{ error: 'app_access_denied' \}, 403, origin\)/,
  );
  assert.doesNotMatch(source, /^const (?:OPENAI|DEEPGRAM|ELEVENLABS)_API_KEY/m);
});

test('bounds dependency failures and never turns post-provider bookkeeping into a retryable throw', () => {
  assert.match(
    source,
    /try \{\s*const \{ data: appAdminFlag, error: appAdminError \} = await admin\.rpc\('is_app_admin'/,
  );
  assert.match(
    source,
    /if \(appAdminError\) return json\(\{ error: 'usage_unavailable' \}, 503, origin\)/,
  );
  assert.match(source, /catch \{\s*return json\(\{ error: 'usage_unavailable' \}, 503, origin\)/);
  assert.match(source, /async function settleAndAudit/);
  assert.match(source, /await settleAndAudit\([\s\S]*?\)\.catch\(\(\) => undefined\)/);
});
