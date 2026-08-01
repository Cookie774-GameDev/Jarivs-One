import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductTutorialHost } from '@/features/product-tutorial/ProductTutorialHost';
import { Onboarding } from './Onboarding';

describe('Sakura onboarding and tutorial surfaces', () => {
  it('marks the onboarding dialog as app-owned without changing its accessible flow', () => {
    render(<Onboarding />);

    const dialog = screen.getByRole('dialog', { name: 'Onboarding' });
    expect(dialog.getAttribute('data-vibespace-owned-chrome')).toBe('onboarding');
    expect(screen.getByRole('tab', { name: 'Step 1' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /Get started/i })).toBeTruthy();
  });

  it('marks the contained tutorial offer while preserving its choices', () => {
    render(<ProductTutorialHost runtimeEffectsEnabled={false} />);

    const dialog = screen.getByRole('dialog', { name: /Quick tour/i });
    expect(dialog.closest('[data-vibespace-owned-chrome="product-tutorial"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Do the tutorial/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /No thanks/i })).toBeTruthy();
  });
});
