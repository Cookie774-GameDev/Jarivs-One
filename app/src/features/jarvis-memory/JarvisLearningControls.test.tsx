import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JarvisLearningControls } from './JarvisLearningControls';
import { useJarvisLearningStore } from './learningStore';

describe('JarvisLearningControls', () => {
  beforeEach(() => {
    useJarvisLearningStore.getState().clearForTests();
    useJarvisLearningStore.getState().setAccount('account-a');
  });

  it('lets the user view, edit, remove, disable, export, clear, and undo memory', () => {
    const onExport = vi.fn();
    const memoryId = useJarvisLearningStore.getState().remember({
      value: 'Use concise answers.',
      category: 'response-style',
      source: { kind: 'explicit' },
    })!;

    render(<JarvisLearningControls onExport={onExport} />);
    expect(screen.getByText('Use concise answers.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `Edit memory ${memoryId}` }));
    const input = screen.getByLabelText('Memory value');
    fireEvent.change(input, { target: { value: 'Use very concise answers.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    expect(useJarvisLearningStore.getState().currentProfile().items[0]?.value).toBe('Use very concise answers.');

    fireEvent.click(screen.getByRole('button', { name: 'Export learning.md' }));
    expect(onExport).toHaveBeenCalledWith(expect.stringContaining('Use very concise answers.'));

    fireEvent.click(screen.getByRole('switch', { name: 'Jarvis learning enabled' }));
    expect(useJarvisLearningStore.getState().currentProfile().enabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: `Remove memory ${memoryId}` }));
    expect(useJarvisLearningStore.getState().currentProfile().items).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo memory change' }));
    expect(useJarvisLearningStore.getState().currentProfile().items).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all learning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear learning' }));
    expect(useJarvisLearningStore.getState().currentProfile().items).toEqual([]);
  });
});
