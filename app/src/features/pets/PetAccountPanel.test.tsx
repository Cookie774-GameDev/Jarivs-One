import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetAccountPanel } from './PetAccountPanel';
import { usePetSettingsStore } from './petSettingsStore';

describe('PetAccountPanel character picker', () => {
  beforeEach(() => {
    localStorage.clear();
    usePetSettingsStore.setState({
      enabled: true,
      reducedMotion: false,
      sleepTimeoutMs: 5 * 60 * 1000,
      idleFunIntervalMs: 60_000,
      showDiagnostics: false,
      overlayVisible: true,
      characterId: 'axo',
    });
  });

  it('shows AXO and GLITCH choices and persists the selected skin', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<PetAccountPanel />);

    expect(screen.getByRole('button', { name: /select axo/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /select glitch/i }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /select glitch/i }));

    expect(usePetSettingsStore.getState().characterId).toBe('glitch');
    expect(screen.getByRole('button', { name: /select glitch/i }).getAttribute('aria-pressed')).toBe('true');
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'jarvis:pet:character-changed',
        detail: { characterId: 'glitch' },
      }),
    );
  });
});
