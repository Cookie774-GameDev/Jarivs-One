import { beforeEach, describe, expect, it } from 'vitest';
import {
  LAST_KNOWN_GOOD_KEY,
  WORKBENCH_STORAGE_KEY,
  loadWorkbenchDocument,
  saveWorkbenchDocument,
} from './persistence';
import { createDefaultWorkbenchDocument } from './store';

describe('Workbench persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('writes a versioned document and keeps an atomic last-known-good copy', () => {
    const document = createDefaultWorkbenchDocument();
    document.panels[0]!.title = 'Terminal — no transcript is stored';

    expect(saveWorkbenchDocument(document, window.localStorage)).toBe(true);
    expect(window.localStorage.getItem(WORKBENCH_STORAGE_KEY)).toContain('"version":1');
    expect(window.localStorage.getItem(LAST_KNOWN_GOOD_KEY)).toBe(
      window.localStorage.getItem(WORKBENCH_STORAGE_KEY),
    );
  });

  it('recovers from a corrupt primary document without persisting terminal output', () => {
    const document = createDefaultWorkbenchDocument();
    saveWorkbenchDocument(document, window.localStorage);
    window.localStorage.setItem(WORKBENCH_STORAGE_KEY, '{broken');

    const recovered = loadWorkbenchDocument(window.localStorage);
    expect(recovered.source).toBe('last-known-good');
    expect(recovered.document.panels.length).toBeGreaterThan(0);
    expect(JSON.stringify(recovered.document)).not.toContain('transcript');
  });

  it('redacts secret-like terminal startup values before writing layout state', () => {
    const document = createDefaultWorkbenchDocument();
    document.panels[0]!.settings.command = 'deploy --api-key=sk-super-secret-value';

    saveWorkbenchDocument(document, window.localStorage);
    const serialized = window.localStorage.getItem(WORKBENCH_STORAGE_KEY) ?? '';
    expect(serialized).not.toContain('sk-super-secret-value');
    expect(serialized).toContain('[redacted]');
  });

  it('drops unsafe persisted wallpaper assets', () => {
    const document = createDefaultWorkbenchDocument();
    document.wallpaper = {
      ...document.wallpaper,
      id: 'custom-image',
      assetUrl: 'javascript:alert(document.cookie)',
    };

    saveWorkbenchDocument(document, window.localStorage);
    const loaded = loadWorkbenchDocument(window.localStorage);
    expect(loaded.document.wallpaper.assetUrl).toBeUndefined();
    expect(window.localStorage.getItem(WORKBENCH_STORAGE_KEY)).not.toContain('javascript:');
  });
});
