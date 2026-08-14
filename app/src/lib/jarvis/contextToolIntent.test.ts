import { describe, expect, it } from 'vitest';
import { requestsDirectContextAddress } from './contextToolIntent';

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
