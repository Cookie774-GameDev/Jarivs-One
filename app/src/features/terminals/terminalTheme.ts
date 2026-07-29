import type { ResolvedDocumentTheme } from '@/features/appearance/themeContract';
import type { ITheme } from 'xterm';

const DARK_TERMINAL_THEME = Object.freeze<ITheme>({
  foreground: '#f5e6c8',
  background: '#2a2018',
  cursor: '#d97757',
  cursorAccent: '#2a2018',
  selectionBackground: '#d97757',
  selectionForeground: '#2a2018',
  black: '#2a2018',
  red: '#d97757',
  green: '#7c9870',
  yellow: '#d4a258',
  blue: '#9d8aa8',
  magenta: '#c97b6e',
  cyan: '#7c9870',
  white: '#f5e6c8',
  brightBlack: '#5d4c3c',
  brightRed: '#d97757',
  brightGreen: '#7c9870',
  brightYellow: '#d4a258',
  brightBlue: '#9d8aa8',
  brightMagenta: '#c97b6e',
  brightCyan: '#7c9870',
  brightWhite: '#fffbf5',
});

const JARVIS_TERMINAL_THEME = Object.freeze<ITheme>({
  foreground: '#eee4d7',
  background: '#080a0f',
  cursor: '#ff8500',
  cursorAccent: '#080a0f',
  selectionBackground: '#7a410f',
  selectionForeground: '#fff5e8',
  black: '#080a0f',
  red: '#ff5d47',
  green: '#47d45b',
  yellow: '#ffb000',
  blue: '#4ca8ff',
  magenta: '#b37aff',
  cyan: '#45d4d4',
  white: '#eee4d7',
  brightBlack: '#5f626b',
  brightRed: '#ff7b68',
  brightGreen: '#6ce17c',
  brightYellow: '#ffc247',
  brightBlue: '#7bc0ff',
  brightMagenta: '#cb9cff',
  brightCyan: '#7be3e3',
  brightWhite: '#fff8ef',
});

const MONOCHROME_TERMINAL_THEME = Object.freeze<ITheme>({
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

export function resolveTerminalDocumentTheme(value: string | null): ResolvedDocumentTheme {
  switch (value) {
    case 'jarvis':
    case 'vibespace':
    case 'dark':
    case 'monochrome':
      return value;
    default:
      return 'dark';
  }
}

export function resolveTerminalTheme(input: {
  documentTheme: ResolvedDocumentTheme;
  explicitUserTheme: Readonly<ITheme> | null;
}): Readonly<ITheme> {
  if (input.explicitUserTheme) return input.explicitUserTheme;

  switch (input.documentTheme) {
    case 'monochrome':
      return MONOCHROME_TERMINAL_THEME;
    case 'jarvis':
      return JARVIS_TERMINAL_THEME;
    case 'dark':
    case 'vibespace':
    default:
      return DARK_TERMINAL_THEME;
  }
}

interface TerminalThemeTarget {
  options: {
    theme?: ITheme;
  };
}

export function applyTerminalTheme(
  target: TerminalThemeTarget,
  input: {
    documentTheme: ResolvedDocumentTheme;
    explicitUserTheme: Readonly<ITheme> | null;
  },
): Readonly<ITheme> {
  const theme = resolveTerminalTheme(input);
  target.options.theme = theme;
  return theme;
}
