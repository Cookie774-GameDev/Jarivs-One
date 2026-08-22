import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { evaluateContextGatewayAcceptance } from '../app/src/features/context/gateway/contextGatewayAcceptanceSuite';
import { parseContextGatewayAcceptanceInput } from '../app/src/features/context/gateway/contextGatewayAcceptanceSchema';

const EXIT_FAILED = 1;

async function main(): Promise<void> {
  const [inputPath, extraArgument] = process.argv.slice(2);
  if (!inputPath || extraArgument) {
    process.stderr.write(
      'Usage: npm run verify:context-gateway-acceptance -- <local-evidence.json>\n',
    );
    process.exitCode = EXIT_FAILED;
    return;
  }

  try {
    const serialized = await readFile(resolve(inputPath), 'utf8');
    const input = parseContextGatewayAcceptanceInput(JSON.parse(serialized));
    const evaluation = evaluateContextGatewayAcceptance(input);
    process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
    process.exitCode = evaluation.status === 'passed' ? 0 : EXIT_FAILED;
  } catch {
    // Evidence may contain private runtime metadata. Never echo the payload,
    // parse exception, path contents, or validation value on this boundary.
    process.stderr.write('Context Gateway acceptance evidence is invalid or unreadable.\n');
    process.exitCode = EXIT_FAILED;
  }
}

await main();
