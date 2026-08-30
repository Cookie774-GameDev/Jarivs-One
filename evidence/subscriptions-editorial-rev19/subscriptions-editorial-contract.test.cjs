const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../../site/index.html'), 'utf8');
const style = html.match(/<style id="vibespace-rev19-plans-editorial">([\s\S]*?)<\/style>/)?.[1] || '';
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
let scriptsParse = true;
try { scripts.forEach((source, index) => new vm.Script(source, { filename: `inline-${index + 1}.js` })); } catch (_) { scriptsParse = false; }

const checks = [
  ['dedicated rev19 editorial style owner exists', style.length > 0],
  ['plans studio exposes the warm-paper token', /--plan-paper\s*:\s*#f1eadb/i.test(style)],
  ['plans studio is explicitly light and editorial', /\.plan-studio\s*\{[^}]*background\s*:[^;}]*var\(--plan-paper\)/i.test(style)],
  ['plan cards use a paper-sheet surface', /\.plan-laminate\s*\{[^}]*background\s*:[^;}]*var\(--plan-sheet\)/i.test(style)],
  ['selected plan has a copper authored state', /\.plan-card\.is-selected[^}]*--plan-accent/i.test(style)],
  ['coming-soon badge resets the legacy full-card inset', /data-availability="coming-soon"[^}]*inset\s*:\s*auto/i.test(style)],
  ['desktop rail keeps five plans and intentional overflow', /\.plan-deck\s*\{[^}]*overflow-x\s*:\s*auto/i.test(style)],
  ['mobile rail keeps snap-card sizing', /@media\(max-width:520px\)[\s\S]*grid-auto-columns/i.test(style)],
  ['reduced motion removes card transforms', /prefers-reduced-motion:reduce[\s\S]*\.plan-card[^}]*transform\s*:\s*none/i.test(style)],
  ['all five canonical tiers remain present', ['spark', 'orbit', 'nova', 'singularity', 'supernova'].every(key => html.includes(`data-plan="${key}"`))],
  ['coming-soon payment truth remains present', /payments opening later/i.test(html) && /no checkout/i.test(html)],
  ['all inline scripts parse', scripts.length === 10 && scriptsParse],
  ['document IDs remain unique', ids.length === 151 && duplicateIds.length === 0],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exitCode = failed ? 1 : 0;
