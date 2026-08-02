import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { Account } from './Account';

// The sign-in dialog and Pet panel are owned by other features and must not
// perform auth, network, or pet side effects inside this visual contract test
// (MC-034). Account's own gated surface renders independently of both.
vi.mock('@/features/auth/SignInDialog', () => ({ SignInDialog: () => null }));
vi.mock('@/features/pets/PetAccountPanel', () => ({ PetAccountPanel: () => null }));

describe('Account MonoChrome appearance', () => {
  beforeEach(() => {
    useAuthStore.setState({
      displayName: 'Ada Lovelace',
      localUserId: 'local-user-fixture',
      cloudSession: null,
    });
  });

  afterEach(cleanup);

  it('gates radius, background-image, and shadow under exact monochrome only', () => {
    render(<Account />);

    const root = document.querySelector<HTMLElement>('.mc7f-settings-account');
    expect(root).not.toBeNull();
    const className = root?.className ?? '';

    expect(className).toContain('[html[data-theme=monochrome]_&_*]:rounded-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:bg-none');
    expect(className).toContain('[html[data-theme=monochrome]_&_*]:shadow-none');

    // Ordinary-theme layout and the exact-theme accent rail stay intact.
    expect(className).toContain('flex flex-col gap-6');
    expect(className).toContain('[html[data-theme=monochrome]_&]:border-l-foreground/20');
    expect(className).not.toMatch(/gradient|blur/);

    // Meaningful product surface and copy are preserved.
    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText('Display name')).toBeTruthy();
    expect(screen.getByText('Local user ID')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Profile/ })).toBeTruthy();
  });
});
