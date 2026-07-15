/**
 * Contract test: Workbench nav click must always setRoute('workbench') so the
 * surface is visible even when native window create fails.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Workbench open contract', () => {
  it('NavPane always setRoutes to workbench on click (guaranteed visible path)', () => {
    const src = readFileSync(join(__dirname, '../../components/layout/NavPane.tsx'), 'utf8');
    // The Workbench NavItem handler must setRoute before/around detached open.
    expect(src).toMatch(/label="Workbench"/);
    expect(src).toMatch(/setRoute\('workbench'\)/);
    expect(src).toMatch(/openOrFocusWorkbenchWindow/);
  });

  it('Tauri window path uses relative app path and does not fake success on timeout', () => {
    const src = readFileSync(join(__dirname, 'window.ts'), 'utf8');
    expect(src).toMatch(/WORKBENCH_APP_PATH\s*=\s*'\/\?workbench=1'/);
    expect(src).toMatch(/workbench-main/);
    // Timeout must finish with ok: false (not true).
    expect(src).toMatch(/ok:\s*false/);
    expect(src).toMatch(/timed out/i);
    // Must not have the old "timeout => ok: true" pattern.
    expect(src).not.toMatch(/setTimeout\(\s*\(\)\s*=>\s*finish\(\{\s*ok:\s*true/);
  });
});
