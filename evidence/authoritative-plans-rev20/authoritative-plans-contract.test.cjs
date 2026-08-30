const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../site/index.html'), 'utf8');
let passed = 0;
const check = (name, fn) => {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}\n  ${error.message}`); process.exitCode = 1; }
};

const card = (plan) => {
  const match = html.match(new RegExp(`<article class="plan-card[^"]*"[^>]*data-plan="${plan}"[\\s\\S]*?</article>`));
  assert.ok(match, `${plan} card must exist`);
  return match[0];
};

const authority = 'adc1ee3a5b0e056ac6f5efc258afd6df5a25b4f8';
const plans = {
  spark: { total: 20, addon: 0, credits: '1,000' },
  orbit: { total: 30, addon: 10, credits: '5,500' },
  nova: { total: 70, addon: 50, credits: '27,500' },
  singularity: { total: 120, addon: 100, credits: '55,000' },
  supernova: { total: 220, addon: 200, credits: '110,000' },
};

check('the exact UnifiedChungus authority commit is recorded', () => assert.match(html, new RegExp(authority)));
check('Access is disclosed as a separate $20 monthly subscription after the 30-day trial', () => {
  assert.match(html, /30-day introductory Access trial/i);
  assert.match(html, /\$20\/month Access subscription/i);
  assert.match(html, /feature plan is billed separately/i);
});
for (const [name, plan] of Object.entries(plans)) {
  check(`${name} exposes the authoritative total, add-on, and credits`, () => {
    const source = card(name);
    assert.match(source, new RegExp(`\\$${plan.total}[^<]*`));
    assert.match(source, new RegExp(`\\$20 Access`));
    assert.match(source, new RegExp(`\\+\\$${plan.addon} feature plan`));
    assert.match(source, new RegExp(`${plan.credits} shared credits`));
  });
}
check('every plan discloses BYOK and unlimited local Kokoro', () => {
  for (const name of Object.keys(plans)) {
    assert.match(card(name), /BYOK on every provider/i);
    assert.match(card(name), /Unlimited local Kokoro/i);
  }
});
check('capability boundaries match the authoritative comparison', () => {
  assert.match(card('spark'), /Jarvis Call not included/i);
  assert.match(card('spark'), /Cloud sync not included/i);
  assert.match(card('orbit'), /Jarvis Call included/i);
  assert.match(card('orbit'), /Cloud sync included/i);
  assert.match(card('orbit'), /Tool publishing from Nova/i);
  for (const name of ['nova', 'singularity', 'supernova']) {
    assert.match(card(name), /Tool publishing included/i);
    assert.match(card(name), /Priority routing included/i);
  }
});
check('payments remain closed and no checkout is introduced', () => {
  assert.match(html, /App coming soon[\s\S]*Payments opening later/i);
  assert.match(html, /no checkout/i);
  assert.doesNotMatch(html, /buy\.stripe\.com/i);
});
check('warm hover/focus owns an explicit heat gradient and edge sweep', () => {
  assert.match(html, /id="vibespace-rev20-authoritative-plans"/);
  assert.match(html, /\.plan-card:is\(:hover,:focus-visible\)[^{]*\.plan-laminate/);
  assert.match(html, /linear-gradient\([^}]*#f6c79f/i);
  assert.match(html, /\.plan-card-inner::before/);
  assert.match(html, /translateX\(92%\)/);
});
check('reduced motion removes the warm sweep transition', () => {
  assert.match(html, /prefers-reduced-motion:reduce[\s\S]*\.plan-card-inner::before[^{]*\{[^}]*display:none/i);
});
check('runtime diagnostics name the authority while checkout remains false', () => {
  assert.match(html, /authorityCommit:'adc1ee3a5b0e056ac6f5efc258afd6df5a25b4f8'/);
  assert.match(html, /catalogVerified:true/);
  assert.match(html, /checkoutOpen:false/);
});

if (!process.exitCode) console.log(`\n${passed}/${passed} checks passed`);
