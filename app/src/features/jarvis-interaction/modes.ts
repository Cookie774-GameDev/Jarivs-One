import type { JarvisInteractionMode } from './types';

const MODE_ORDER: JarvisInteractionMode[] = ['agent', 'plan', 'ask'];

export function cycleInteractionMode(mode: JarvisInteractionMode): JarvisInteractionMode {
  const index = MODE_ORDER.indexOf(mode);
  return MODE_ORDER[(index + 1) % MODE_ORDER.length] ?? 'agent';
}

export function interactionModeLabel(mode: JarvisInteractionMode): string {
  if (mode === 'ask') return 'Ask Mode';
  if (mode === 'plan') return 'Plan Mode';
  return 'Agent Mode';
}

export function interactionModeDescription(mode: JarvisInteractionMode): string {
  if (mode === 'ask') return 'Answers only. No edits, commands, or action proposals.';
  if (mode === 'plan') return 'Read-only planning. Build the plan before execution.';
  return 'Full work mode with approval for risky actions.';
}

export function modeFromSlashCommand(command: string): JarvisInteractionMode | null {
  const normalized = command.trim().toLowerCase().replace(/^\//, '');
  if (normalized === 'ask') return 'ask';
  if (normalized === 'plan') return 'plan';
  if (normalized === 'multitask') return 'agent';
  return null;
}

export function normalizeInteractionMode(value: unknown): JarvisInteractionMode {
  return value === 'ask' || value === 'plan' || value === 'agent' ? value : 'agent';
}
