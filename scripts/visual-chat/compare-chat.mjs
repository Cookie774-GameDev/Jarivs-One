#!/usr/bin/env node
import { compareImages } from './image-compare.mjs';
import { loadOrigamiReferenceContract } from './reference-contract.mjs';

const ALLOWED_ARGUMENTS = new Set(['current', 'output', 'pass', 'revision', 'route']);

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument sequence near ${String(flag)}.`);
    }
    const name = flag.slice(2);
    if (!ALLOWED_ARGUMENTS.has(name)) {
      throw new Error(`Unknown comparison argument: ${flag}`);
    }
    options[name] = value;
  }
  const required = ['current', 'output', 'pass', 'revision', 'route'];
  for (const name of required) {
    if (!options[name]) throw new Error(`Missing required --${name} argument.`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const contract = loadOrigamiReferenceContract();
const report = await compareImages({
  targetPath: contract.targetPath,
  currentPath: options.current,
  contract,
  outputDirectory: options.output,
  passId: options.pass,
  revision: options.revision,
  route: options.route,
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
