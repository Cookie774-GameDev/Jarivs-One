import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKBENCH_NAME,
  resolveWorkbenchName,
  sanitizeWorkbenchName,
  workbenchWindowTitle,
} from './workbenchName';

describe('Workbench name helpers', () => {
  it('rejects empty/invalid names and resolves defaults', () => {
    expect(sanitizeWorkbenchName('')).toBeNull();
    expect(sanitizeWorkbenchName('   ')).toBeNull();
    expect(sanitizeWorkbenchName('\u0000bad')).toBe('bad');
    expect(resolveWorkbenchName('')).toBe(DEFAULT_WORKBENCH_NAME);
    expect(sanitizeWorkbenchName('  Launch desk  ')).toBe('Launch desk');
  });

  it('builds native window titles from the safe name', () => {
    expect(workbenchWindowTitle('Night coding')).toBe('VibeSpace Workbench — Night coding');
    expect(workbenchWindowTitle('')).toContain(DEFAULT_WORKBENCH_NAME);
  });
});
