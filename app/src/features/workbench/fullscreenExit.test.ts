import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Workbench fullscreen + exit', () => {
  it('AppShell goes full-bleed for route workbench', () => {
    const src = readFileSync(
      join(__dirname, '../../components/layout/AppShell.tsx'),
      'utf8',
    );
    expect(src).toMatch(/route === 'workbench'/);
    expect(src).toMatch(/data-workbench-fullscreen/);
  });

  it('WorkbenchPage has hold-exit that flushes persistence and leaves to chat', () => {
    const page = readFileSync(join(__dirname, 'WorkbenchPage.tsx'), 'utf8');
    expect(page).toMatch(/HoldExitButton/);
    expect(page).toMatch(/flushPersistence/);
    expect(page).toMatch(/setRoute\('chat'\)/);
  });

  it('hold exit requires arm then confirm', () => {
    const hold = readFileSync(join(__dirname, 'HoldExitButton.tsx'), 'utf8');
    expect(hold).toMatch(/Confirm exit/);
    expect(hold).toMatch(/HOLD_MS/);
  });
});
