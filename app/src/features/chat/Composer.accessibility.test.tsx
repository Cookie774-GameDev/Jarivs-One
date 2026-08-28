import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FreeKeyNudge, slashComboboxOwnerAttributes } from './Composer';

describe('Composer slash command combobox accessibility', () => {
  it('links the focused textarea to the active slash option only while the picker is open', () => {
    const metadata = {
      listboxId: 'jarvis-slash-r1',
      activeDescendantId: 'jarvis-slash-r1-option-mcp',
    };

    expect(slashComboboxOwnerAttributes(true, metadata)).toEqual({
      role: 'combobox',
      'aria-controls': metadata.listboxId,
      'aria-expanded': true,
      'aria-activedescendant': metadata.activeDescendantId,
      'aria-autocomplete': 'list',
    });
    expect(slashComboboxOwnerAttributes(false, metadata)).toEqual({});
  });
});

describe('FreeKeyNudge accessibility', () => {
  afterEach(cleanup);

  it('provides Sakura-sized link and button targets while preserving their actions', () => {
    const onOpenProviders = vi.fn();
    render(<FreeKeyNudge onOpenProviders={onOpenProviders} />);

    const getKey = screen.getByRole('link', { name: 'Get key →' });
    const providers = screen.getByRole('button', { name: 'Open Providers' });

    expect(getKey.className).toContain('[html[data-theme=sakura]_&]:min-h-6');
    expect(providers.className).toContain('[html[data-theme=sakura]_&]:min-h-6');

    fireEvent.click(providers);
    expect(onOpenProviders).toHaveBeenCalledTimes(1);
  });
});
