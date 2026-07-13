import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeToDocument, resolveTheme, useUIStore } from './ui';

describe('UI theme resolution', () => {
  afterEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.removeAttribute('data-theme-preference');
    useUIStore.setState({ theme: 'dark' });
  });

  it('resolves system preference to the actual light or dark theme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('keeps Jarvis Core as an independent selectable theme', () => {
    expect(resolveTheme('jarvis')).toBe('jarvis');
    applyThemeToDocument('jarvis');
    expect(document.documentElement.getAttribute('data-theme')).toBe('jarvis');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('jarvis');
  });

  it('applies theme changes synchronously through the UI store', () => {
    useUIStore.getState().setTheme('jarvis');
    expect(useUIStore.getState().theme).toBe('jarvis');
    expect(document.documentElement.getAttribute('data-theme')).toBe('jarvis');
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
