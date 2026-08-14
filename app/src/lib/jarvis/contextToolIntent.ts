const EXPLICIT_CONTEXT_TOOL = /\b(?:vibespace_context|context map)\b/i;
const MUTATING_REQUEST =
  /\b(?:write|create|save|delete|remove|rename|move|edit|modify|change|run|execute|launch|start|command|terminal)\b/i;
const READ_OR_EVIDENCE_REQUEST =
  /\b(?:read|search|find|look\s+up|answer|quote|cite|citation|source|where\s+(?:you|u)\s+found)\b/i;
const FILE_LIKE_SOURCE = /\b(?:files?|documents?|corpus|records?|sources?|literature)\b/i;
const MAX_DIRECT_CONTEXT_REQUEST_CHARS = 32_768;
const UNSAFE_DIRECT_CONTEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DIRECT_ADDRESS_ONLY = /\bvibespace_context\b[ \t]+address[ \t]+operation[ \t]+only\b/iu;
const DIRECT_OTHER_DOTTED =
  /\bvibespace_context\s*\.\s*(?:describe|checkpoint|search|open|expand|related|investigate)\b/iu;
const DIRECT_OTHER_OPERATION =
  /\boperation\s*(?:=|:)\s*["'`]?(?:describe|checkpoint|search|open|expand|related|investigate)["'`]?\b/iu;
const NEGATED_INVOCATION =
  /\b(?:do\s+not|don't|never|avoid|without)\s+(?:call|calling|invoke|invoking|use|using|make|making|perform|performing)\b/giu;
const NO_ADDRESS_CALLS =
  /\bno\b[^\r\n]{0,160}\bvibespace_context\b[^\r\n]{0,160}\baddress\s+calls?\b/iu;
const DESCRIPTIVE_DIRECT_ADDRESS =
  /^\s*(?:please\s+)?(?:explain|describe|document|tell\s+me\s+about|what\s+is|is|does)\b/iu;
const DIRECT_CALL_VERB = /\b(?:call|invoke|use|make|perform)\b/iu;
const ADDRESS_CORPUS_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/u;
const CANONICAL_ADDRESS_POSITION = /^(?:0|[1-9]\d*)$/u;
const MAX_ADDRESS_POSITION = '10000000000000000';
const MAX_ADDRESS_CALLS = 12;
const ADDRESS_JSON_OBJECT = /\{[^{}\r\n]{1,512}\}/gu;
const ADDRESS_JSON_KEY = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/gu;
const ADDRESS_BULLET =
  /^[ \t]*-[ \t]+([A-Za-z0-9][A-Za-z0-9._@-]{0,199})[ \t]+@[ \t]+(0|[1-9]\d*)[ \t]*$/gmu;
const ANY_BULLET_LINE = /^[ \t]*-[ \t]+.*$/gmu;
const DECLARED_CALL_COUNT =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|\d{1,2})\s+(?:address\s+)?calls?\b/giu;
const EXACTLY_ONCE = /\bexactly\s+once\b/iu;
const TWICE = /\btwice\b/iu;

const CALL_COUNT_WORDS: Readonly<Record<string, number>> = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
});

interface DirectAddressTuple {
  corpusId: string;
  position: string;
}

function boundedAddressPosition(value: string): boolean {
  if (!CANONICAL_ADDRESS_POSITION.test(value)) return false;
  return (
    value.length < MAX_ADDRESS_POSITION.length ||
    (value.length === MAX_ADDRESS_POSITION.length && value <= MAX_ADDRESS_POSITION)
  );
}

function declaredAddressCallCount(userText: string): number | null | undefined {
  const counts: number[] = [];
  for (const match of userText.matchAll(DECLARED_CALL_COUNT)) {
    const raw = match[1]?.toLowerCase();
    if (!raw) return undefined;
    counts.push(CALL_COUNT_WORDS[raw] ?? Number(raw));
  }
  if (EXACTLY_ONCE.test(userText)) counts.push(1);
  if (TWICE.test(userText)) counts.push(2);
  if (counts.length === 0) return null;
  return counts.every((count) => count === counts[0]) ? counts[0] : undefined;
}

function uniqueBoundedAddressTuples(tuples: readonly DirectAddressTuple[]): boolean {
  if (tuples.length === 0 || tuples.length > MAX_ADDRESS_CALLS) return false;
  const identities = new Set(
    tuples.map(({ corpusId, position }) => `${corpusId}\u0000${position}`),
  );
  return identities.size === tuples.length;
}

function explicitlyNegatesAddressInvocation(userText: string): boolean {
  if (NO_ADDRESS_CALLS.test(userText)) return true;
  for (const match of userText.matchAll(NEGATED_INVOCATION)) {
    const target = userText.slice(
      (match.index ?? 0) + match[0].length,
      userText.indexOf('\n', match.index ?? 0) >= 0
        ? userText.indexOf('\n', match.index ?? 0)
        : Math.min(userText.length, (match.index ?? 0) + match[0].length + 320),
    );
    if (
      /\baddress\s+(?:operation|calls?)\b/iu.test(target) ||
      (/\bvibespace_context\b/iu.test(target) && /\baddress\b/iu.test(target))
    ) {
      return true;
    }
  }
  return false;
}

function parseAddressJsonTuple(raw: string): DirectAddressTuple | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const keys = [...raw.matchAll(ADDRESS_JSON_KEY)].map((match) => match[1]);
  if (
    keys.length !== 3 ||
    new Set(keys).size !== 3 ||
    Object.keys(record).length !== 3 ||
    record.operation !== 'address' ||
    typeof record.corpusId !== 'string' ||
    !ADDRESS_CORPUS_ID.test(record.corpusId) ||
    typeof record.position !== 'string' ||
    !boundedAddressPosition(record.position)
  ) {
    return null;
  }
  if (!keys.every((key) => key === 'operation' || key === 'corpusId' || key === 'position')) {
    return null;
  }
  return Object.freeze({ corpusId: record.corpusId, position: record.position });
}

function exactJsonAddressTuples(userText: string): readonly DirectAddressTuple[] | null {
  const rawObjects = [...userText.matchAll(ADDRESS_JSON_OBJECT)].map((match) => match[0]);
  if (rawObjects.length === 0 || (userText.match(ANY_BULLET_LINE)?.length ?? 0) > 0) return null;
  const textWithoutObjects = rawObjects.reduce((text, raw) => text.replace(raw, ''), userText);
  if (/[{}]/u.test(textWithoutObjects)) return null;
  const tuples = rawObjects.map(parseAddressJsonTuple);
  return tuples.every((tuple): tuple is DirectAddressTuple => tuple !== null) ? tuples : null;
}

function exactBulletAddressTuples(userText: string): readonly DirectAddressTuple[] | null {
  if (!DIRECT_ADDRESS_ONLY.test(userText) || /[{}]/u.test(userText)) return null;
  const bulletLines = userText.match(ANY_BULLET_LINE) ?? [];
  const tuples = [...userText.matchAll(ADDRESS_BULLET)].map((match) => ({
    corpusId: match[1]!,
    position: match[2]!,
  }));
  if (
    bulletLines.length === 0 ||
    tuples.length !== bulletLines.length ||
    tuples.some(
      ({ corpusId, position }) =>
        !ADDRESS_CORPUS_ID.test(corpusId) || !boundedAddressPosition(position),
    )
  ) {
    return null;
  }
  return tuples;
}

/**
 * Selects the bounded, read-only Context Map tool for explicit tool requests
 * and natural requests that ask for answers or evidence from file-like sources.
 * Mixed read/write requests retain the normal tool catalog so this classifier
 * never silently removes capabilities needed to satisfy an authorized mutation.
 */
export function requestsReadOnlyContextTool(userText: string): boolean {
  if (EXPLICIT_CONTEXT_TOOL.test(userText)) return true;
  if (MUTATING_REQUEST.test(userText)) return false;
  return READ_OR_EVIDENCE_REQUEST.test(userText) && FILE_LIKE_SOURCE.test(userText);
}

/**
 * Recognizes only an affirmative, explicit request to invoke the bounded
 * Context Map address operation. It never extracts or normalizes arguments;
 * callers use this signal solely to preserve the user's exact provider text.
 */
export function requestsDirectContextAddress(userText: string): boolean {
  if (
    userText.length === 0 ||
    userText.length > MAX_DIRECT_CONTEXT_REQUEST_CHARS ||
    UNSAFE_DIRECT_CONTEXT_CONTROL.test(userText) ||
    !/\bvibespace_context\b/iu.test(userText) ||
    explicitlyNegatesAddressInvocation(userText) ||
    DESCRIPTIVE_DIRECT_ADDRESS.test(userText) ||
    !DIRECT_CALL_VERB.test(userText) ||
    DIRECT_OTHER_DOTTED.test(userText) ||
    DIRECT_OTHER_OPERATION.test(userText)
  ) {
    return false;
  }
  const tuples = exactJsonAddressTuples(userText) ?? exactBulletAddressTuples(userText);
  if (!tuples || !uniqueBoundedAddressTuples(tuples)) return false;
  const declaredCount = declaredAddressCallCount(userText);
  return declaredCount !== undefined && (declaredCount === null || declaredCount === tuples.length);
}
