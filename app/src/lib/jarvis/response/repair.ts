import type { JarvisResponseMode } from '@/lib/jarvis/contracts';
import { deepFreezeJarvisCopy } from '@/lib/jarvis/requestEnvelope';
import type { JarvisLintViolation } from './linter';
import type { JarvisVerifiedFacts } from './modeClassifier';
import { tokenizeJarvisResponse } from './tokenizer';

export const JARVIS_REPAIR_INSTRUCTION = [
  'Rewrite only the conversational prose to satisfy the JARVIS response contract.',
  'Preserve every fact, number, status, name, path, link, citation, warning, technical conclusion, placeholder, and action state.',
  'Do not modify or add code, JSON, tool calls, structured blocks, citations, URLs, quoted material, or humor.',
  'Do not rerun tools.',
  'Return only the repaired prose.',
].join('\n');

export interface JarvisRepairInput {
  prose: string;
  immutablePlaceholders: readonly string[];
  mode: JarvisResponseMode;
  verifiedFacts: JarvisVerifiedFacts;
  violations: readonly JarvisLintViolation[];
}

export interface JarvisRepairRequest extends JarvisRepairInput {
  instruction: typeof JARVIS_REPAIR_INSTRUCTION;
}

export interface JarvisRepairPort {
  repair(request: Readonly<JarvisRepairRequest>): Promise<string>;
}

const PLACEHOLDER_RE = /\uE000JARVIS_REGION_\d+\uE001/g;

function exactMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function immutableFactTokens(prose: string): readonly string[] {
  const withoutPlaceholders = prose
    .replace(PLACEHOLDER_RE, '')
    .replace(
      /\b(?:as an ai(?: language model)?|i am just a computer program|i(?: do not| don't) have feelings)\b/gi,
      '',
    );
  return [
    ...(withoutPlaceholders.match(/`[^`\r\n]+`/g) ?? []),
    ...(withoutPlaceholders.match(/\b\d+(?:\.\d+)*(?:%|ms|s|kb|mb|gb|tb)?\b/gi) ?? []),
    ...(withoutPlaceholders.match(/\b[A-Z][A-Za-z0-9._/-]*[A-Z0-9][A-Za-z0-9._/-]*\b/g) ?? []),
    ...(withoutPlaceholders.match(/(?:[A-Za-z]:\\|\.{0,2}\/)[^\s"'<>]+/g) ?? []),
  ];
}

export async function repairJarvisProseOnce(
  request: Readonly<JarvisRepairInput>,
  port: JarvisRepairPort,
): Promise<Readonly<{ prose: string; attempted: boolean; succeeded: boolean }>> {
  const detachedRequest = deepFreezeJarvisCopy({
    ...request,
    instruction: JARVIS_REPAIR_INSTRUCTION,
  }) as Readonly<JarvisRepairRequest>;
  if (
    !detachedRequest.violations.some((item) => item.disposition === 'repairable') ||
    detachedRequest.violations.some((item) => item.disposition === 'quarantine')
  ) {
    return Object.freeze({ prose: detachedRequest.prose, attempted: false, succeeded: false });
  }
  try {
    const repaired = await port.repair(detachedRequest);
    const placeholdersPreserved = exactMultiset(
      detachedRequest.immutablePlaceholders,
      repaired.match(PLACEHOLDER_RE) ?? [],
    );
    const factsPreserved = exactMultiset(
      immutableFactTokens(detachedRequest.prose),
      immutableFactTokens(repaired),
    );
    const introducedStructuredRegion = tokenizeJarvisResponse(repaired).regions.length > 0;
    if (
      !repaired.trim() ||
      !placeholdersPreserved ||
      !factsPreserved ||
      introducedStructuredRegion
    ) {
      return Object.freeze({ prose: detachedRequest.prose, attempted: true, succeeded: false });
    }
    return Object.freeze({ prose: repaired, attempted: true, succeeded: true });
  } catch {
    return Object.freeze({ prose: detachedRequest.prose, attempted: true, succeeded: false });
  }
}
