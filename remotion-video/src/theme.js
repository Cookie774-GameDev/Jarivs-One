export const COLORS = {
  bg: '#0c0a08',
  bg2: '#14110d',
  panel: '#1a1612',
  panel2: '#221d17',
  border: '#2e2820',
  fg: '#f5efe6',
  muted: '#a89e90',
  faint: '#6b6357',
  copper: '#d68a4e',
  copperDeep: '#b5613a',
  sage: '#8fb87e',
  cyan: '#34d6e6',
  plum: '#a472f0',
  amber: '#e8a96b',
  red: '#ff5e67',
};

export const FONT = {
  display: 'Georgia, Iowan Old Style, Times New Roman, serif',
  body: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  mono: 'JetBrains Mono, Cascadia Code, ui-monospace, SFMono-Regular, monospace',
};

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
