/**
 * NewsHost — wires the News mini-panel to the UI store.
 * Renders only while open so it stays out of the idle path.
 */
import * as React from 'react';
import { useUIStore } from '@/stores/ui';
import { NewsPanel } from './NewsPanel';

export function NewsHost() {
  const open = useUIStore((s) => s.newsPanelOpen);
  const setOpen = useUIStore((s) => s.setNewsPanelOpen);

  return <NewsPanel open={open} onOpenChange={setOpen} />;
}
