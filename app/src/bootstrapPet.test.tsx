import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPetSurface } from './bootstrapPet';

vi.mock('./features/pets/PetOverlayWindow', () => ({
  PetOverlayWindow: () => <div data-testid="pet-overlay-root" data-pet-pixi-canvas="true" />,
}));

vi.mock('./features/pets/PetMiniPanelWindow', () => ({
  PetMiniPanelWindow: () => <div data-testid="pet-mini-panel-root" />,
}));

describe('detached Pet bootstrap', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-vibespace-view');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('data-vibespace-view');
    document.body.removeAttribute('style');
  });

  it('mounts the animated overlay without exposing a stranded image fallback', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    let exposedBootstrapFallback = false;
    const observer = new MutationObserver(() => {
      exposedBootstrapFallback ||= root.querySelector('[data-pet-bootstrap-fallback]') !== null;
    });
    observer.observe(root, { childList: true, subtree: true });

    await act(async () => {
      mountPetSurface(root, 'pet-overlay');
    });

    await waitFor(() => {
      expect(root.querySelector('[data-testid="pet-overlay-root"]')).not.toBeNull();
    });
    observer.disconnect();
    expect(exposedBootstrapFallback).toBe(false);
    expect(root.querySelector('img[alt="VibeSpace Pet"]')).toBeNull();
  });
});
