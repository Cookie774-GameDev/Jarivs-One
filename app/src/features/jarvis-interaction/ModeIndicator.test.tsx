import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModeIndicator } from './ModeIndicator';

describe('ModeIndicator', () => {
  it('shows Agent Mode and opens a selectable Agent/Plan/Ask panel', () => {
    const onSelectMode = vi.fn();
    render(<ModeIndicator mode="agent" onSelectMode={onSelectMode} />);

    expect(screen.getByRole('button', { name: /Agent Mode/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Agent Mode/i }));

    expect(screen.getByRole('listbox', { name: /Chat modes/i })).toBeTruthy();
    expect(screen.getByText('Plan Mode')).toBeTruthy();
    expect(screen.getByText('Ask Mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: /Plan Mode/i }));
    expect(onSelectMode).toHaveBeenCalledWith('plan');
    expect(screen.getByRole('listbox', { name: /Access and Approve All/i })).toBeTruthy();
    expect(screen.getByText('Read Only')).toBeTruthy();
    expect(screen.getByText('Full Access')).toBeTruthy();
    expect(screen.queryByRole('listbox', { name: /Chat modes/i })).toBeNull();
  });

  it('highlights Ask Mode when that mode is active', () => {
    render(<ModeIndicator mode="ask" onSelectMode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask Mode/i }));
    const askOption = screen.getByRole('option', { name: /Ask Mode/i });
    expect(askOption.getAttribute('aria-selected')).toBe('true');
  });

  it('focuses the selected mode and roves without changing selection until Enter', async () => {
    const onSelectMode = vi.fn();
    render(<ModeIndicator mode="ask" onSelectMode={onSelectMode} />);
    fireEvent.click(screen.getByRole('button', { name: /Ask Mode/i }));

    const agent = screen.getByRole('option', { name: /Agent Mode/i });
    const plan = screen.getByRole('option', { name: /Plan Mode/i });
    const ask = screen.getByRole('option', { name: /Ask Mode/i });
    await waitFor(() => expect(document.activeElement).toBe(ask));

    fireEvent.keyDown(ask, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(agent);
    expect(ask.getAttribute('aria-selected')).toBe('true');
    expect(agent.getAttribute('aria-selected')).toBe('false');

    fireEvent.keyDown(agent, { key: 'End' });
    expect(document.activeElement).toBe(ask);
    fireEvent.keyDown(ask, { key: 'Home' });
    expect(document.activeElement).toBe(agent);
    fireEvent.keyDown(agent, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(ask);
    fireEvent.keyDown(ask, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(plan);

    fireEvent.keyDown(plan, { key: 'Enter' });
    expect(onSelectMode).toHaveBeenCalledWith('plan');
  });

  it('activates with Space and returns focus to the trigger on Escape', async () => {
    const onSelectMode = vi.fn();
    render(<ModeIndicator mode="agent" onSelectMode={onSelectMode} />);
    const trigger = screen.getByRole('button', { name: /Agent Mode/i });
    fireEvent.click(trigger);
    const agent = screen.getByRole('option', { name: /Agent Mode/i });
    await waitFor(() => expect(document.activeElement).toBe(agent));

    fireEvent.keyDown(agent, { key: 'ArrowDown' });
    const plan = screen.getByRole('option', { name: /Plan Mode/i });
    expect(document.activeElement).toBe(plan);
    fireEvent.keyDown(plan, { key: ' ' });
    expect(onSelectMode).toHaveBeenCalledWith('plan');

    const accessList = screen.getByRole('listbox', { name: /Access and Approve All/i });
    fireEvent.keyDown(accessList, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('removes closed content and restores focus when the exit animation never finishes', async () => {
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const styles = nativeGetComputedStyle(element);
      if (!(element instanceof HTMLElement) || element.getAttribute('role') !== 'dialog') {
        return styles;
      }
      return new Proxy(styles, {
        get(target, property, receiver) {
          if (property === 'animationName') {
            if (
              element.dataset.state === 'closed' &&
              element.classList.contains('data-[state=closed]:!animate-none')
            ) {
              return 'none';
            }
            return element.dataset.state === 'closed' ? 'mode-fade-out' : 'mode-scale-in';
          }
          if (property === 'display') return 'block';
          return Reflect.get(target, property, receiver);
        },
      });
    });

    try {
      render(<ModeIndicator mode="agent" onSelectMode={vi.fn()} />);
      const trigger = screen.getByRole('button', { name: /Agent Mode/i });
      fireEvent.click(trigger);
      const agent = screen.getByRole('option', { name: /Agent Mode/i });
      await waitFor(() => expect(document.activeElement).toBe(agent));

      fireEvent.keyDown(agent, { key: 'Escape' });

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 500 });
      expect(document.activeElement).toBe(trigger);
    } finally {
      computedStyle.mockRestore();
    }
  });
});
