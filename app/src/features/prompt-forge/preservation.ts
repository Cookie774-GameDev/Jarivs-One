export type PromptPreservationKind =
  | 'quote'
  | 'code_fence'
  | 'path'
  | 'url'
  | 'version'
  | 'date'
  | 'number'
  | 'directive';

export type PromptPreservationElement = Readonly<{
  kind: PromptPreservationKind;
  value: string;
}>;

export type PromptPreservationContract = Readonly<{
  schemaVersion: 1;
  originalLength: number;
  elements: readonly PromptPreservationElement[];
}>;

export type PromptPreservationResult = Readonly<{
  passed: boolean;
  missing: readonly PromptPreservationElement[];
  preservedCount: number;
  checkedCount: number;
}>;

const MAX_ORIGINAL_CHARS = 100_000;
const MAX_UPGRADED_CHARS = 200_000;
const MAX_ELEMENTS = 1_024;
const PRESERVATION_KINDS = new Set<PromptPreservationKind>([
  'quote',
  'code_fence',
  'path',
  'url',
  'version',
  'date',
  'number',
  'directive',
]);
const UNSAFE_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

function assertPrompt(value: unknown, maximum: number, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum || UNSAFE_CONTROL.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function collectMatches(
  target: PromptPreservationElement[],
  seen: Set<string>,
  source: string,
  kind: PromptPreservationKind,
  expression: RegExp,
): void {
  for (const match of source.matchAll(expression)) {
    const value = match[0];
    if (!value) continue;
    const key = `${kind}\u0000${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(Object.freeze({ kind, value }));
    if (target.length >= MAX_ELEMENTS) return;
  }
}

export function extractPromptPreservationContract(
  originalDraft: string,
): PromptPreservationContract {
  assertPrompt(originalDraft, MAX_ORIGINAL_CHARS, 'Prompt Forge draft');

  const elements: PromptPreservationElement[] = [];
  const seen = new Set<string>();
  const collectors: readonly [PromptPreservationKind, RegExp][] = [
    ['code_fence', /(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?\r?\n\1/gu],
    ['url', /\bhttps?:\/\/[^\s<>"'`)\]}]+/giu],
    [
      'path',
      /(?:\b[A-Za-z]:[\\/]|(?:^|(?<=\s))\.{0,2}[\\/]|(?:^|(?<=\s)))[\w@.-]+(?:[\\/][\w @.+()'-]+)+\.[A-Za-z0-9]{1,16}\b/gmu,
    ],
    ['version', /\bv?\d+\.\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?\b/gu],
    ['date', /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/gu],
    ['number', /(?<![\w.])[$€£¥]?\d[\d,]*(?:\.\d+)?%?(?![\w.])/gu],
    ['quote', /"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'/gu],
    [
      'directive',
      /(?:^|(?<=[.!?]\s)|(?<=\n))[^\r\n.!?]*(?:\bmust\b|\bdo not\b|\bdon't\b|\bonly\b|\bnever\b|\bkeep\b|\bpreserve\b)[^\r\n.!?]*(?:[.!?]|$)/gimu,
    ],
  ];

  for (const [kind, expression] of collectors) {
    collectMatches(elements, seen, originalDraft, kind, expression);
    if (elements.length >= MAX_ELEMENTS) break;
  }

  return Object.freeze({
    schemaVersion: 1,
    originalLength: originalDraft.length,
    elements: Object.freeze(elements),
  });
}

export function validatePromptPreservation(
  contract: PromptPreservationContract,
  upgradedPrompt: string,
): PromptPreservationResult {
  assertPrompt(upgradedPrompt, MAX_UPGRADED_CHARS, 'upgraded prompt');
  if (
    typeof contract !== 'object' ||
    contract === null ||
    contract.schemaVersion !== 1 ||
    !Number.isSafeInteger(contract.originalLength) ||
    contract.originalLength < 0 ||
    contract.originalLength > MAX_ORIGINAL_CHARS ||
    !Array.isArray(contract.elements) ||
    contract.elements.length > MAX_ELEMENTS ||
    contract.elements.some(
      (element) =>
        typeof element !== 'object' ||
        element === null ||
        !PRESERVATION_KINDS.has(element.kind) ||
        typeof element.value !== 'string' ||
        element.value.length === 0 ||
        element.value.length > MAX_ORIGINAL_CHARS ||
        UNSAFE_CONTROL.test(element.value),
    )
  ) {
    throw new Error('Invalid Prompt Forge preservation contract.');
  }

  const missing = contract.elements.filter((element) => !upgradedPrompt.includes(element.value));
  const checkedCount = contract.elements.length;
  return Object.freeze({
    passed: missing.length === 0,
    missing: Object.freeze([...missing]),
    preservedCount: checkedCount - missing.length,
    checkedCount,
  });
}
