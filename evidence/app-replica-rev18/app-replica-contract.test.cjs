const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../../site/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const checks = [
  ['replica owns the retired Liquid AI position', /id="vibespaceAppDemo"/],
  ['exactly three simulated chat selectors exist', source => (source.match(/data-sim-chat="[^"]+"/g) || []).length === 3],
  ['the selected chat exposes live transcript output', /id="appDemoTranscript"[^>]*aria-live="polite"/],
  ['the composer has a labelled text input', /id="appDemoInput"[^>]*aria-label="Message Jarvis"/],
  ['the composer has a submit action', /id="appDemoComposer"/],
  ['the response truthfully links to the plans\/coming-soon section', /Download VibeSpace[\s\S]{0,800}href="#plans"/i],
  ['diagnostics expose deterministic app-demo state', /appDemo\s*:\s*\{[^}]*selectedChat[^}]*running[^}]*step[^}]*sentCount/s],
  ['the old LiquidField class is removed', source => !/class LiquidField\b/.test(source)],
  ['the retired liquid canvas is removed', source => !/id="liquidCanvas"/.test(source)],
];

let failed = 0;
for (const [name, matcher] of checks) {
  const pass = typeof matcher === 'function' ? matcher(html) : matcher.test(html);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}

if (failed) {
  console.error(`\n${failed} app-replica contract check(s) failed.`);
  process.exit(1);
}

console.log('\nAll app-replica contract checks passed.');
