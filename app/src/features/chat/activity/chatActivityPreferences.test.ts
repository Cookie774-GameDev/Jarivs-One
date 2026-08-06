import { beforeEach, describe, expect, it } from 'vitest';
import { CHAT_ACTIVITY_PANEL_KEY, createChatActivityPreferences } from './chatActivityPreferences';

describe('chat activity preferences', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the classic Jarvis session panel hidden by default and persists an explicit opt-in', () => {
    const preferences = createChatActivityPreferences(localStorage);
    expect(preferences.getSnapshot().showSessionPanel).toBe(false);
    preferences.setShowSessionPanel(true);
    expect(preferences.getSnapshot().showSessionPanel).toBe(true);
    expect(localStorage.getItem(CHAT_ACTIVITY_PANEL_KEY)).toBe('1');
  });
});
