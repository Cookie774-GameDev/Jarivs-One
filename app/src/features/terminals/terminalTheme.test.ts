import { describe, expect, it } from 'vitest';
import type { ITheme } from 'xterm';

import {
  applyTerminalTheme,
  resolveTerminalDocumentTheme,
  resolveTerminalTheme,
} from './terminalTheme';

const explicitTheme = Object.freeze<ITheme>({
  background: '#102030',
  foreground: '#f0e0d0',
  cursor: '#abcdef',
});

describe('resolveTerminalTheme', () => {
  it('keeps a valid explicit per-terminal palette ahead of every document theme', () => {
    for (const documentTheme of ['monochrome', 'jarvis', 'dark', 'vibespace'] as const) {
      expect(resolveTerminalTheme({ documentTheme, explicitUserTheme: explicitTheme })).toBe(
        explicitTheme,
      );
    }
  });

  it('maps MonoChrome to its synchronized semantic and ANSI palette', () => {
    expect(resolveTerminalTheme({ documentTheme: 'monochrome', explicitUserTheme: null })).toEqual({
      foreground: '#e8ebee',
      background: '#0b0d10',
      cursor: '#33c2b5',
      cursorAccent: '#0b0d10',
      selectionBackground: '#8159d9',
      selectionForeground: '#f4f6f8',
      black: '#0b0d10',
      red: '#cf5050',
      green: '#3db873',
      yellow: '#f0ae3c',
      blue: '#4f97dd',
      magenta: '#9569dc',
      cyan: '#33c2b5',
      white: '#d5d9dd',
      brightBlack: '#626a73',
      brightRed: '#e36b6b',
      brightGreen: '#5dce8d',
      brightYellow: '#ffc45c',
      brightBlue: '#70afe9',
      brightMagenta: '#ad86e8',
      brightCyan: '#5ad7cc',
      brightWhite: '#f4f6f8',
    });
  });

  it('preserves the established Jarvis and dark/VibeSpace palettes', () => {
    const jarvis = resolveTerminalTheme({ documentTheme: 'jarvis', explicitUserTheme: null });
    expect(jarvis).toMatchObject({
      background: '#080a0f',
      foreground: '#eee4d7',
      cursor: '#ff8500',
      cyan: '#45d4d4',
    });

    const dark = resolveTerminalTheme({ documentTheme: 'dark', explicitUserTheme: null });
    expect(dark).toMatchObject({
      background: '#2a2018',
      foreground: '#f5e6c8',
      cursor: '#d97757',
      green: '#7c9870',
    });
    expect(resolveTerminalTheme({ documentTheme: 'vibespace', explicitUserTheme: null })).toBe(
      dark,
    );
  });

  it('uses a safe dark fallback for an impossible document value and never activates Light', () => {
    expect(resolveTerminalDocumentTheme('light')).toBe('dark');
    expect(resolveTerminalDocumentTheme('unknown')).toBe('dark');
    expect(resolveTerminalDocumentTheme(null)).toBe('dark');
    expect(resolveTerminalDocumentTheme('monochrome')).toBe('monochrome');

    const fallback = resolveTerminalTheme({
      documentTheme: 'unexpected' as never,
      explicitUserTheme: null,
    });
    expect(fallback.background).toBe('#2a2018');
  });

  it('returns immutable app-owned palettes', () => {
    for (const documentTheme of ['monochrome', 'jarvis', 'dark', 'vibespace'] as const) {
      expect(
        Object.isFrozen(resolveTerminalTheme({ documentTheme, explicitUserTheme: null })),
      ).toBe(true);
    }
  });
});

describe('applyTerminalTheme', () => {
  it('re-resolves document changes without overwriting an explicit override', () => {
    const target: { options: { theme?: ITheme } } = { options: {} };
    applyTerminalTheme(target, {
      documentTheme: 'dark',
      explicitUserTheme: explicitTheme,
    });
    applyTerminalTheme(target, {
      documentTheme: 'monochrome',
      explicitUserTheme: explicitTheme,
    });
    expect(target.options.theme).toBe(explicitTheme);
  });

  it('follows document changes when the integrated terminal has no explicit override', () => {
    const target: { options: { theme?: ITheme } } = { options: {} };
    applyTerminalTheme(target, {
      documentTheme: 'dark',
      explicitUserTheme: null,
    });
    expect(target.options.theme?.background).toBe('#2a2018');
    applyTerminalTheme(target, {
      documentTheme: 'monochrome',
      explicitUserTheme: null,
    });
    expect(target.options.theme?.background).toBe('#0b0d10');
  });
});
