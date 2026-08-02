import { describe, expect, it } from 'vitest';
import {
  CODE_INTELLIGENCE_LANGUAGES,
  CODE_INTELLIGENCE_PARSER_REGISTRY,
  buildCodeIntelligenceParserPlan,
  resolveCodeIntelligenceLanguage,
} from './codeIntelligenceLanguages';

describe('code-intelligence language parser registry', () => {
  it('covers all nineteen prioritized language families', () => {
    expect(CODE_INTELLIGENCE_LANGUAGES).toEqual([
      'typescript',
      'javascript',
      'tsx',
      'jsx',
      'rust',
      'python',
      'json',
      'yaml',
      'toml',
      'markdown',
      'html',
      'css',
      'sql',
      'go',
      'java',
      'csharp',
      'cpp',
      'shell',
      'powershell',
    ]);
    expect(Object.keys(CODE_INTELLIGENCE_PARSER_REGISTRY)).toHaveLength(19);
  });

  it('uses real parser-backed strategies and never regex-only symbol extraction', () => {
    for (const language of CODE_INTELLIGENCE_LANGUAGES) {
      expect(CODE_INTELLIGENCE_PARSER_REGISTRY[language]).toMatchObject({
        language,
        parserBacked: true,
        regexOnlySymbolExtraction: false,
      });
      expect(CODE_INTELLIGENCE_PARSER_REGISTRY[language].primaryParser).not.toMatch(/regex/i);
    }
  });

  it.each([
    ['src/main.ts', 'typescript'],
    ['src/App.tsx', 'tsx'],
    ['src/main.js', 'javascript'],
    ['src/View.jsx', 'jsx'],
    ['src/main.rs', 'rust'],
    ['tools/index.py', 'python'],
    ['package.json', 'json'],
    ['pnpm-workspace.yaml', 'yaml'],
    ['Cargo.toml', 'toml'],
    ['README.md', 'markdown'],
    ['index.html', 'html'],
    ['styles.css', 'css'],
    ['migration.sql', 'sql'],
    ['cmd/main.go', 'go'],
    ['Main.java', 'java'],
    ['Program.cs', 'csharp'],
    ['native/main.cpp', 'cpp'],
    ['scripts/setup.sh', 'shell'],
    ['scripts/setup.ps1', 'powershell'],
  ] as const)('resolves %s to %s', (filePath, language) => {
    expect(resolveCodeIntelligenceLanguage(filePath)).toBe(language);
  });

  it('builds immutable non-executable parser plans with explicit fallbacks', () => {
    expect(buildCodeIntelligenceParserPlan('src/App.tsx')).toEqual({
      filePath: 'src/App.tsx',
      language: 'tsx',
      primaryParser: 'typescript_compiler',
      fallbackParser: 'tree_sitter_typescript',
      parserBacked: true,
      regexOnlySymbolExtraction: false,
      executable: false,
    });
    expect(Object.isFrozen(buildCodeIntelligenceParserPlan('src/App.tsx'))).toBe(true);
  });

  it('fails closed for unknown, traversal, accessor, and oversized paths', () => {
    expect(() => buildCodeIntelligenceParserPlan('src/data.unknown')).toThrow(/language/i);
    expect(() => buildCodeIntelligenceParserPlan('../secret.ts')).toThrow(/path/i);
    expect(() => buildCodeIntelligenceParserPlan('C:\\secret.ts')).toThrow(/path/i);
    expect(() => buildCodeIntelligenceParserPlan('C:/secret.ts')).toThrow(/path/i);
    expect(() => buildCodeIntelligenceParserPlan('C:secret.ts')).toThrow(/path/i);
    expect(() => buildCodeIntelligenceParserPlan('x'.repeat(10_000))).toThrow(/path/i);

    let calls = 0;
    const accessor = {
      toString() {
        calls += 1;
        return 'src/main.ts';
      },
    };
    expect(() => resolveCodeIntelligenceLanguage(accessor as never)).toThrow(/path/i);
    expect(calls).toBe(0);
  });
});
