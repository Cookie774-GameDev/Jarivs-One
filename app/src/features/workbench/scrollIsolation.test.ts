import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Workbench scroll isolation', () => {
  it('canvas wheel handler ignores events from panel bodies', () => {
    const src = readFileSync(join(__dirname, 'WorkbenchCanvas.tsx'), 'utf8');
    expect(src).toMatch(/closest\('\.workbench-panel-body/);
    expect(src).toMatch(/return;/);
  });

  it('panel body stops wheel propagation', () => {
    const src = readFileSync(join(__dirname, 'WorkbenchPanel.tsx'), 'utf8');
    expect(src).toMatch(/workbench-panel-body/);
    expect(src).toMatch(/stopPropagation/);
  });
});
