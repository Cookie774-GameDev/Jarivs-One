import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  type CanvasDocument,
} from './contracts';
import { CanvasOutline } from './CanvasOutline';

/** Builds a deterministic test document with the given block specs. */
function buildDocument(
  specs: Array<{
    id: string;
    kind: 'heading' | 'text' | 'note' | 'code';
    text: string;
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    language?: string;
  }>,
): CanvasDocument {
  let doc = createCanvasDocument({
    id: 'test-doc',
    projectId: 'test-project',
    ownerId: 'test-owner',
    title: 'Test canvas',
    now: 1,
  });
  let clock = 1;
  for (const spec of specs) {
    clock += 1;
    const content =
      spec.kind === 'heading'
        ? { kind: 'heading' as const, level: spec.level ?? 1, text: spec.text }
        : spec.kind === 'code'
          ? { kind: 'code' as const, language: spec.language ?? 'plaintext', text: spec.text }
          : { kind: spec.kind, text: spec.text };
    doc = withBlockAdded(doc, createCanvasBlock({ id: spec.id, content, now: clock }), clock);
  }
  return doc;
}

describe('CanvasOutline', () => {
  it('renders a tree with an accessible label', () => {
    const doc = buildDocument([{ id: 'b1', kind: 'text', text: 'Hello' }]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const tree = screen.getByRole('tree', { name: 'Canvas object outline' });
    expect(tree).toBeTruthy();
  });

  it('renders treeitems in deterministic page order with meaningful labels', () => {
    const doc = buildDocument([
      { id: 'b1', kind: 'heading', text: 'Title', level: 2 },
      { id: 'b2', kind: 'note', text: 'A note' },
      { id: 'b3', kind: 'code', text: 'const x = 1', language: 'typescript' },
    ]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const items = screen.getAllByRole('treeitem');
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute('aria-label')).toBe('Heading 2: Title');
    expect(items[1].getAttribute('aria-label')).toBe('Note: A note');
    expect(items[2].getAttribute('aria-label')).toBe('Code (typescript): const x = 1');
  });

  it('marks selected blocks with aria-selected and others as false', () => {
    const doc = buildDocument([
      { id: 'b1', kind: 'text', text: 'First' },
      { id: 'b2', kind: 'text', text: 'Second' },
    ]);
    render(<CanvasOutline document={doc} selectedIds={['b2']} />);

    const items = screen.getAllByRole('treeitem');
    expect(items[0].getAttribute('aria-selected')).toBe('false');
    expect(items[1].getAttribute('aria-selected')).toBe('true');
  });

  it('shows a meaningful empty state when the document has no blocks', () => {
    const doc = buildDocument([]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    expect(screen.getByText('No canvas objects yet')).toBeTruthy();
    expect(screen.queryByRole('treeitem')).toBeNull();
  });

  it('moves focus with ArrowDown and ArrowUp without trapping focus', () => {
    const doc = buildDocument([
      { id: 'b1', kind: 'text', text: 'First' },
      { id: 'b2', kind: 'text', text: 'Second' },
      { id: 'b3', kind: 'text', text: 'Third' },
    ]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const items = screen.getAllByRole('treeitem');
    // First item is tabbable by default
    expect(items[0].getAttribute('tabindex')).toBe('0');
    expect(items[1].getAttribute('tabindex')).toBe('-1');

    items[0].focus();
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(items[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[2]);

    // ArrowDown on last item does not wrap or trap
    fireEvent.keyDown(items[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[2]);

    fireEvent.keyDown(items[2], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[1]);

    // ArrowUp on first item does not wrap or trap
    items[0].focus();
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('activates a block via Enter and Space and calls onActivate', () => {
    const onActivate = vi.fn();
    const doc = buildDocument([{ id: 'b1', kind: 'note', text: 'Clickable' }]);
    render(<CanvasOutline document={doc} selectedIds={[]} onActivate={onActivate} />);

    const item = screen.getByRole('treeitem');
    fireEvent.keyDown(item, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('b1');

    fireEvent.keyDown(item, { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenCalledWith('b1');
  });

  it('activates a block via click and calls onActivate', () => {
    const onActivate = vi.fn();
    const doc = buildDocument([{ id: 'b1', kind: 'text', text: 'Click me' }]);
    render(<CanvasOutline document={doc} selectedIds={[]} onActivate={onActivate} />);

    fireEvent.click(screen.getByRole('treeitem'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('b1');
  });

  it('gives the selected item roving tabindex priority', () => {
    const doc = buildDocument([
      { id: 'b1', kind: 'text', text: 'First' },
      { id: 'b2', kind: 'text', text: 'Second' },
      { id: 'b3', kind: 'text', text: 'Third' },
    ]);
    render(<CanvasOutline document={doc} selectedIds={['b3']} />);

    const items = screen.getAllByRole('treeitem');
    expect(items[0].getAttribute('tabindex')).toBe('-1');
    expect(items[1].getAttribute('tabindex')).toBe('-1');
    expect(items[2].getAttribute('tabindex')).toBe('0');
  });

  it('truncates long text in labels for readability', () => {
    const longText = 'A'.repeat(120);
    const doc = buildDocument([{ id: 'b1', kind: 'text', text: longText }]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const item = screen.getByRole('treeitem');
    const label = item.getAttribute('aria-label') ?? '';
    expect(label.startsWith('Text: ')).toBe(true);
    expect(label.length).toBeLessThan(120);
    expect(label.endsWith('…')).toBe(true);
  });

  it('sets aria-level on heading blocks matching their heading level', () => {
    const doc = buildDocument([
      { id: 'b1', kind: 'heading', text: 'Top', level: 1 },
      { id: 'b2', kind: 'heading', text: 'Sub', level: 3 },
    ]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const items = screen.getAllByRole('treeitem');
    expect(items[0].getAttribute('aria-level')).toBe('1');
    expect(items[1].getAttribute('aria-level')).toBe('3');
  });

  it('does not render aria-level on non-heading blocks', () => {
    const doc = buildDocument([{ id: 'b1', kind: 'note', text: 'A note' }]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const item = screen.getByRole('treeitem');
    expect(item.getAttribute('aria-level')).toBeNull();
  });

  it('supports Home and End keys to jump to first and last items', () => {
    const doc = buildDocument([
      { id: 'b1', kind: 'text', text: 'First' },
      { id: 'b2', kind: 'text', text: 'Second' },
      { id: 'b3', kind: 'text', text: 'Third' },
    ]);
    render(<CanvasOutline document={doc} selectedIds={[]} />);

    const items = screen.getAllByRole('treeitem');
    items[0].focus();
    fireEvent.keyDown(items[0], { key: 'End' });
    expect(document.activeElement).toBe(items[2]);

    fireEvent.keyDown(items[2], { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });
});
