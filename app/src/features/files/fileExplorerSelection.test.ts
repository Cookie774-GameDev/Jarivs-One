import { describe, expect, it } from 'vitest';
import { nextExplorerSelection, seedSelectionFromHits } from './fileExplorerSelection';

describe('nextExplorerSelection', () => {
  it('selects files in folder mode so search previews work', () => {
    expect(
      nextExplorerSelection(
        'folder',
        { path: 'C:\\Users\\viper\\Documents\\keys.txt', isDir: false },
        [],
        false,
      ),
    ).toEqual(['C:\\Users\\viper\\Documents\\keys.txt']);
  });

  it('selects directories only in folder mode', () => {
    expect(
      nextExplorerSelection('folder', { path: 'C:\\Users\\viper\\Documents', isDir: true }, [], false),
    ).toEqual(['C:\\Users\\viper\\Documents']);
    expect(
      nextExplorerSelection('file', { path: 'C:\\Users\\viper\\Documents', isDir: true }, [], false),
    ).toBeNull();
    expect(
      nextExplorerSelection('files', { path: 'C:\\Users\\viper\\Documents', isDir: true }, [], false),
    ).toBeNull();
  });

  it('supports single-file and multi-file pick modes', () => {
    expect(
      nextExplorerSelection('file', { path: 'C:\\a\\a.txt', isDir: false }, ['C:\\a\\b.txt'], false),
    ).toEqual(['C:\\a\\a.txt']);

    expect(
      nextExplorerSelection('files', { path: 'C:\\a\\a.txt', isDir: false }, ['C:\\a\\b.txt'], true),
    ).toEqual(['C:\\a\\b.txt', 'C:\\a\\a.txt']);

    expect(
      nextExplorerSelection('files', { path: 'C:\\a\\a.txt', isDir: false }, ['C:\\a\\a.txt'], true),
    ).toEqual([]);
  });
});

describe('seedSelectionFromHits', () => {
  it('seeds the first hit when nothing is selected', () => {
    expect(seedSelectionFromHits([], ['C:\\a.txt', 'C:\\b.txt'])).toEqual(['C:\\a.txt']);
  });

  it('keeps the current selection when it is still among hits', () => {
    expect(seedSelectionFromHits(['C:\\b.txt'], ['C:\\a.txt', 'C:\\b.txt'])).toEqual(['C:\\b.txt']);
  });

  it('re-seeds when previous selection is no longer in hits', () => {
    expect(seedSelectionFromHits(['C:\\gone.txt'], ['C:\\a.txt', 'C:\\b.txt'])).toEqual(['C:\\a.txt']);
  });
});
