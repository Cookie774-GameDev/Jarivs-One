const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../site/index.html'), 'utf8');
const text = (source) => source
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[^;]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const cardText = (plan) => {
  const match = html.match(new RegExp(`<article class="plan-card[^"]*"[^>]*data-plan="${plan}"[\\s\\S]*?</article>`));
  assert.ok(match, `${plan} card exists`);
  return text(match[0]);
};

let passed = 0;
const check = (name, fn) => {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}\n  ${error.message}`); process.exitCode = 1; }
};

check('$20 Access promises full VibeSpace app access', () => {
  const plans = text(html.match(/<section class="plan-studio[\s\S]*?<\/section>/)?.[0] || '');
  assert.match(plans, /\$20 Access includes full access to the VibeSpace app/i);
  for (const plan of ['spark', 'orbit', 'nova', 'singularity', 'supernova']) {
    assert.match(cardText(plan), /Full access to the VibeSpace app/i);
  }
});

check('Spark does not imply paid phone or SMS service', () => {
  const spark = cardText('spark');
  assert.match(spark, /Jarvis Call not included/i);
  assert.match(spark, /SMS not included/i);
  assert.doesNotMatch(spark, /Up to \d[\d,]* Jarvis Call minutes/i);
});

const paid = {
  orbit: { minutes: '55', sms: '550' },
  nova: { minutes: '275', sms: '2,750' },
  singularity: { minutes: '550', sms: '5,500' },
  supernova: { minutes: '1,100', sms: '11,000' },
};
for (const [plan, allowance] of Object.entries(paid)) {
  check(`${plan} exposes correct maximum phone and SMS equivalents`, () => {
    const copy = cardText(plan);
    assert.match(copy, new RegExp(`Up to ${allowance.minutes} Jarvis Call minutes`, 'i'));
    assert.match(copy, new RegExp(`Up to ${allowance.sms} SMS texts`, 'i'));
  });
}

check('maximums explain the shared-pool tradeoff', () => {
  const plans = text(html.match(/<section class="plan-studio[\s\S]*?<\/section>/)?.[0] || '');
  assert.match(plans, /Maximums assume the entire monthly shared-credit pool is allocated to one service/i);
  assert.match(plans, /Mixed usage reduces each maximum/i);
});

if (!process.exitCode) console.log(`\n${passed}/${passed} checks passed`);

