import { describe, expect, it } from 'vitest';
import { deriveJarvisSpokenText } from './spokenDelivery';

describe('deriveJarvisSpokenText', () => {
  it('speaks an extractive executive summary for long-form delivery', () => {
    const prose = [
      'Completed, sir.',
      'The implementation specification is ready.',
      'The architecture section documents every boundary and dependency.',
      'The security section records the threat model and recovery controls.',
      'The verification section contains the complete test matrix and evidence.',
    ].join(' ');

    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: prose,
        mode: 'long_form_delivery',
      }),
    ).toBe('Completed, sir. The implementation specification is ready.');
  });

  it('replaces unsafe speech structures without reading their raw contents', () => {
    const rawJson = '{"status":"ready","items":[1,2]}';
    const windowsPath =
      'C:\\Users\\viper\\VibeSpace\\docs\\reports\\implementation-verification-report.md';
    const unixPath = '/workspace/vibespace/docs/reports/security-verification-report.md';
    const rawUrl = 'https://example.test/reports/implementation?download=1';
    const prose = [
      `The full report is displayed at \`${windowsPath}\`.`,
      `The structured result is ${rawJson}.`,
      `The secondary report is stored at ${unixPath}.`,
      `The reference is ${rawUrl}.`,
      '```ts',
      'const privateImplementation = true;',
      '```',
      '\uE000JARVIS_REGION_9\uE001',
    ].join('\n');

    const spoken = deriveJarvisSpokenText({
      proseWithPlaceholders: prose,
      mode: 'direct_answer',
    });

    expect(spoken).toBe(
      'The full report is displayed at the referenced location. ' +
        'The structured result is the structured data shown on screen. ' +
        'The secondary report is stored at the referenced location. ' +
        'The reference is the referenced link.',
    );
    expect(spoken).not.toContain(rawJson);
    expect(spoken).not.toContain(windowsPath);
    expect(spoken).not.toContain(unixPath);
    expect(spoken).not.toContain(rawUrl);
    expect(spoken).not.toMatch(/```|privateImplementation|JARVIS_REGION/);
  });

  it.each([
    ['non-HTTP URI', 'vscode://file/C:/Users/viper/VibeSpace/report.md', 'link'],
    ['www URL', 'www.example.test/reports/implementation', 'link'],
    ['UNC path', '\\\\server\\team share\\reports\\implementation report.md', 'location'],
    ['forward-slash Windows path', 'C:/Users/viper/VibeSpace/reports/result.md', 'location'],
    [
      'quoted Windows path with spaces',
      '"C:\\Program Files\\VibeSpace\\reports\\implementation report.md"',
      'location',
    ],
    ['mounted Unix path', '/mnt/c/VibeSpace/reports/result.md', 'location'],
    ['service Unix path', '/srv/vibespace/reports/result.md', 'location'],
    ['root Unix path', '/root/vibespace/reports/result.md', 'location'],
    ['macOS volume path', '/Volumes/VibeSpace/reports/result.md', 'location'],
  ])('does not speak a raw %s', (_label, unsafeValue, replacementKind) => {
    const spoken = deriveJarvisSpokenText({
      proseWithPlaceholders: `The artifact is ${unsafeValue}.`,
      mode: 'direct_answer',
    });

    expect(spoken).toBe(
      `The artifact is the referenced ${replacementKind === 'link' ? 'link' : 'location'}.`,
    );
    expect(spoken).not.toContain(unsafeValue.replace(/^"|"$/g, ''));
  });

  it.each([
    ['balanced URI delimiters', 'https://example.test/a_(private-detail)', 'link'],
    ['unquoted path spaces', 'C:\\Program Files\\VibeSpace\\private reports', 'location'],
    [
      'balanced unquoted path delimiters',
      'C:\\Program Files (x86)\\VibeSpace\\private reports',
      'location',
    ],
    [
      'prose-boundary path segment collision',
      'C:\\work is unavailable\\private reports',
      'location',
    ],
  ])('does not leak a %s suffix', (_label, unsafeValue, replacementKind) => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: `The artifact is ${unsafeValue}.`,
        mode: 'direct_answer',
      }),
    ).toBe(`The artifact is the referenced ${replacementKind}.`);
  });

  it('discards an oversized reference without speaking its suffix', () => {
    const rawUrl = `https://example.test/${'a'.repeat(3_000)}?private=suffix`;

    const spoken = deriveJarvisSpokenText({
      proseWithPlaceholders: `The artifact is ${rawUrl}.`,
      mode: 'direct_answer',
    });

    expect(spoken).toBe('The artifact is the referenced link.');
    expect(spoken).not.toMatch(/private|suffix|a{20}/);
  });

  it('preserves warning and recovery prose after an extensionless path', () => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: 'The artifact at C:\\work is unavailable. Retry manually.',
        mode: 'warning',
      }),
    ).toBe('The artifact at the referenced location is unavailable. Retry manually.');
  });

  it.each([
    ['object', '{"status":"ready".'],
    ['array', '[1,2,3.'],
  ])('does not speak a truncated JSON %s', (_label, truncatedJson) => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: `The result is ${truncatedJson}`,
        mode: 'direct_answer',
      }),
    ).toBe('The result is the structured data shown on screen.');
  });

  it('pronounces model and provider identifiers without changing display-oriented input', () => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders:
          'Current model: openai / gpt-5.6 (native-api, authenticated). Ollama selected llama3.2.',
        mode: 'status',
      }),
    ).toBe(
      'Current model: Open A I, G P T 5 point 6 (native A P I, authenticated). ' +
        'Ollama selected Llama 3 point 2.',
    );
  });

  it.each([
    ['gpt-4o', 'G P T 4 o'],
    ['claude-sonnet-4-5', 'Claude Sonnet 4 5'],
    ['gpt-oss:20b', 'G P T O S S 20 B'],
  ])('pronounces the common model identifier %s', (identifier, pronunciation) => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: `Current model: ${identifier}.`,
        mode: 'status',
      }),
    ).toBe(`Current model: ${pronunciation}.`);
  });

  it('foregrounds an existing warning when summarizing a long warning response', () => {
    const prose = [
      'The report covers three systems.',
      'The evidence is available on screen.',
      'Warning: provider verification is incomplete.',
      'The remaining sections describe each provider in detail.',
      'The appendix contains additional observations.',
    ].join(' ');

    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: prose,
        mode: 'warning',
      }),
    ).toBe('Warning: provider verification is incomplete. The report covers three systems.');
  });

  it('retains warning severity even when compliant prose has no warning label', () => {
    const prose = [
      'Provider verification remains incomplete.',
      'The report is available on screen.',
      'Additional evidence follows in the displayed artifact.',
      'No further spoken detail is necessary.',
    ].join(' ');

    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: prose,
        mode: 'warning',
      }),
    ).toBe('Warning. Provider verification remains incomplete.');
  });

  it.each([
    {
      mode: 'long_form_delivery' as const,
      prose: [
        'The report compares the available approaches.',
        'The displayed analysis contains the complete evidence.',
        'The final provider outcome remains uncertain.',
        'Additional implementation details follow on screen.',
      ].join(' '),
    },
    {
      mode: 'recommendation' as const,
      prose: [
        `The recommended option preserves compatibility ${'and remains straightforward '.repeat(10)}.`,
        `The alternative requires more migration work ${'and additional validation '.repeat(10)}.`,
        'The final cost estimate remains unverified.',
        'The complete comparison is available on screen.',
      ].join(' '),
    },
  ])('retains uncertainty when summarizing $mode', ({ mode, prose }) => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: prose,
        mode,
      }),
    ).toMatch(
      /^(?:The final provider outcome remains uncertain|The final cost estimate remains unverified)\./,
    );
  });

  it('does not treat calendar or permissive uses of may as uncertainty', () => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: [
          'The implementation summary is ready.',
          'The May release remains documented.',
          'You may open Settings to inspect it.',
          'The complete report is available on screen.',
        ].join(' '),
        mode: 'long_form_delivery',
      }),
    ).toBe('The implementation summary is ready. The May release remains documented.');
  });

  it.each([
    {
      mode: 'action_success' as const,
      executionState: {
        status: 'completed' as const,
        verifiedBy: 'journal' as const,
        lastEventSeq: 8,
      },
      truthSentence: 'The action completed successfully.',
    },
    {
      mode: 'action_running' as const,
      executionState: {
        status: 'queued' as const,
        verifiedBy: 'journal' as const,
        lastEventSeq: 8,
      },
      truthSentence: 'The action remains queued.',
    },
    {
      mode: 'approval_required' as const,
      executionState: {
        status: 'awaiting_approval' as const,
        verifiedBy: 'journal' as const,
        lastEventSeq: 8,
      },
      truthSentence: 'Approval is required before execution.',
    },
    {
      mode: 'status' as const,
      executionState: {
        status: 'cancelled' as const,
        verifiedBy: 'journal' as const,
        lastEventSeq: 8,
      },
      truthSentence: 'The action was cancelled before completion.',
    },
  ])(
    'retains $executionState.status lifecycle truth when summarizing $mode',
    ({ mode, executionState, truthSentence }) => {
      const prose = [
        'The report covers three systems.',
        'The evidence is available on screen.',
        truthSentence,
        'The remaining sections contain detailed implementation evidence.',
      ].join(' ');

      expect(
        deriveJarvisSpokenText({
          proseWithPlaceholders: prose,
          mode,
          verifiedFacts: {
            executionState,
            modelState: 'authenticated',
            terminalState: undefined,
          },
        }),
      ).toBe(`${truthSentence} The report covers three systems.`);
    },
  );

  it('adds the verified lifecycle anchor when detailed prose omits it', () => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: [
          'The report covers three systems.',
          'The evidence is available on screen.',
          'The remaining sections contain implementation detail.',
        ].join(' '),
        mode: 'action_success',
        verifiedFacts: {
          executionState: {
            status: 'completed',
            verifiedBy: 'journal',
            lastEventSeq: 8,
          },
          modelState: 'authenticated',
          terminalState: undefined,
        },
      }),
    ).toBe('The action completed. The report covers three systems.');
  });

  it('returns no speech when only immutable structured regions remain', () => {
    expect(
      deriveJarvisSpokenText({
        proseWithPlaceholders: '\uE000JARVIS_REGION_0\uE001',
        mode: 'direct_answer',
      }),
    ).toBe('');
  });

  it('handles a large adversarial unmatched-JSON input within the test timeout', () => {
    const prose = `Status remains available. ${'{'.repeat(100_000)}`;

    const spoken = deriveJarvisSpokenText({
      proseWithPlaceholders: prose,
      mode: 'status',
    });

    expect(spoken).toContain('Status remains available.');
  }, 1_000);
});
