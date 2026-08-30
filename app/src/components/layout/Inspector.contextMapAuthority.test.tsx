import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Inspector Context map file authority', () => {
  it('uses virtual-aware backing authority for preview, context menu, and fallback attachment', () => {
    const source = readFileSync(resolve('src/components/layout/Inspector.tsx'), 'utf8');
    const contextStart = source.indexOf('function InspectorContextPanel(');
    const contextEnd = source.indexOf('function ContextResourceRow(', contextStart);
    const contextInspector = source.slice(contextStart, contextEnd);
    const attachmentStart = source.indexOf('function treeMapAttachment(');
    const attachmentEnd = source.indexOf('function toolAttachment(', attachmentStart);
    const attachment = source.slice(attachmentStart, attachmentEnd);

    expect(contextInspector).toContain('contextTreeBackingFilePath(tree)');
    expect(contextInspector).toContain('contextMapBackingFilePath(selectedMap)');
    expect(contextInspector).toContain(
      'contextState?.maps.find((map) => map.id === contextState.selectedMapId)',
    );
    expect(contextInspector).not.toContain('contextMapFilePath(tree.rootDir)');
    expect(contextInspector).toContain('filePath={mapPath}');
    expect(contextInspector).toContain('onPreview={inspectorOpen && mapPath');
    expect(attachment).toContain("id: '__jarvis-context-root__'");
    expect(attachment).toContain('nodeToAttachment(tree, root)');
    expect(attachment).not.toContain('path: contextMapFilePath(tree.rootDir)');
  });
});
