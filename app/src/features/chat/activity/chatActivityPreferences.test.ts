import { beforeEach, describe, expect, it } from 'vitest';
import { CHAT_ACTIVITY_PANEL_KEY, createChatActivityPreferences } from './chatActivityPreferences';

describe('chat activity preferences', () => {
  beforeEach(() => localStorage.clear());

  it('shows the Jarvis session panel by default and persists an explicit hide choice', () => {
    const preferences = createChatActivityPreferences(localStorage);
    expect(preferences.getSnapshot().showSessionPanel).toBe(true);
    preferences.setShowSessionPanel(false);
    expect(preferences.getSnapshot().showSessionPanel).toBe(false);
    expect(localStorage.getItem(CHAT_ACTIVITY_PANEL_KEY)).toBe('0');
  });
});
