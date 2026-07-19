import { describe, expect, it } from 'vitest';
import { getBuiltinAction, getBuiltinActions } from '@/lib/actions/registry';
import { CORE_ACTION_IDS } from '@/lib/actions/registryJarvisCore';

describe('plugin invocation authorization boundary', () => {
  it('has no generic plugin action in either model-facing registry', () => {
    expect(getBuiltinAction('plugin.call')).toBeUndefined();
    expect(getBuiltinActions().map((action) => action.id)).not.toContain('plugin.call');
    expect(CORE_ACTION_IDS).not.toContain('plugin.invoke');
  });
});
