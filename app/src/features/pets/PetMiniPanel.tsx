/**
 * Lightweight Pet mini-panel opened by click (including wake-from-sleep).
 * Does not create chats/terminals; presentation only.
 */
import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PetMiniPanelProps {
  open: boolean;
  onClose: () => void;
  animLabel?: string;
  className?: string;
}

export function PetMiniPanel({ open, onClose, animLabel, className }: PetMiniPanelProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed z-[71] w-[280px] rounded-xl border border-border bg-panel/95 backdrop-blur-md shadow-xl',
        'p-3 flex flex-col gap-2',
        className,
      )}
      style={{ right: 24, bottom: 24 }}
      role="dialog"
      aria-modal="true"
      aria-label="Pet mini panel"
      data-pet-mini-panel="true"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-ui-strong text-foreground">VibeSpace Pet</div>
          <div className="text-metadata text-muted-foreground">
            {animLabel ? `Now: ${animLabel}` : 'Axolotl companion'}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close pet panel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-secondary text-muted-foreground">
        Drag to walk · leave idle to sleep · click anytime to open this panel (wakes if sleeping).
      </p>
    </div>
  );
}
