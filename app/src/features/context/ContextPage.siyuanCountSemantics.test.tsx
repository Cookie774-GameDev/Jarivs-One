import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ContextPage.tsx'), 'utf8');

describe('ContextPage SiYuan count semantics', () => {
  it('renders the exact stored file count separately from the durable indexed-item aggregate', () => {
    const mapRowStart = source.indexOf('const mapRow = (map: ContextMapRecord) => {');
    const mapRowEnd = source.indexOf('function FirstContextMapTutorial()', mapRowStart);
    const mapRow = source.slice(mapRowStart, mapRowEnd);

    expect(mapRowStart).toBeGreaterThan(-1);
    expect(mapRowEnd).toBeGreaterThan(mapRowStart);
    expect(source).toContain(
      "import { formatSiyuanIndexCountSummary } from './siyuan/siyuanIndexCountSemantics';",
    );
    expect(mapRow).toContain('const exactFileCountSummary = formatSiyuanIndexCountSummary({');
    expect(mapRow).toContain("kind: 'files',");
    expect(mapRow).toContain('count: map.tree.fileCount,');
    expect(mapRow).toContain(
      "formatSiyuanIndexCountSummary({ kind: 'indexed-items', count: job.indexed })",
    );
    expect(mapRow).toContain('{exactFileCountSummary}');
    expect(mapRow).toContain(
      "{indexedItemSummary ? ` · ${indexedItemSummary}` : ''} - {mapFilePath}",
    );
    expect(mapRow).not.toContain('visibleFileCount');
    expect(mapRow).not.toMatch(/job\?\.indexed[^;]*\}\s*files/u);
  });
});
