function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export const MONOCHROME_VISUAL_FIXTURES = deepFreeze({
  chat: {
    id: 'chat',
    clock: '2026-07-16T12:00:00.000Z',
    activeConversationId: 'fixture-chat-001',
    messages: [
      { id: 'fixture-message-001', role: 'user', text: 'Summarize the deterministic workspace.' },
      {
        id: 'fixture-message-002',
        role: 'assistant',
        text: 'The workspace fixture is local, synthetic, and ready for review.',
      },
    ],
  },
  'settings-appearance': {
    id: 'settings-appearance',
    clock: '2026-07-16T12:00:00.000Z',
    selectedTheme: 'monochrome',
    density: 'compact',
    reducedMotion: true,
  },
  'terminal-workbench': {
    id: 'terminal-workbench',
    clock: '2026-07-16T12:00:00.000Z',
    workspaceName: 'Synthetic audit workspace',
    terminalLines: ['$ npm run verify:fixture', 'fixture status: deterministic'],
    panels: ['terminal', 'files', 'jarvis'],
  },
} as const);
