export const CODE_INTELLIGENCE_LANGUAGES = Object.freeze([
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
] as const);

export type CodeIntelligenceLanguage = (typeof CODE_INTELLIGENCE_LANGUAGES)[number];

export interface CodeIntelligenceParserDefinition {
  language: CodeIntelligenceLanguage;
  extensions: readonly string[];
  primaryParser: string;
  fallbackParser: string | null;
  parserBacked: true;
  regexOnlySymbolExtraction: false;
}

function definition(
  language: CodeIntelligenceLanguage,
  extensions: readonly string[],
  primaryParser: string,
  fallbackParser: string | null = null,
): Readonly<CodeIntelligenceParserDefinition> {
  return Object.freeze({
    language,
    extensions: Object.freeze([...extensions]),
    primaryParser,
    fallbackParser,
    parserBacked: true,
    regexOnlySymbolExtraction: false,
  });
}

export const CODE_INTELLIGENCE_PARSER_REGISTRY = Object.freeze({
  typescript: definition(
    'typescript',
    ['.ts', '.mts', '.cts'],
    'typescript_compiler',
    'tree_sitter_typescript',
  ),
  javascript: definition(
    'javascript',
    ['.js', '.mjs', '.cjs'],
    'typescript_compiler',
    'tree_sitter_javascript',
  ),
  tsx: definition('tsx', ['.tsx'], 'typescript_compiler', 'tree_sitter_typescript'),
  jsx: definition('jsx', ['.jsx'], 'typescript_compiler', 'tree_sitter_javascript'),
  rust: definition('rust', ['.rs'], 'tree_sitter_rust'),
  python: definition('python', ['.py', '.pyi'], 'tree_sitter_python'),
  json: definition('json', ['.json', '.jsonc'], 'json_parser', 'tree_sitter_json'),
  yaml: definition('yaml', ['.yaml', '.yml'], 'yaml_parser', 'tree_sitter_yaml'),
  toml: definition('toml', ['.toml'], 'toml_parser', 'tree_sitter_toml'),
  markdown: definition('markdown', ['.md', '.mdx'], 'markdown_ast', 'tree_sitter_markdown'),
  html: definition('html', ['.html', '.htm'], 'html_parser', 'tree_sitter_html'),
  css: definition('css', ['.css', '.scss', '.sass', '.less'], 'postcss_parser', 'tree_sitter_css'),
  sql: definition('sql', ['.sql'], 'tree_sitter_sql'),
  go: definition('go', ['.go'], 'tree_sitter_go'),
  java: definition('java', ['.java'], 'tree_sitter_java'),
  csharp: definition('csharp', ['.cs'], 'tree_sitter_c_sharp'),
  cpp: definition(
    'cpp',
    ['.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx'],
    'tree_sitter_cpp',
    'tree_sitter_c',
  ),
  shell: definition('shell', ['.sh', '.bash', '.zsh', '.fish'], 'tree_sitter_bash'),
  powershell: definition(
    'powershell',
    ['.ps1', '.psm1', '.psd1'],
    'tree_sitter_powershell',
    'powershell_ast',
  ),
} satisfies Record<CodeIntelligenceLanguage, Readonly<CodeIntelligenceParserDefinition>>);

const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

function safePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    value.trim() !== value ||
    FORBIDDEN.test(value)
  ) {
    throw new Error('Invalid code-intelligence file path.');
  }
  const normalized = value.replaceAll('\\', '/');
  const firstSegment = normalized.split('/', 1)[0];
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.endsWith('/') ||
    normalized.includes('//') ||
    firstSegment.includes(':') ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('Invalid code-intelligence file path.');
  }
  return normalized;
}

export function resolveCodeIntelligenceLanguage(
  rawFilePath: string,
): CodeIntelligenceLanguage | null {
  const filePath = safePath(rawFilePath).toLowerCase();
  for (const language of CODE_INTELLIGENCE_LANGUAGES) {
    const parser = CODE_INTELLIGENCE_PARSER_REGISTRY[language];
    if (parser.extensions.some((extension) => filePath.endsWith(extension))) {
      return language;
    }
  }
  return null;
}

export function buildCodeIntelligenceParserPlan(rawFilePath: string) {
  const filePath = safePath(rawFilePath);
  const language = resolveCodeIntelligenceLanguage(filePath);
  if (language === null) {
    throw new Error('Unsupported code-intelligence language.');
  }
  const parser = CODE_INTELLIGENCE_PARSER_REGISTRY[language];
  return Object.freeze({
    filePath,
    language,
    primaryParser: parser.primaryParser,
    fallbackParser: parser.fallbackParser,
    parserBacked: true as const,
    regexOnlySymbolExtraction: false as const,
    executable: false as const,
  });
}
