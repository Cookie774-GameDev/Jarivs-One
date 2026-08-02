import { describe, expect, it } from 'vitest';
import {
  CODE_INTELLIGENCE_ENTITY_KINDS,
  CODE_INTELLIGENCE_RELATIONSHIP_KINDS,
  buildCodeIntelligenceGraph,
} from './codeIntelligenceGraph';

const parser = {
  name: 'typescript_compiler',
  astDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  parserBacked: true as const,
  regexOnlySymbolExtraction: false as const,
};
const authority = { verifyParserEvidence: () => true };

const entities = [
  {
    id: 'module-1',
    kind: 'module' as const,
    name: 'context',
    filePath: 'src/context.ts',
    startLine: 1,
    endLine: 100,
  },
  {
    id: 'function-1',
    kind: 'function' as const,
    name: 'buildContext',
    filePath: 'src/context.ts',
    startLine: 10,
    endLine: 30,
  },
  {
    id: 'test-1',
    kind: 'test' as const,
    name: 'builds context',
    filePath: 'src/context.test.ts',
    startLine: 5,
    endLine: 15,
  },
];

describe('parsed code-intelligence entities and relationships', () => {
  it('defines all fourteen entity kinds and eleven relationship kinds', () => {
    expect(CODE_INTELLIGENCE_ENTITY_KINDS).toEqual([
      'module',
      'import',
      'export',
      'function',
      'class',
      'method',
      'react_component',
      'route',
      'api_handler',
      'database_migration',
      'test',
      'configuration',
      'script',
      'dependency',
    ]);
    expect(CODE_INTELLIGENCE_RELATIONSHIP_KINDS).toEqual([
      'imports',
      'exports',
      'calls',
      'component_composition',
      'route_to_handler',
      'handler_to_service',
      'service_to_database',
      'source_to_test',
      'config_to_feature',
      'migration_to_table',
      'script_to_command',
    ]);
  });

  it('normalizes parser-backed AST entities and evidence-backed relationships', () => {
    expect(
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser,
            },
            {
              filePath: 'src/context.test.ts',
              language: 'typescript',
              sourceRevision: 'cccccccccccccccccccccccccccccccccccccccc',
              parser,
            },
          ],
          entities,
          relationships: [
            {
              id: 'relation-1',
              kind: 'calls',
              fromEntityId: 'module-1',
              toEntityId: 'function-1',
              evidence: 'type_checker',
              confidence: 1,
            },
            {
              id: 'relation-2',
              kind: 'source_to_test',
              fromEntityId: 'module-1',
              toEntityId: 'test-1',
              evidence: 'framework',
              confidence: 0.95,
            },
          ],
        },
        authority,
      ),
    ).toMatchObject({
      parserBacked: true,
      regexOnlySymbolExtraction: false,
      entities,
      relationships: [
        { kind: 'calls', heuristic: false, confidence: 1 },
        { kind: 'source_to_test', heuristic: false, confidence: 0.95 },
      ],
      executable: false,
    });
  });

  it('marks heuristic edges and requires explicit bounded confidence', () => {
    const graph = buildCodeIntelligenceGraph(
      {
        files: [
          {
            filePath: 'src/context.ts',
            language: 'typescript',
            sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            parser,
          },
          {
            filePath: 'src/context.test.ts',
            language: 'typescript',
            sourceRevision: 'cccccccccccccccccccccccccccccccccccccccc',
            parser,
          },
        ],
        entities,
        relationships: [
          {
            id: 'relation-1',
            kind: 'config_to_feature',
            fromEntityId: 'module-1',
            toEntityId: 'function-1',
            evidence: 'heuristic',
            confidence: 0.72,
          },
        ],
      },
      authority,
    );
    expect(graph.relationships[0]).toMatchObject({
      evidence: 'heuristic',
      heuristic: true,
      confidence: 0.72,
    });
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: graph.files,
          entities,
          relationships: [
            {
              id: 'relation-1',
              kind: 'config_to_feature',
              fromEntityId: 'module-1',
              toEntityId: 'function-1',
              evidence: 'heuristic',
              confidence: 1,
            },
          ],
        },
        authority,
      ),
    ).toThrow(/confidence/i);
  });

  it('accepts calls only when AST or type-checker evidence makes them reliable', () => {
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser,
            },
          ],
          entities: entities.slice(0, 2),
          relationships: [
            {
              id: 'relation-1',
              kind: 'calls',
              fromEntityId: 'module-1',
              toEntityId: 'function-1',
              evidence: 'heuristic',
              confidence: 0.8,
            },
          ],
        },
        authority,
      ),
    ).toThrow(/call/i);
  });

  it('rejects non-parser/regex evidence, missing endpoints, invalid spans, and traversal', () => {
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser: { ...parser, parserBacked: false as never },
            },
          ],
          entities: [],
          relationships: [],
        },
        authority,
      ),
    ).toThrow(/parser/i);
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'python',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser,
            },
          ],
          entities: [],
          relationships: [],
        },
        authority,
      ),
    ).toThrow(/language/i);
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser: { ...parser, name: 'regex_extractor' },
            },
          ],
          entities: [],
          relationships: [],
        },
        authority,
      ),
    ).toThrow(/parser/i);
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser,
            },
          ],
          entities: [],
          relationships: [],
        },
        { verifyParserEvidence: () => false },
      ),
    ).toThrow(/attestation/i);
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: 'src/context.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser,
            },
          ],
          entities: [{ ...entities[0], startLine: 20, endLine: 10 }],
          relationships: [],
        },
        authority,
      ),
    ).toThrow(/span/i);
    expect(() =>
      buildCodeIntelligenceGraph(
        {
          files: [
            {
              filePath: '../secret.ts',
              language: 'typescript',
              sourceRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              parser,
            },
          ],
          entities: [],
          relationships: [],
        },
        authority,
      ),
    ).toThrow(/path/i);
  });
});
