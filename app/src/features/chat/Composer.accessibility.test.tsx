import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FreeKeyNudge } from './Composer';

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
