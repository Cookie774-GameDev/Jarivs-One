import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatGptAdePage } from './ChatGptAdePage';

describe('ChatGptAdePage', () => {
  it('publishes the truthful unavailable state without implying native acceptance', () => {
    const { container } = render(<ChatGptAdePage />);

    expect(screen.getByRole('heading', { name: 'ChatGPT ADE' })).toBeTruthy();
    expect(screen.getByText('Not implemented')).toBeTruthy();
    expect(screen.getByText(/Production model dispatcher is not bound/u)).toBeTruthy();
    expect(screen.getByText(/Official native acceptance is pending/u)).toBeTruthy();
    expect(
      container
        .querySelector('[data-ade-implementation-state]')
        ?.getAttribute('data-ade-implementation-state'),
    ).toBe('not-implemented');
    expect(container.textContent).not.toContain('Browser Chat');
  });
});
