import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { applyThemeToDocument, resolveTheme, useUIStore } from './ui';
import type { SelectableTheme } from '@/features/appearance/themeContract';

describe('UI theme resolution', () => {
  afterEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.removeAttribute('data-theme-preference');
    useUIStore.setState({ theme: 'default' });
  });

  it('keeps legacy Jarvis rendering available for migration compatibility', () => {
    expect(resolveTheme('jarvis')).toBe('jarvis');
    applyThemeToDocument('jarvis');
    expect(document.documentElement.getAttribute('data-theme')).toBe('jarvis');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('jarvis');
  });

  it('resolves the public Default theme to the established dark skin', () => {
    expect(resolveTheme('default')).toBe('dark');
    applyThemeToDocument('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('default');
  });

  it('keeps VibeSpace as an independent selectable theme', () => {
    expect(resolveTheme('vibespace')).toBe('vibespace');
    applyThemeToDocument('vibespace');
    expect(document.documentElement.getAttribute('data-theme')).toBe('vibespace');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('vibespace');
  });

  it('resolves MonoChrome to its own document theme and preference', () => {
    expect(resolveTheme('monochrome')).toBe('monochrome');
    applyThemeToDocument('monochrome');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monochrome');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('monochrome');
  });

  it('applies theme changes synchronously through the UI store', () => {
    type StoreState = ReturnType<typeof useUIStore.getState>;
    type SetThemeArgument = Parameters<StoreState['setTheme']>[0];
    expectTypeOf<SetThemeArgument>().toEqualTypeOf<SelectableTheme>();

    useUIStore.getState().setTheme('monochrome');
    expect(useUIStore.getState().theme).toBe('monochrome');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monochrome');
  });
});

describe('product tutorial persistence via finishOnboarding', () => {
  afterEach(() => {
    useUIStore.setState({
      onboardingComplete: false,
      productTutorialStatus: null,
    });
  });

  it('marks product tutorial pending when setup onboarding finishes', () => {
    useUIStore.setState({ onboardingComplete: false, productTutorialStatus: null });
    useUIStore.getState().finishOnboarding();
    expect(useUIStore.getState().onboardingComplete).toBe(true);
    expect(useUIStore.getState().productTutorialStatus).toBe('pending');
  });

  it('does not re-force tutorial if already skipped or completed', () => {
    useUIStore.setState({ productTutorialStatus: 'skipped' });
    useUIStore.getState().finishOnboarding();
    expect(useUIStore.getState().productTutorialStatus).toBe('skipped');

    useUIStore.setState({ productTutorialStatus: 'completed' });
    useUIStore.getState().finishOnboarding();
    expect(useUIStore.getState().productTutorialStatus).toBe('completed');
  });
});
