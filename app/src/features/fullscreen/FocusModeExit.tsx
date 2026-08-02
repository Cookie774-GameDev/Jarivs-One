import { Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFullscreenStore } from './fullscreenStore';

export function FocusModeExit() {
  const active = useFullscreenStore((state) => state.focusActive);
  const setFocusActive = useFullscreenStore((state) => state.setFocusActive);

  if (!active) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label="Exit Focus Mode"
      data-focus-mode-exit="true"
      onClick={() => setFocusActive(false)}
      className="fixed right-3 top-3 z-[70] gap-1.5 border border-border/80 bg-panel/95 shadow-lg backdrop-blur-sm"
    >
      <Minimize2 aria-hidden="true" className="h-3.5 w-3.5" />
      <span>Exit Focus Mode</span>
    </Button>
  );
}
