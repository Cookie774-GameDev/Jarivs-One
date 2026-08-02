import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuickLink } from '@/types/quick-link';
import { LauncherDialog } from './LauncherDialog';

const link = {
  id: 'quick-link-1' as QuickLink['id'],
  workspace_id: 'workspace-1' as QuickLink['workspace_id'],
  label: 'Example',
  url: 'https://example.com',
  kind: 'web',
  behavior: 'external_browser',
  position: 1,
  color_hue: 210,
  tags: [],
  created_at: 1,
  updated_at: 1,
} satisfies QuickLink;

vi.mock('./hooks', () => ({
  filterByGroup: (links: QuickLink[]) => links,
  useQuickLinkGroups: () => [],
  useQuickLinks: () => [link],
}));

describe('LauncherDialog MonoChrome appearance', () => {
  it('keeps ordinary effects while flattening the MonoChrome overlay and link tile', () => {
    render(<LauncherDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Quick Launch' })).toBeTruthy();
    const overlay = document.querySelector<HTMLElement>(
      '[data-monochrome-overlay="launcher-dialog"]',
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('backdrop-blur-sm');
    expect(overlay?.className).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
    expect(overlay?.className).toContain(
      '[html[data-theme=monochrome]_&]:data-[state=open]:!animate-none',
    );

    const tile = screen.getByRole('button', { name: 'Launch Example' }).parentElement;
    expect(tile?.style.background).toContain('linear-gradient');
    expect(tile?.className).toContain('[html[data-theme=monochrome]_&]:![background-image:none]');
  });
});
