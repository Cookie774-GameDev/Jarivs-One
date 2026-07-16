import { describe, expect, it } from 'vitest';
import { classifyRisk, validateBrowserTool } from './browserActions';

describe('browser agent tools', () => {
  it('rejects arbitrary javascript tools', () => {
    expect(validateBrowserTool({ tool: 'browser.runJs' })?.ok).toBe(false);
    expect(validateBrowserTool({ tool: 'browser.evaluate' })?.ok).toBe(false);
  });

  it('allows known tools', () => {
    expect(validateBrowserTool({ tool: 'browser.navigate' })).toBeNull();
    expect(validateBrowserTool({ tool: 'browser.readPage' })).toBeNull();
  });

  it('classifies risk for sensitive tools', () => {
    expect(classifyRisk('browser.click')).toBe('sensitive');
    expect(classifyRisk('browser.readPage')).toBe('safe');
    expect(classifyRisk('browser.type', 'enter password')).toBe('destructive');
  });
});
