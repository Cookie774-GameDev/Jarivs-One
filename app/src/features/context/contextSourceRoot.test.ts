import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTEXT_SOURCE_ROOT_PREFIX,
  getStoredContextSourceRoot,
  setStoredContextSourceRoot,
} from './contextSourceRoot';

describe('Context Map source-root storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores an arbitrary source independently from the Files project root', () => {
    window.localStorage.setItem('jarvis-files-root-v2:project-9', 'C:\\Projects\\Project 9');

    setStoredContextSourceRoot('account-a', 'project-9', 'D:\\Knowledge\\Anywhere');

    expect(getStoredContextSourceRoot('account-a', 'project-9')).toBe('D:\\Knowledge\\Anywhere');
    expect(window.localStorage.getItem('jarvis-files-root-v2:project-9')).toBe(
      'C:\\Projects\\Project 9',
    );
  });

  it('supports a source when no VibeSpace project is bound', () => {
    setStoredContextSourceRoot('account-a', null, 'D:\\Loose corpus');

    expect(getStoredContextSourceRoot('account-a', null)).toBe('D:\\Loose corpus');
    expect(window.localStorage.getItem(`${CONTEXT_SOURCE_ROOT_PREFIX}:account-a:__unbound__`)).toBe(
      'D:\\Loose corpus',
    );
  });

  it('does not expose an unbound source to another signed-in account', () => {
    setStoredContextSourceRoot('account-a', null, 'D:\\Account A');

    expect(getStoredContextSourceRoot('account-b', null)).toBe('');
  });
});
