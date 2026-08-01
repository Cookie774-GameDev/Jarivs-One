import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

afterEach(cleanup);

describe('DialogContent overlay customization', () => {
  it('forwards opt-in overlay props without replacing shared defaults or close semantics', () => {
    render(
      <Dialog open>
        <DialogContent
          overlayProps={{
            'data-testid': 'custom-overlay',
            className: 'custom-overlay-class',
          }}
        >
          <DialogTitle>Custom dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const overlay = screen.getByTestId('custom-overlay');
    expect(overlay.className).toContain('fixed inset-0');
    expect(overlay.className).toContain('backdrop-blur-sm');
    expect(overlay.className).toContain('custom-overlay-class');
    expect(screen.getByRole('dialog', { name: 'Custom dialog' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('leaves the default overlay untouched when no customization is requested', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Default dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByTestId('custom-overlay')).toBeNull();
    const overlay = document.querySelector<HTMLElement>('.fixed.inset-0');
    expect(overlay?.className).toContain('bg-black/70');
    expect(overlay?.className).toContain('backdrop-blur-sm');
  });
});
