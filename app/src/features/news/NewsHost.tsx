/**
 * NewsHost — wires the News mini-panel to the UI store.
 * Renders only while open so it stays out of the idle path.
 */
import * as React from 'react';
import { useUIStore } from '@/stores/ui';
import { NewsPanel } from './NewsPanel';

export function NewsHost({
  runtimeEffectsEnabled = true,
}: {
  runtimeEffectsEnabled?: boolean;
} = {}) {
  const open = useUIStore((s) => s.newsPanelOpen);
  const setOpen = useUIStore((s) => s.setNewsPanelOpen);

  return (
    <div
      data-monochrome-surface="news-host"
      className={
        runtimeEffectsEnabled
          ? 'contents [html[data-theme=monochrome]_&_*]:shadow-none'
          : 'pointer-events-none fixed inset-0 [html[data-theme=monochrome]_&_*]:shadow-none'
      }
    >
      <NewsPanel open={open} onOpenChange={setOpen} runtimeEffectsEnabled={runtimeEffectsEnabled} />
    </div>
  );
}
