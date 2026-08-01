import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extensionForLanguage,
  fsOptionsForWorkbenchPath,
  isWorkbenchDesktopSavePath,
  listCatalog,
  saveWorkbenchDocument,
} from './workbenchLocalFiles';

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

describe('workbench local files', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:workbench-download'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(() => undefined),
    });
  });

  afterEach(() => {
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('maps language to extension', () => {
    expect(extensionForLanguage('html')).toBe('html');
    expect(extensionForLanguage('markdown')).toBe('md');
    expect(extensionForLanguage('ts')).toBe('ts');
  });

  it('treats Desktop VibeSpace paths as unscoped (no project root)', () => {
    expect(
      isWorkbenchDesktopSavePath('C:\\Users\\viper\\Desktop\\VibeSpace\\editor\\page.html'),
    ).toBe(true);
    expect(
      isWorkbenchDesktopSavePath('C:\\Users\\viper\\Desktop\\VibeSpace\\notes\\ideas.txt'),
    ).toBe(true);
    expect(isWorkbenchDesktopSavePath('C:\\projects\\app\\index.html')).toBe(false);
    expect(
      fsOptionsForWorkbenchPath('C:\\Users\\x\\Desktop\\VibeSpace\\editor\\a.html', 'C:\\proj'),
    ).toEqual({});
    expect(fsOptionsForWorkbenchPath('C:\\proj\\src\\a.html', 'C:\\proj')).toEqual({
      root: 'C:\\proj',
    });
  });

  it('saves via download fallback outside Tauri and catalogs the entry', async () => {
    const click = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: click });
      }
      return el;
    });

    const result = await saveWorkbenchDocument({
      kind: 'notes',
      displayName: 'My note',
      content: 'hello world',
      extension: 'txt',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.fileName).toBe('My note.txt');
      expect(result.entry.kind).toBe('notes');
    }
    expect(listCatalog('notes').length).toBe(1);
    expect(click).toHaveBeenCalled();
  });
});
