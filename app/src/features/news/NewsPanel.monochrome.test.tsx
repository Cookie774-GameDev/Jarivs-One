import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NewsPanel } from './NewsPanel';

/**
 * MonoChrome visual-effect + contrast closure for the News panel
 * (overlay:news-host / data-monochrome-surface="news-host").
 *
 * MC-017/MC-020/MC-027: under html[data-theme=monochrome] the panel must drop
 * gradients and blur and keep faded text readable, while every other theme keeps
 * its existing presentation. A fixed clock (2026-07-11 -> three catalog cards,
 * one of them YouTube) plus runtimeEffectsEnabled=false makes the image-fallback
 * gradient, kind badge, click scrim, and play overlay render deterministically.
 *
 * Class assertions read getAttribute('class') so they work for both HTML elements
 * and lucide SVG icons (whose el.className is an SVGAnimatedString).
 */
const FIXED_NOW = new Date(Date.UTC(2026, 6, 11, 12, 0, 0));

function cls(el: Element): string {
  return el.getAttribute('class') ?? '';
}

function renderPanel() {
  return render(
    <NewsPanel open onOpenChange={() => {}} now={FIXED_NOW} runtimeEffectsEnabled={false} />,
  );
}

describe('NewsPanel MonoChrome closure', () => {
  afterEach(() => cleanup());

  it('keeps the gradient fallback for other themes but flattens it under monochrome', () => {
    const { container } = renderPanel();
    const fallbacks = Array.from(container.querySelectorAll('.bg-gradient-to-br'));
    expect(fallbacks.length).toBeGreaterThan(0);
    for (const el of fallbacks) {
      expect(cls(el)).toContain('bg-gradient-to-br');
      expect(cls(el)).toContain('[html[data-theme=monochrome]_&]:bg-none');
    }
  });

  it('removes backdrop blur from every news surface element under monochrome', () => {
    const { container } = renderPanel();
    const blurred = Array.from(container.querySelectorAll('[class*="backdrop-blur"]'));
    expect(blurred.length).toBeGreaterThan(0);
    for (const el of blurred) {
      expect(cls(el)).toContain('[html[data-theme=monochrome]_&]:backdrop-blur-none');
    }
  });

  it('solidifies faded muted text under monochrome without changing other themes', () => {
    const { container } = renderPanel();
    const faded = Array.from(container.querySelectorAll('[class*="text-muted-foreground/"]'));
    expect(faded.length).toBeGreaterThan(0);
    for (const el of faded) {
      expect(cls(el)).toContain('[html[data-theme=monochrome]_&]:text-muted-foreground');
    }
  });

  it('solidifies faded accent text under monochrome', () => {
    const { container } = renderPanel();
    const faded = Array.from(container.querySelectorAll('[class*="text-accent-copper/"]'));
    expect(faded.length).toBeGreaterThan(0);
    for (const el of faded) {
      expect(cls(el)).toContain('[html[data-theme=monochrome]_&]:text-accent-copper');
    }
  });
});
