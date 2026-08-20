import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTokenBoss } from './events';
import { TokenBossCinematic } from './TokenBossCinematic';

describe('TokenBossCinematic', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 20 })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      shadowColor: '',
      shadowBlur: 0,
      imageSmoothingEnabled: true,
    } as never);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays only requests for its active chat and remains a singleton', () => {
    render(<TokenBossCinematic chatId="chat-a" />);

    act(() => requestTokenBoss({ chatId: 'chat-b', providerId: 'gemini' }));
    expect(screen.queryByRole('dialog', { name: /Token Boss/i })).toBeNull();

    act(() => requestTokenBoss({ chatId: 'chat-a', providerId: 'codex' }));
    expect(screen.getAllByRole('dialog', { name: /Token Boss/i })).toHaveLength(1);
    expect(screen.getAllByText(/Codex token/i).length).toBeGreaterThan(0);

    act(() => requestTokenBoss({ chatId: 'chat-a', providerId: 'gemini' }));
    expect(screen.getAllByRole('dialog', { name: /Token Boss/i })).toHaveLength(1);
    expect(screen.getAllByText(/Codex token/i).length).toBeGreaterThan(0);
  });

  it('keeps page stacking from flattening or covering the cinematic overlay', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const origamiChat = readFileSync(
      resolve(__dirname, '../../../styles/origami-chat.css'),
      'utf8',
    );
    const origamiTheme = readFileSync(
      resolve(__dirname, '../../../styles/origami-theme.css'),
      'utf8',
    );
    const chatWelcome = readFileSync(resolve(__dirname, '../chat-welcome.css'), 'utf8');
    const warmTheme = readFileSync(resolve(__dirname, '../../../styles/warm-theme.css'), 'utf8');
    const tokenBossCss = readFileSync(resolve(__dirname, './token-boss.css'), 'utf8');
    expect(origamiChat).toContain(':not(.origami-chat-decor):not(.token-boss-cinematic)');
    expect(origamiTheme).toContain(':not(.origami-chat-decor):not(.token-boss-cinematic)');
    expect(chatWelcome).toContain(':not(.warm-chat-welcome):not(.token-boss-cinematic)');
    expect(warmTheme).toContain(':not(.warm-chat-welcome):not(.token-boss-cinematic)');
    expect(tokenBossCss).toContain('z-index: 90 !important');
  });

  it('uses an ordinary alpha canvas without a second desynchronized WebView surface', () => {
    render(<TokenBossCinematic chatId="chat-a" />);

    act(() => requestTokenBoss({ chatId: 'chat-a', providerId: 'codex' }));

    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d', { alpha: true });
  });

  it('marks compact pet layout so the cinematic fills the chat host', () => {
    render(<TokenBossCinematic chatId="chat-a" compact />);
    act(() => requestTokenBoss({ chatId: 'chat-a', providerId: 'ollama' }));
    const dialog = screen.getByRole('dialog', { name: /Token Boss/i });
    expect(dialog.getAttribute('data-token-boss-compact')).toBe('true');
    expect(dialog.className).toContain('token-boss-cinematic--compact');
    expect(dialog.style.position).toBe('absolute');
    expect(dialog.style.zIndex).toBe('90');
    expect(dialog.style.width).toBe('100%');
    expect(dialog.style.height).toBe('100%');
  });

  it('skips on Escape, cancels animation, and restores composer focus', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    render(<TokenBossCinematic chatId="chat-a" />);

    act(() => requestTokenBoss({ chatId: 'chat-a', providerId: 'claude', restoreFocus: textarea }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /Token Boss/i })).toBeNull();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(document.activeElement).toBe(textarea);
    textarea.remove();
  });
});
