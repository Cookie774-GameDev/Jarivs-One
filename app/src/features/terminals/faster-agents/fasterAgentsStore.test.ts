import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FASTER_AGENTS_PHRASES,
  OPENWHIP_WEIGHTED_PHRASES,
  FASTER_AGENTS_MAX_TARGETS,
  normalizeFasterAgentsPhrases,
  pickFasterAgentsPhrase,
  useFasterAgentsStore,
} from './fasterAgentsStore';

describe('Faster Agents store', () => {
  beforeEach(() => {
    useFasterAgentsStore.setState({ open: false, phase: 'select', selectedRefs: [] });
  });

  it('selects at most ten exact terminal refs and toggles without duplicates', () => {
    const store = useFasterAgentsStore.getState();
    for (let index = 0; index < FASTER_AGENTS_MAX_TARGETS; index += 1) {
      expect(store.toggleRef({ paneId: `pane-${index}` })).toBe(true);
    }
    expect(useFasterAgentsStore.getState().selectedRefs).toHaveLength(10);
    expect(store.toggleRef({ paneId: 'pane-overflow' })).toBe(false);
    expect(store.toggleRef({ paneId: 'pane-3' })).toBe(true);
    expect(useFasterAgentsStore.getState().selectedRefs.map((ref) => ref.paneId)).not.toContain(
      'pane-3',
    );
  });

  it('requires a selection before entering whip mode', () => {
    expect(useFasterAgentsStore.getState().continueToWhip()).toBe(false);
    useFasterAgentsStore.getState().toggleRef({ paneId: 'pane-1' });
    expect(useFasterAgentsStore.getState().continueToWhip()).toBe(true);
    expect(useFasterAgentsStore.getState().phase).toBe('whip');
  });

  it('keeps one to five nonblank bounded phrases and picks deterministically', () => {
    expect(DEFAULT_FASTER_AGENTS_PHRASES).toEqual([
      'FASTER',
      'GO FASTER',
      'Faster CLANKER',
      'Work FASTER',
      'Speed it up clanker',
    ]);
    expect(OPENWHIP_WEIGHTED_PHRASES).toEqual([
      'FASTER',
      'FASTER',
      'FASTER',
      'GO FASTER',
      'Faster CLANKER',
      'Work FASTER',
      'Speed it up clanker',
    ]);
    expect(pickFasterAgentsPhrase(DEFAULT_FASTER_AGENTS_PHRASES, () => 2 / 7)).toBe('FASTER');
    expect(pickFasterAgentsPhrase(DEFAULT_FASTER_AGENTS_PHRASES, () => 3 / 7)).toBe('GO FASTER');
    expect(normalizeFasterAgentsPhrases([])).toHaveLength(1);
    const phrases = normalizeFasterAgentsPhrases([
      'one',
      '',
      'two',
      'three',
      'four',
      'five',
      'six',
    ]);
    expect(phrases).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(pickFasterAgentsPhrase(phrases, () => 0)).toBe('one');
    expect(pickFasterAgentsPhrase(phrases, () => 0.999)).toBe('five');
  });
});
