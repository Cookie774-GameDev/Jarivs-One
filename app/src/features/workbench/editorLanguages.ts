/** File / language types the Workbench editor can label and preview. */
export const EDITOR_LANGUAGES = [
  { id: 'html', label: 'HTML', preview: 'device' as const },
  { id: 'htm', label: 'HTM', preview: 'device' as const },
  { id: 'css', label: 'CSS', preview: 'device' as const },
  { id: 'svg', label: 'SVG', preview: 'device' as const },
  { id: 'md', label: 'Markdown', preview: 'device' as const },
  { id: 'mdx', label: 'MDX', preview: 'device' as const },
  { id: 'js', label: 'JavaScript', preview: 'source' as const },
  { id: 'jsx', label: 'JSX', preview: 'source' as const },
  { id: 'ts', label: 'TypeScript', preview: 'source' as const },
  { id: 'tsx', label: 'TSX', preview: 'source' as const },
  { id: 'json', label: 'JSON', preview: 'source' as const },
  { id: 'py', label: 'Python', preview: 'source' as const },
  { id: 'rs', label: 'Rust', preview: 'source' as const },
  { id: 'go', label: 'Go', preview: 'source' as const },
  { id: 'txt', label: 'Plain text', preview: 'source' as const },
  { id: 'text', label: 'Text', preview: 'source' as const },
] as const;

export type EditorLanguageId = (typeof EDITOR_LANGUAGES)[number]['id'];

export function languageMeta(id: string) {
  const key = id.replace(/^\./, '').toLowerCase();
  return EDITOR_LANGUAGES.find((l) => l.id === key) ?? {
    id: key || 'text',
    label: key || 'Text',
    preview: 'source' as const,
  };
}
