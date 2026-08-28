// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserPanel } from './BrowserPanel';
import type { WorkbenchPanel } from './types';

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn(async () => undefined) }));

vi.mock('@/lib/tauri', () => ({ openExternal }));

function panel(url: string): WorkbenchPanel {
  return {
    id: 'browser-1',
    kind: 'browser',
    title: 'Browser',
    x: 0,
    y: 0,
    width: 680,
    height: 440,
    z: 1,
    minimized: false,
    status: 'ready',
    settings: { url },
  };
}

describe('Workbench BrowserPanel delivery', () => {
  it('keeps the address readable in the warm theme', () => {
    render(<BrowserPanel panel={panel('http://localhost:5173/')} onUpdate={vi.fn()} />);
    const address = screen.getByLabelText('Browser address');
    expect(address.className).toContain('[html[data-theme=warm]_&]:bg-background');
    expect(address.className).toContain('[html[data-theme=warm]_&]:text-foreground');
    expect(address.className).toContain('[html[data-theme=warm]_&]:caret-foreground');
  });

  it('keeps localhost interactive inside Workbench', () => {
    render(<BrowserPanel panel={panel('http://localhost:5173/')} onUpdate={vi.fn()} />);
    expect(screen.getByTitle('Browser web page').getAttribute('src')).toBe(
      'http://localhost:5173/',
    );
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('hands ordinary remote navigation to the normal system browser instead of a refused iframe', async () => {
    const onUpdate = vi.fn();
    render(<BrowserPanel panel={panel('https://example.com/')} onUpdate={onUpdate} />);

    expect(screen.queryByTitle('Browser web page')).toBeNull();
    expect(screen.getByText(/normal signed-in browser profile/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Browser address'), {
      target: { value: 'https://github.com/' },
    });
    fireEvent.submit(screen.getByLabelText('Browser address').closest('form')!);

    await waitFor(() => expect(openExternal).toHaveBeenCalledWith('https://github.com/'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ url: 'https://github.com/' }),
      }),
    );
  });
});
