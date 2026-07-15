import { useEffect, useRef, useState } from 'react';
import { Check, Sparkles, TriangleAlert } from 'lucide-react';

type MemoryStatusState = 'updating' | 'updated' | 'error';

interface MemoryStatusDetail {
  chatId?: string;
  state: MemoryStatusState;
}

export function JarvisMemoryStatus({ chatId }: { chatId: string }) {
  const [state, setState] = useState<MemoryStatusState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<MemoryStatusDetail>).detail;
      if (!detail || (detail.chatId && detail.chatId !== String(chatId))) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setState(detail.state);
      if (detail.state !== 'updating') {
        hideTimer.current = setTimeout(() => setState(null), 1_600);
      }
    };
    window.addEventListener('jarvis:memory-status', onStatus);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      window.removeEventListener('jarvis:memory-status', onStatus);
    };
  }, [chatId]);

  if (!state) return null;
  const label = state === 'updating'
    ? 'Updating Jarvis memory…'
    : state === 'updated'
      ? 'Memory updated'
      : 'Memory update unavailable';
  const Icon = state === 'updating' ? Sparkles : state === 'updated' ? Check : TriangleAlert;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-1 flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-elevated/85 px-2.5 py-1 text-xs text-muted-foreground shadow-sm transition-opacity motion-reduce:transition-none"
    >
      <Icon
        aria-hidden="true"
        className={state === 'updating' ? 'h-3 w-3 animate-pulse text-accent-cyan motion-reduce:animate-none' : 'h-3 w-3'}
      />
      {label}
    </div>
  );
}
