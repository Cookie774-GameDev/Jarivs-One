import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ContextPage.tsx'), 'utf8');

describe('ContextPage SiYuan count semantics', () => {
  it('renders the durable aggregate as indexed items and the stored tree fallback as files', () => {
    const mapRowStart = source.indexOf('const mapRow = (map: ContextMapRecord) => {');
    const mapRowEnd = source.indexOf('function FirstContextMapTutorial()', mapRowStart);
    const mapRow = source.slice(mapRowStart, mapRowEnd);

    expect(mapRowStart).toBeGreaterThan(-1);
    expect(mapRowEnd).toBeGreaterThan(mapRowStart);
    expect(source).toContain(
      "import { formatSiyuanIndexCountSummary } from './siyuan/siyuanIndexCountSemantics';",
    );
    expect(mapRow).toContain('const visibleCountSummary = formatSiyuanIndexCountSummary({');
    expect(mapRow).toContain("kind: job ? 'indexed-items' : 'files',");
    expect(mapRow).toContain('count: job?.indexed ?? map.tree.fileCount,');
    expect(mapRow).toContain('{visibleCountSummary} - {mapFilePath}');
    expect(mapRow).not.toContain('visibleFileCount');
    expect(mapRow).not.toMatch(/job\?\.indexed[^;]*\}\s*files/u);
  });
});
