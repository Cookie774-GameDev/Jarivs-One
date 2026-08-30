import type { ProjectId } from '@/types/common';

export type ExpectedTerminalProcessBinding = Readonly<{
  projectId: string | null;
  processInstanceId: string;
  pid: number;
  processStartedAt: number;
  runtimeGeneration: string;
}>;

export interface TerminalRef {
  paneId?: string;
  sessionId?: string;
  projectId?: ProjectId | string | null;
  label?: string;
  command?: string;
  agentSlug?: string | null;
  expectedProcess?: ExpectedTerminalProcessBinding;
}

function parseExpectedProcess(value: unknown): ExpectedTerminalProcessBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const binding = value as Record<string, unknown>;
  if (
    !(
      binding.projectId === null ||
      (typeof binding.projectId === 'string' && binding.projectId.trim() === binding.projectId)
    ) ||
    typeof binding.processInstanceId !== 'string' ||
    !binding.processInstanceId.trim() ||
    typeof binding.runtimeGeneration !== 'string' ||
    !binding.runtimeGeneration.trim() ||
    !Number.isSafeInteger(binding.pid) ||
    Number(binding.pid) <= 0 ||
    !Number.isSafeInteger(binding.processStartedAt) ||
    Number(binding.processStartedAt) <= 0
  ) {
    return undefined;
  }
  return {
    projectId: binding.projectId as string | null,
    processInstanceId: binding.processInstanceId,
    pid: Number(binding.pid),
    processStartedAt: Number(binding.processStartedAt),
    runtimeGeneration: binding.runtimeGeneration,
  };
}

export function serializeTerminalRef(ref: TerminalRef): string {
  return JSON.stringify(ref);
}

export function parseTerminalRef(raw: string): TerminalRef | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('terminal:')) {
    return { sessionId: value.slice('terminal:'.length).trim() };
  }
  if (!value.startsWith('{')) {
    return { sessionId: value };
  }
  try {
    const parsed = JSON.parse(value) as TerminalRef;
    if (!parsed || typeof parsed !== 'object') return null;
    const paneId = typeof parsed.paneId === 'string' ? parsed.paneId.trim() : undefined;
    const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : undefined;
    if (!paneId && !sessionId) return null;
    const expectedProcess = parseExpectedProcess(parsed.expectedProcess);
    if (parsed.expectedProcess !== undefined && expectedProcess === undefined) return null;
    return {
      paneId,
      sessionId,
      projectId:
        typeof parsed.projectId === 'string' ? parsed.projectId : (parsed.projectId ?? null),
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      command: typeof parsed.command === 'string' ? parsed.command : undefined,
      agentSlug:
        typeof parsed.agentSlug === 'string' ? parsed.agentSlug : (parsed.agentSlug ?? null),
      ...(expectedProcess ? { expectedProcess } : {}),
    };
  } catch {
    return null;
  }
}

export function terminalRefKey(ref: TerminalRef): string {
  return ref.paneId || ref.sessionId || ref.label || 'terminal';
}

export function terminalRefLabel(ref: TerminalRef): string {
  return ref.label || ref.command || ref.paneId || ref.sessionId || 'terminal';
}
