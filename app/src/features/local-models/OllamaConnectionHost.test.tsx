import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapOllamaConnection } from '@/lib/ai/ollamaBootstrap';
import { OllamaConnectionHost } from './OllamaConnectionHost';

vi.mock('@/lib/ai/ollamaBootstrap', () => ({
  bootstrapOllamaConnection: vi.fn(),
}));

describe('OllamaConnectionHost lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(bootstrapOllamaConnection).mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('never starts Ollama from mount, focus, or background time', async () => {
    const view = render(<OllamaConnectionHost />);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(bootstrapOllamaConnection).not.toHaveBeenCalled();
    view.unmount();
  });

  it('stays inert after repeated focus and visibility lifecycle events', async () => {
    const view = render(<OllamaConnectionHost />);

    await act(async () => {
      for (let index = 0; index < 10; index += 1) {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      }
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });

    expect(bootstrapOllamaConnection).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not emit background warnings because it owns no implicit bootstrap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = render(<OllamaConnectionHost />);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(120_000);
    });

    view.unmount();

    expect(bootstrapOllamaConnection).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
