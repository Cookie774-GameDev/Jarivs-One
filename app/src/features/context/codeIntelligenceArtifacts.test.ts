import { describe, expect, it } from 'vitest';
import {
  CODE_ENTRY_POINT_SIGNAL_KINDS,
  buildCodeIntelligenceSummary,
  planAffectedCodeSummaryRegeneration,
  rankCodeEntryPoints,
} from './codeIntelligenceArtifacts';

const revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const authority = { getCurrentRevision: () => revision };

describe('code-intelligence entry points and derived summaries', () => {
  it('defines all eight entry-point signal families', () => {
    expect(CODE_ENTRY_POINT_SIGNAL_KINDS).toEqual([
      'package_manifest',
      'application_entry',
      'route_root',
      'exported_library',
      'readme_guidance',
      'build_script',
      'centrality',
      'framework_convention',
    ]);
  });

  it('ranks entry points deterministically and cites why each was selected', () => {
    expect(
      rankCodeEntryPoints([
        {
          path: 'src/main.ts',
          signals: [
            {
              kind: 'application_entry',
              evidenceRef: 'src/main.ts#L1',
              confidence: 1,
            },
            {
              kind: 'framework_convention',
              evidenceRef: 'package.json#framework',
              confidence: 0.9,
            },
          ],
        },
        {
          path: 'README.md',
          signals: [
            {
              kind: 'readme_guidance',
              evidenceRef: 'README.md#L20',
              confidence: 0.8,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        path: 'src/main.ts',
        rank: 1,
        score: 1.575,
        reasons: [
          {
            signal: 'application_entry',
            evidenceRef: 'src/main.ts#L1',
            confidence: 1,
          },
          {
            signal: 'framework_convention',
            evidenceRef: 'package.json#framework',
            confidence: 0.9,
          },
        ],
      },
      {
        path: 'README.md',
        rank: 2,
        score: 0.48,
        reasons: [
          {
            signal: 'readme_guidance',
            evidenceRef: 'README.md#L20',
            confidence: 0.8,
          },
        ],
      },
    ]);
  });

  it('stores summaries as derived artifacts with complete generation provenance', () => {
    expect(
      buildCodeIntelligenceSummary(
        {
          summaryId: 'summary-1',
          targetId: 'module-1',
          text: 'Builds bounded Context graphs.',
          providerId: 'ollama',
          modelId: 'qwen3',
          promptVersion: 'code-summary-v1',
          sourceRevisions: [{ sourceId: 'src/context.ts', revision }],
          generatedAt: '2026-07-26T08:00:00.000Z',
          confidence: 0.91,
        },
        authority,
      ),
    ).toEqual({
      summaryId: 'summary-1',
      targetId: 'module-1',
      text: 'Builds bounded Context graphs.',
      providerId: 'ollama',
      modelId: 'qwen3',
      promptVersion: 'code-summary-v1',
      sourceRevisions: [{ sourceId: 'src/context.ts', revision }],
      generatedAt: '2026-07-26T08:00:00.000Z',
      confidence: 0.91,
      derived: true,
      executable: false,
    });
  });

  it('regenerates only summaries whose trusted source revisions changed', () => {
    const first = buildCodeIntelligenceSummary(
      {
        summaryId: 'summary-1',
        targetId: 'module-1',
        text: 'Context graph.',
        providerId: 'ollama',
        modelId: 'qwen3',
        promptVersion: 'code-summary-v1',
        sourceRevisions: [{ sourceId: 'src/context.ts', revision }],
        generatedAt: '2026-07-26T08:00:00.000Z',
        confidence: 0.9,
      },
      authority,
    );
    const second = buildCodeIntelligenceSummary(
      {
        summaryId: 'summary-2',
        targetId: 'module-2',
        text: 'Search graph.',
        providerId: 'ollama',
        modelId: 'qwen3',
        promptVersion: 'code-summary-v1',
        sourceRevisions: [{ sourceId: 'src/search.ts', revision }],
        generatedAt: '2026-07-26T08:00:00.000Z',
        confidence: 0.9,
      },
      authority,
    );
    expect(
      planAffectedCodeSummaryRegeneration([first, second], {
        getCurrentRevision: (sourceId) =>
          sourceId === 'src/context.ts' ? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' : revision,
      }),
    ).toEqual({
      regenerateSummaryIds: ['summary-1'],
      unchangedSummaryIds: ['summary-2'],
      affectedOnly: true,
      executable: false,
    });
  });

  it('rejects stale source claims, uncited entry points, duplicates, and invalid confidence', () => {
    expect(() =>
      buildCodeIntelligenceSummary(
        {
          summaryId: 'summary-1',
          targetId: 'module-1',
          text: 'Stale.',
          providerId: 'ollama',
          modelId: 'qwen3',
          promptVersion: 'code-summary-v1',
          sourceRevisions: [{ sourceId: 'src/context.ts', revision }],
          generatedAt: '2026-07-26T08:00:00.000Z',
          confidence: 0.9,
        },
        {
          getCurrentRevision: () => 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      ),
    ).toThrow(/revision/i);
    expect(() => rankCodeEntryPoints([{ path: 'src/main.ts', signals: [] }])).toThrow(
      /signal|reason/i,
    );
    expect(() =>
      rankCodeEntryPoints([
        {
          path: 'src/main.ts',
          signals: [{ kind: 'centrality', evidenceRef: 'graph:1', confidence: 2 }],
        },
      ]),
    ).toThrow(/confidence/i);
  });
});
