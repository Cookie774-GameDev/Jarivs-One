import { describe, expect, it } from 'vitest';
import {
  parseDirectContextEvidenceContinuation,
  parseMandatoryContextEvidenceResearch,
  requestsDirectContextAddress,
} from './contextToolIntent';

const LIVE_TEST07_MANDATORY_RESEARCH = `Use only the production vibespace_context tool against the currently approved physical Test07 Context Map. Current physical bytes are the only authority. Complete both stages below in this single provider turn before writing any answer.

STAGE 1 — REQUIRED SEARCHES
Make exactly five search calls, one for each numbered question below, each with limit 3. Do not answer after the searches.

STAGE 2 — REQUIRED PHYSICAL EVIDENCE
From those five search results, select the canonical trusted pointer for each of these exact six required sources: shard-0000.txt, shard-0025.txt, shard-0047.txt, shard-0048.txt, shard-0063.txt, shard-0095.txt. Then make exactly six expand calls, one per selected source, with beforeBytes=256 and afterBytes=0. These six expand calls are mandatory even when a search preview appears to contain an answer. Search previews are not sufficient evidence. Do not call open, address, or any other tool. Reject STATUS SUPERSEDED_UNTRUSTED. Total expanded physical text must be <=24 KiB.

QUESTIONS
1. In the fresh Test07 archive, what verification key is assigned to the canonical Frostglass Array checkpoint at the end-boundary record?
2. For the canonical Moonwake Beacon opening-boundary record, what recovery color and verification number are active?
3. The canonical Northwind relay handoff crosses two neighboring Test07 shards. What phrase was left by the sending clerk, and what answer did the receiving clerk pair with it?
4. According to the canonical middle-region record for Station Emberline, where is the emergency sextant stored and what is its verification number?
5. At the final-boundary canonical record for Observatory Kestrel, who signed the calibration and what non-guessable multiplier was recorded?

OUTPUT ONLY AFTER ALL 11 REQUIRED CALLS
Return a compact Q1–Q5 table. For each answer include the exact answer, exact filename, canonical RECORD_ID, RECORD_REVISION, canonical record 1-based line range, canonical record half-open byte range, and full sourceVersion/contentHash as exactly 64 lowercase hexadecimal characters with no prefix or link. Include rejected decoy values. Q3 must include both sources independently. End with exact search count, expand count, and aggregate expanded bytes. If you cannot make exactly five searches followed by exactly six expansions or cannot verify any physical fact, output FAIL instead of a partial answer.`;

const LIVE_TEST07_PRIOR_POINTER_CONTINUATION = `Your prior answer is incomplete because it used previews only and omitted required physical provenance. Do not repeat any search and do not reuse preview text as evidence.

Using only the exact six search-result pointers already returned in this chat for shard-0000.txt, shard-0025.txt, shard-0047.txt, shard-0048.txt, shard-0063.txt, and shard-0095.txt, make exactly six vibespace_context expand calls: one per source, each with beforeBytes=256 and afterBytes=0. Do not call open, search, address, or any other tool. Reject STATUS SUPERSEDED_UNTRUSTED.

Then return the compact Q1–Q5 table with the verified exact answer, exact filename, canonical RECORD_ID, RECORD_REVISION, canonical record 1-based line range, canonical record half-open byte range, full sourceVersion/contentHash as exactly 64 lowercase hex characters with no prefix or link, and rejected decoy value. Q3 must include both sources independently. End with exactly: prior searches=5; this-turn expands=6; total retrieval calls=6; aggregate expanded bytes=<exact sum>. If the exact prior pointers are unavailable or any required physical fact cannot be read from the six results, say FAIL rather than guessing.`;

const LIVE_TEST08_ADDRESS_BATCH_1 = `This is batch 1 of 2 for one Test08 run in the same retained chat.
Use the production vibespace_context address operation only. Do not use search, open, or expand.
Make exactly 9 address calls, one for each case below, and no other tool calls.
For each call, use the exact corpusId and canonical decimal position.
Return one row per case in this order: corpusId | position | shard | offset | tokenStart | tokenEnd | source filename | source SHA-256 | exact CANONICAL_MARKER.
Do not infer missing values. Sparse logical addressability is under test.
Truth labels: 10B PHYSICAL INGESTION: NOT RUN; TRANSPORT CANCELLATION: NOT CERTIFIED.
- t08-boundary-100b @ 99999999999
- t08-boundary-100b @ 100000000000
- t08-boundary-100b @ 100000000001
- t08-boundary-10b @ 9999999999
- t08-boundary-10b @ 10000000000
- t08-boundary-10b @ 10000000001
- t08-boundary-10b @ 10000000002
- t08-boundary-1b @ 999999999
- t08-boundary-1b @ 1000000000`;

const LIVE_TEST08_ADDRESS_BATCH_2 = `This is batch 2 of 2 for one Test08 run in the same retained chat.
Use the production vibespace_context address operation only. Do not use search, open, or expand.
Make exactly 8 address calls, one for each case below, and no other tool calls.
For each call, use the exact corpusId and canonical decimal position.
Return one row per case in this order: corpusId | position | shard | offset | tokenStart | tokenEnd | source filename | source SHA-256 | exact CANONICAL_MARKER.
Do not infer missing values. Sparse logical addressability is under test.
Truth labels: 10B PHYSICAL INGESTION: NOT RUN; TRANSPORT CANCELLATION: NOT CERTIFIED.
- t08-boundary-1b @ 1000000001
- t08-safe-transition @ 9007199254740991
- t08-safe-transition @ 9007199254740992
- t08-safe-transition @ 9007199254740993
- t08-size-exact-10b @ 5000000000
- t08-size-exact-10b-plus-1 @ 10000000000
- t08-size-exact-1b @ 500000000
- t08-supported-maximum @ 9999999999999999`;

describe('requestsDirectContextAddress', () => {
  const exactJson = '{"operation":"address","corpusId":"uat-a","position":"10000000000"}';

  it.each([LIVE_TEST08_ADDRESS_BATCH_1, LIVE_TEST08_ADDRESS_BATCH_2])(
    'admits an exact live batch that forbids only substitute operations',
    (prompt) => {
      expect(requestsDirectContextAddress(prompt)).toBe(true);
    },
  );

  it('rejects a live-form address call count that does not match its tuples', () => {
    expect(
      requestsDirectContextAddress(
        LIVE_TEST08_ADDRESS_BATCH_1.replace(
          'Make exactly 9 address calls',
          'Make exactly 8 address calls',
        ),
      ),
    ).toBe(false);
  });

  it.each([
    `Call vibespace_context with ${exactJson}.`,
    `Please invoke vibespace_context with ${exactJson} exactly once.`,
    [
      'Use vibespace_context address operation only. Make these three calls in order:',
      '- uat-a @ 0',
      '- uat-a @ 9007199254740992',
      '- uat-b_2@revision.7 @ 10000000000000000',
    ].join('\n'),
  ])('accepts complete exact address tuples: %s', (prompt) => {
    expect(requestsDirectContextAddress(prompt)).toBe(true);
  });

  it.each([
    'Search the Context Map for address records.',
    'Explain whether vibespace_context.address is supported.',
    'Please explain how to call vibespace_context.address safely.',
    'Do not call vibespace_context.address.',
    `Do not make vibespace_context ${exactJson} calls.`,
    `Avoid calling vibespace_context with ${exactJson}.`,
    `Without calling vibespace_context, inspect ${exactJson}.`,
    `For vibespace_context ${exactJson}, do not make address calls.`,
    `Never invoke the address operation through vibespace_context with ${exactJson}.`,
    `No vibespace_context address calls: ${exactJson}.`,
    'Call vibespace_context.search or vibespace_context.address.',
    'Call vibespace_context with operation="address" or operation="search".',
    'Call vibespace_context with {"operation":"address","position":"10"}.',
    'Call vibespace_context with {"operation":"address","corpusId":"uat-a"}.',
    'Call vibespace_context with {"operation":"address","corpusId":"uat-a","position":"1e9"}.',
    'Call vibespace_context with {"operation":"address","corpusId":"uat-a","position":10000000000}.',
    'Call vibespace_context with {"operation":"address","corpusId":"../uat-a","position":"10"}.',
    'Call vibespace_context with {"operation":"address","corpusId":"uat:a","position":"10"}.',
    `Call vibespace_context with {"operation":"address","corpusId":"${'a'.repeat(201)}","position":"10"}.`,
    'Call vibespace_context with {"operation":"address","corpusId":"uat-a","position":"010"}.',
    'Call vibespace_context with {"operation":"address","corpusId":"uat-a","position":"10000000000000001"}.',
    `Call vibespace_context with ${exactJson} and ${exactJson}.`,
    `Call vibespace_context twice with ${exactJson}.`,
    [
      'Use vibespace_context address operation only. Make these two calls in order:',
      '- uat-a @ 10',
    ].join('\n'),
    [
      'Use vibespace_context address operation only. Make these two calls in order:',
      '- uat-a @ 10',
      '- uat-a @ 10',
    ].join('\n'),
    [
      'Use vibespace_context address operation only. Make these two calls in order:',
      '- uat-a @ 10',
      '- ../uat-b @ 11',
    ].join('\n'),
    [
      'Use vibespace_context address operation only. Make these one calls in order:',
      '- uat-a @ 10',
      '- uat-b @ 11',
    ].join('\n'),
    [
      'Use vibespace_context address operation only. Make these thirteen calls in order:',
      ...Array.from({ length: 13 }, (_, index) => `- uat-a @ ${index}`),
    ].join('\n'),
    'Call vibespace_context with operation="address\u0000".',
    `Call vibespace_context.address ${'x'.repeat(32_769)}`,
    'Call vibespace_context with operation="addresses".',
  ])('rejects a negative, ambiguous, descriptive, or malformed trigger: %s', (prompt) => {
    expect(requestsDirectContextAddress(prompt)).toBe(false);
  });

  it('accepts twelve unique exact JSON tuples but rejects a thirteenth', () => {
    const tuples = Array.from(
      { length: 13 },
      (_, index) => `{"operation":"address","corpusId":"uat-${index}","position":"${index}"}`,
    );

    expect(
      requestsDirectContextAddress(
        `Call vibespace_context with these twelve calls:\n${tuples.slice(0, 12).join('\n')}`,
      ),
    ).toBe(true);
    expect(
      requestsDirectContextAddress(
        `Call vibespace_context with these thirteen calls:\n${tuples.join('\n')}`,
      ),
    ).toBe(false);
  });

  it('uses the exact production corpus identifier grammar and length boundary', () => {
    const exact200CharacterId = `a@${'b'.repeat(198)}`;

    expect(
      requestsDirectContextAddress(
        `Call vibespace_context with {"operation":"address","corpusId":"uat@revision-1","position":"10"}.`,
      ),
    ).toBe(true);
    expect(
      requestsDirectContextAddress(
        `Call vibespace_context with {"operation":"address","corpusId":"${exact200CharacterId}","position":"10"}.`,
      ),
    ).toBe(true);
    expect(exact200CharacterId).toHaveLength(200);
  });
});

describe('bounded Test07 evidence intent', () => {
  it('recognizes the exact live mandatory five-search and six-source expansion contract', () => {
    expect(parseMandatoryContextEvidenceResearch(LIVE_TEST07_MANDATORY_RESEARCH)).toEqual({
      questionCount: 5,
      operation: 'expand',
      evidenceCount: 6,
      sources: [
        'shard-0000.txt',
        'shard-0025.txt',
        'shard-0047.txt',
        'shard-0048.txt',
        'shard-0063.txt',
        'shard-0095.txt',
      ],
      beforeBytes: 256,
      afterBytes: 0,
      maxTotalBytes: 24 * 1024,
    });
  });

  it('recognizes the exact live same-chat prior-pointer continuation', () => {
    expect(parseDirectContextEvidenceContinuation(LIVE_TEST07_PRIOR_POINTER_CONTINUATION)).toEqual({
      operation: 'expand',
      evidenceCount: 6,
      sources: [
        'shard-0000.txt',
        'shard-0025.txt',
        'shard-0047.txt',
        'shard-0048.txt',
        'shard-0063.txt',
        'shard-0095.txt',
      ],
      beforeBytes: 256,
      afterBytes: 0,
    });
  });

  it.each(['do not', "don't", 'never', 'avoid', 'without'])(
    'does not invert an adjacent %s expand negation into direct authority',
    (negation) => {
      expect(
        parseDirectContextEvidenceContinuation(
          LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace(
            'make exactly six vibespace_context expand calls',
            `${negation} make exactly six vibespace_context expand calls`,
          ),
        ),
      ).toBeNull();
    },
  );

  it('rejects a negated mandatory expansion and a conflicting affirmative operation', () => {
    expect(
      parseMandatoryContextEvidenceResearch(
        LIVE_TEST07_MANDATORY_RESEARCH.replace(
          'Then make exactly six expand calls',
          'Then do not make exactly six expand calls',
        ),
      ),
    ).toBeNull();
    expect(
      parseMandatoryContextEvidenceResearch(
        `${LIVE_TEST07_MANDATORY_RESEARCH}\nAlso make exactly one open call.`,
      ),
    ).toBeNull();
  });

  it.each(['seven', '999999'])(
    'retains an invalid appended %s-call count as a mandatory/direct conflict',
    (count) => {
      const conflict = `Also make exactly ${count} expand calls.`;
      expect(
        parseMandatoryContextEvidenceResearch(`${LIVE_TEST07_MANDATORY_RESEARCH}\n${conflict}`),
      ).toBeNull();
      expect(
        parseDirectContextEvidenceContinuation(
          `${LIVE_TEST07_PRIOR_POINTER_CONTINUATION}\n${conflict}`,
        ),
      ).toBeNull();
    },
  );

  it.each(['open', 'search', 'address'])(
    'rejects a conflicting affirmative %s call count in an expand continuation',
    (operation) => {
      expect(
        parseDirectContextEvidenceContinuation(
          `${LIVE_TEST07_PRIOR_POINTER_CONTINUATION}\nAlso make exactly one ${operation} call.`,
        ),
      ).toBeNull();
    },
  );

  it('admits one exact prior-pointer open continuation without granting a new search', () => {
    expect(
      parseDirectContextEvidenceContinuation(
        'Using only the exact prior Q2 pointer already present in this chat, make exactly one vibespace_context open call with maxBytes=4096. Do not call search, expand, address, or any other tool.',
      ),
    ).toEqual({
      operation: 'open',
      evidenceCount: 1,
      sources: [],
      maxBytes: 4096,
    });
  });

  it.each([
    'Explain how prior-pointer expand calls work.',
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('make exactly six', 'do not make six'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('exact six search-result pointers', 'six files'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('beforeBytes=256', 'beforeBytes=0'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('beforeBytes=256', 'beforeBytes=2049'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('afterBytes=0', 'afterBytes=-1'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('exactly six', 'exactly seven'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace(
      'exact six search-result pointers',
      'exact five search-result pointers',
    ),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('shard-0095.txt', 'shard-0095.txt.evil'),
    LIVE_TEST07_PRIOR_POINTER_CONTINUATION.replace('shard-0095.txt', 'shard-0000.txt'),
    `${LIVE_TEST07_PRIOR_POINTER_CONTINUATION}\nAlso make exactly one open call.`,
    `${LIVE_TEST07_PRIOR_POINTER_CONTINUATION}\u0000`,
    `Using only exact prior pointers already returned in this chat, make exactly six vibespace_context expand calls. Do not call search. ${'x'.repeat(32_769)}`,
  ])('rejects unsafe or ambiguous prior-pointer continuation: %s', (prompt) => {
    expect(parseDirectContextEvidenceContinuation(prompt)).toBeNull();
  });

  it.each([
    LIVE_TEST07_MANDATORY_RESEARCH.replace('exactly six expand calls', 'exactly five expand calls'),
    LIVE_TEST07_MANDATORY_RESEARCH.replace('beforeBytes=256', 'beforeBytes=0'),
    LIVE_TEST07_MANDATORY_RESEARCH.replace('beforeBytes=256', 'beforeBytes=128'),
    LIVE_TEST07_MANDATORY_RESEARCH.replace('afterBytes=0', 'afterBytes=4096'),
    LIVE_TEST07_MANDATORY_RESEARCH.replace('Search previews are not sufficient evidence.', ''),
    LIVE_TEST07_MANDATORY_RESEARCH.replace('shard-0095.txt', 'shard-0000.txt'),
  ])('rejects malformed mandatory research intent: %s', (prompt) => {
    expect(parseMandatoryContextEvidenceResearch(prompt)).toBeNull();
  });
});
