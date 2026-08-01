import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from './avatar';

describe('Avatar presentation contract', () => {
  afterEach(cleanup);

  it('keeps the deterministic default gradient behind a theme-overridable background token', () => {
    render(<Avatar seed="Ada" initials="A" aria-label="Ada" />);

    const avatar = screen.getByLabelText('Ada');
    expect(avatar.getAttribute('data-vibespace-avatar')).toBe('true');
    expect(avatar.getAttribute('style')).toContain('--vibespace-avatar-gradient: linear-gradient(');
    expect(avatar.getAttribute('style')).toContain(
      'background: var(--vibespace-avatar-background, var(--vibespace-avatar-gradient))',
    );
  });

  it('does not synthesize a background when an image is present', () => {
    render(<Avatar seed="Ada" src="/ada.png" aria-label="Ada" />);

    const avatar = screen.getByLabelText('Ada');
    expect(avatar.getAttribute('style')).not.toContain('--vibespace-avatar-gradient');
    expect(avatar.getAttribute('style')).not.toContain('background:');
  });
});
