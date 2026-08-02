import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripeGuidePath = 'docs/stripe-setup.md';
const checklistPath = 'docs/access-release-checklist.md';

const failures = [];
const requireFile = (path) => {
  if (!existsSync(join(root, path))) failures.push(`${path}: file is missing`);
};
const requireMatch = (label, text, pattern) => {
  if (!pattern.test(text)) failures.push(`${label}: missing ${pattern}`);
};
const forbidMatch = (label, text, pattern) => {
  if (pattern.test(text)) failures.push(`${label}: forbidden ${pattern}`);
};
const requireOrder = (label, text, tokens) => {
  let cursor = -1;
  for (const token of tokens) {
    const next = text.indexOf(token, cursor + 1);
    if (next === -1) {
      failures.push(`${label}: missing ordered token ${token}`);
      return;
    }
    if (next < cursor) {
      failures.push(`${label}: token out of order ${token}`);
      return;
    }
    cursor = next;
  }
};
const sectionFrom = (text, startPattern, endPattern) => {
  const start = text.search(startPattern);
  if (start === -1) return '';
  const remainder = text.slice(start);
  const end = remainder.slice(1).search(endPattern);
  return end === -1 ? remainder : remainder.slice(0, end + 1);
};
const fencedCommandLines = (text) =>
  [...text.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)```/g)].flatMap((match) =>
    match[1].split(/\r?\n/).map((line) => line.trim()),
  );

for (const path of [stripeGuidePath, checklistPath]) requireFile(path);

if (failures.length === 0) {
  const stripeGuide = read(stripeGuidePath);
  const checklist = read(checklistPath);
  const docs = `${stripeGuide}\n${checklist}`;

  const requiredGuidePatterns = [
    /test mode only/i,
    /VibeSpace Access[\s\S]{0,120}\$20(?:\.00)?[\s\S]{0,80}month/i,
    /optional AI\/voice\/cloud plans[\s\S]{0,120}separate/i,
    /STRIPE_APP_ACCESS_PRICE_ID/,
    /price[\s\S]{0,80}server-side[\s\S]{0,120}client/i,
    /create-access-checkout/,
    /create-access-portal/,
    /stripe-webhook/,
    /raw request body/i,
    /Stripe signature/i,
    /verify_jwt\s*=\s*false/,
    /checkout[\s\S]{0,80}portal[\s\S]{0,120}verify_jwt\s*=\s*true/i,
    /subscription_events/,
    /app_access_reconcile_event/,
    /supabase --version/,
    /ACCESS_LEASE_KEY_ID/,
    /ACCESS_LEASE_SIGNING_JWK/,
    /access-lease[\s\S]{0,160}verify_jwt\s*=\s*true/i,
    /lease_unconfigured/,
    /unauthenticated[\s\S]{0,120}access-lease[\s\S]{0,120}401/i,
    /authenticated[\s\S]{0,160}(?:issuance|issue)[\s\S]{0,160}signed lease/i,
    /(?:public key|trustedKeys)[\s\S]{0,240}(?:private signing key|signing JWK)[\s\S]{0,240}(?:match|parity|same `kid`)/i,
    /key (?:rotation|lifecycle)[\s\S]{0,200}(?:overlap|retire|revoke)/i,
    /organization-approved[\s\S]{0,80}(?:secret injection|secret manager)/i,
    /(?:command line|command-line)[\s\S]{0,160}(?:shell history|process capture)/i,
    /protected temporary file[\s\S]{0,200}(?:ACL|permissions)[\s\S]{0,200}(?:delete|cleanup)/i,
    /remote migration history[\s\S]{0,160}`0001`[\s\S]{0,160}`0019`[\s\S]{0,160}timestamped/i,
    /local migration files[\s\S]{0,160}`0020`[\s\S]{0,160}`0035`[\s\S]{0,160}(?:skip|missing) `0025`/i,
    /`0031_wallpapers\.sql`[\s\S]{0,200}(?:absent|not present|not deployed)[\s\S]{0,200}(?:separate|outside)[\s\S]{0,120}Access/i,
    /(?:never|do not)[\s\S]{0,80}repair migration history/i,
    /(?:generic|ordinary|full-directory)[\s\S]{0,120}`?supabase db push`?[\s\S]{0,120}(?:prohibited|must not|do not)/i,
    /(?:exactly|only)[\s\S]{0,160}(?:four|4)[\s\S]{0,160}(?:sequential|one at a time)[\s\S]{0,200}`0032`[\s\S]{0,200}`0035`/i,
    /remote-shaped disposable proof[\s\S]{0,240}(?:temporary|isolated)[\s\S]{0,240}(?:unlinked|not linked)/i,
    /selected migration filenames[\s\S]{0,240}(?:record|evidence)/i,
    /`0031_wallpapers\.sql`[\s\S]{0,160}(?:must be absent|is absent)[\s\S]{0,200}(?:before|prior to)[\s\S]{0,160}(?:reset|start)/i,
    /webhook-confirmed/i,
    /static evidence/i,
    /not run/i,
  ];
  for (const pattern of requiredGuidePatterns) {
    requireMatch(stripeGuidePath, stripeGuide, pattern);
  }

  for (const event of [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.subscription.trial_will_end',
  ]) {
    requireMatch(stripeGuidePath, stripeGuide, new RegExp(event.replaceAll('.', '\\.')));
  }

  requireOrder(stripeGuidePath, stripeGuide, [
    '0032_app_access.sql',
    '0033_app_access_event_reconcile.sql',
    '0034_app_access_lease_freshness.sql',
    '0035_app_access_checkout_attempts.sql',
  ]);
  const applicationSection = sectionFrom(
    stripeGuide,
    /After both disposable local database proofs pass/i,
    /\r?\n##\s+/,
  );
  requireMatch(
    `${stripeGuidePath} authorized application section`,
    applicationSection,
    /0032_app_access\.sql[\s\S]*0033_app_access_event_reconcile\.sql[\s\S]*0034_app_access_lease_freshness\.sql[\s\S]*0035_app_access_checkout_attempts\.sql/i,
  );
  requireOrder(`${stripeGuidePath} authorized application section`, applicationSection, [
    '0032_app_access.sql',
    '0033_app_access_event_reconcile.sql',
    '0034_app_access_lease_freshness.sql',
    '0035_app_access_checkout_attempts.sql',
  ]);

  const requiredChecklistPatterns = [
    /v0\.1\.51/,
    /enabled\s*=\s*false/i,
    /minimum_version/,
    /RETURN_ROUTE_PARITY_ABORT/,
    /abort criteria/i,
    /rollback/i,
    /preserv(?:e|es|ing) (?:all )?(?:workspace|user|entitlement|billing|access) data/i,
    /do not (?:drop|delete|truncate)/i,
    /AccessRevamp `ar_\*` objects[\s\S]{0,160}(?:never|protected)/i,
    /(?:modify|drop)[\s\S]{0,100}reset[\s\S]{0,100}truncate[\s\S]{0,160}`ar_\*`/i,
    /static[\s\S]{0,80}pass/i,
    /live\/test-mode[\s\S]{0,80}not run/i,
    /no live verification/i,
    /Stripe product and price state[\s\S]{0,80}not verified/i,
    /organization-approved repository-wide secret scanner/i,
    /exact release-candidate[\s\S]{0,200}(?:diff|merge base)[\s\S]{0,200}(?:history|commit)/i,
    /private keys?[\s\S]{0,200}JWT[\s\S]{0,200}sb_secret[\s\S]{0,200}GitHub[\s\S]{0,200}(?:signing|high-entropy)/i,
    /(?:static checker|documentation checker)[\s\S]{0,160}(?:does not|cannot)[\s\S]{0,120}repository-wide/i,
    /untracked[\s\S]{0,160}(?:content|whitespace|candidate)/i,
    /secret scan/i,
    /remote-shaped disposable proof[\s\S]{0,240}(?:temporary|isolated)[\s\S]{0,240}(?:unlinked|not linked)/i,
    /selected migration filenames[\s\S]{0,240}(?:record|evidence)/i,
    /reviewed\s+application\s+plan\s+contains\s+no\s+operation\s+against\s+them/i,
    /recheck\s+exact\s+target\s+before\s+the\s+reviewed\s+application\s+plan/i,
  ];
  for (const pattern of requiredChecklistPatterns) {
    requireMatch(checklistPath, checklist, pattern);
  }

  for (const scenario of [
    'trial start',
    'trial end',
    'checkout conversion',
    'active renewal',
    'cancel at period end',
    'immediate cancellation if supported',
    'payment failure',
    'three-day grace',
    'grace expiration',
    'payment recovery',
    'duplicate webhook',
    'out-of-order webhook',
    'separate ledger',
    'customer portal',
    'multiple checkout attempts',
    'offline lease',
    'clock rollback',
    'admin/internal bypass',
    'gate disabled',
    'v0.1.48',
  ]) {
    requireMatch(checklistPath, checklist, new RegExp(scenario.replace('/', '\\/'), 'i'));
  }

  for (const secretName of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_APP_ACCESS_PRICE_ID',
    'APP_BASE_URL',
    'APP_ACCESS_GRACE_DAYS',
  ]) {
    requireMatch(stripeGuidePath, stripeGuide, new RegExp(`\\b${secretName}\\b`));
  }

  const forbidden = [
    /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/,
    /\bwhsec_[A-Za-z0-9]{8,}\b/,
    /\bprice_[A-Za-z0-9]{12,}\b/,
    /\bcus_[A-Za-z0-9]{8,}\b/,
    /\bacct_[A-Za-z0-9]{8,}\b/,
    /\b4242[ -]?4242[ -]?4242[ -]?4242\b/,
    /https:\/\/[a-z0-9]{20}\.supabase\.co\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /live (?:Stripe|Supabase)[\s\S]{0,40}(?:passed|verified)/i,
    /all Stripe (?:tests|scenarios)[\s\S]{0,30}pass/i,
    /Access (?:and|with|\+) (?:AI|voice|cloud)[\s\S]{0,40}(?:one|single) subscription/i,
    /npx\s+supabase/i,
    /supabase secrets set[\s\S]{0,400}(?:SECRET|PRICE_ID|SIGNING_JWK)\s*=/i,
    /no authorized external calls/i,
    /no authorization for (?:live|external)/i,
    /no authority for external (?:calls|mutation)/i,
    /coordinator correcting route parity/i,
    /(?:modify|drop|reset|truncate|rename|replace)(?:s|d|ing)? (?:an? |any )?`ar_[^*]/i,
    /supabase db push(?: --dry-run)? --linked/i,
  ];
  for (const pattern of forbidden) forbidMatch('owned release docs', docs, pattern);
  for (const line of fencedCommandLines(docs)) {
    if (/^(?:(?:PS>)|\$)?\s*supabase\s+db\s+push(?:\s|$)/i.test(line)) {
      failures.push(`owned release docs: forbidden executable db push command: ${line}`);
    }
  }

  const sourceFiles = [
    'supabase/migrations/0032_app_access.sql',
    'supabase/migrations/0033_app_access_event_reconcile.sql',
    'supabase/migrations/0034_app_access_lease_freshness.sql',
    'supabase/migrations/0035_app_access_checkout_attempts.sql',
    'supabase/functions/create-access-checkout/index.ts',
    'supabase/functions/create-access-portal/index.ts',
    'supabase/functions/access-lease/index.ts',
    'supabase/functions/stripe-webhook/index.ts',
    'supabase/config.toml',
  ];
  for (const path of sourceFiles) requireFile(path);

  const checkout = read('supabase/functions/create-access-checkout/index.ts');
  const portal = read('supabase/functions/create-access-portal/index.ts');
  const accessLease = read('supabase/functions/access-lease/index.ts');
  const webhook = read('supabase/functions/stripe-webhook/index.ts');
  const config = read('supabase/config.toml');
  assert.match(checkout, /STRIPE_APP_ACCESS_PRICE_ID/);
  assert.match(checkout, /line_items:\s*\[\{ price: config\.appAccessPriceId/);
  assert.match(portal, /return_url:\s*returnUrl/);
  assert.match(accessLease, /Deno\.env\.get\('ACCESS_LEASE_KEY_ID'\)/);
  assert.match(accessLease, /Deno\.env\.get\('ACCESS_LEASE_SIGNING_JWK'\)/);
  assert.match(accessLease, /namedCurve:\s*'P-256'/);
  assert.match(accessLease, /error:\s*'lease_unconfigured'/);
  assert.match(accessLease, /req\.headers\.get\('authorization'\)/);
  assert.match(accessLease, /client\.auth\.getUser\(token\)/);
  assert.match(webhook, /req\.headers\.get\('stripe-signature'\)/);
  assert.match(webhook, /const MAX_STRIPE_WEBHOOK_BODY_BYTES = 1024 \* 1024/);
  assert.match(webhook, /const lengthError = contentLengthError\(req\)/);
  assert.match(webhook, /const body = await readBoundedWebhookBody\(req\)/);
  assert.match(webhook, /const rawBody = body\.rawBody/);
  assert.match(webhook, /deps\.verifySignature\(rawBody, sig\)/);
  assert.match(config, /\[functions\.stripe-webhook\]\s*verify_jwt\s*=\s*false/);
  const accessLeaseConfig = config.match(/\[functions\.access-lease\]([\s\S]*?)(?=\r?\n\[|$)/)?.[1];
  if (accessLeaseConfig !== undefined) {
    assert.match(accessLeaseConfig, /verify_jwt\s*=\s*true/);
  }

  for (const key of ['success_url', 'cancel_url']) {
    const match = checkout.match(new RegExp(`${key}: appBaseUrl \\+ '([^']+)'`));
    if (!match) {
      failures.push(`create-access-checkout: cannot resolve ${key}`);
      continue;
    }
    requireMatch('owned release docs', docs, new RegExp(match[1].replaceAll('/', '\\/')));
    const published = join(root, 'site', match[1].replace(/^\/|\/$/g, ''), 'index.html');
    if (!existsSync(published)) {
      requireMatch(checklistPath, checklist, /RETURN_ROUTE_PARITY_ABORT/);
    }
  }
}

if (failures.length > 0) {
  console.error('Access release documentation contract FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Access release documentation contract PASS');
}
