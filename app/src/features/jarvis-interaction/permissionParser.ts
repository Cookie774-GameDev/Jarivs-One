import type { Part } from '@/types/chat';
import type { JarvisPermissionRequest } from './types';

const PERMISSION_FENCE_RE = /```jarvis_permission\s*([\s\S]*?)```/gi;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asTargets(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const targets = value.map((item) => asString(item)).filter(Boolean);
  return targets.length ? targets : undefined;
}

function asPermission(value: unknown, index: number): JarvisPermissionRequest | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = asString(record.title);
  const description = asString(record.description);
  if (!title || !description) return null;
  const riskRaw = asString(record.risk, 'medium');
  const actionRaw = asString(record.action, 'apply_changes');
  const risk: JarvisPermissionRequest['risk'] =
    riskRaw === 'low' || riskRaw === 'medium' || riskRaw === 'high' ? riskRaw : 'medium';
  const action: JarvisPermissionRequest['action'] =
    actionRaw === 'write_file' ||
    actionRaw === 'delete_file' ||
    actionRaw === 'run_command' ||
    actionRaw === 'apply_changes' ||
    actionRaw === 'change_project' ||
    actionRaw === 'launch_agents'
      ? actionRaw
      : 'apply_changes';
  return {
    id: asString(record.id, `perm_${Date.now()}_${index}`),
    title,
    description,
    risk,
    action,
    targets: asTargets(record.targets),
    planId: asString(record.planId) || undefined,
    status: 'pending',
  };
}

function textPart(text: string): Part[] {
  const trimmed = text.trim();
  return trimmed ? [{ kind: 'text', text: trimmed }] : [];
}

export function parseJarvisPermissionBlocks(text: string): { hasPermissionBlocks: boolean; parts: Part[] } {
  const parts: Part[] = [];
  let lastIndex = 0;
  let count = 0;
  for (const match of text.matchAll(PERMISSION_FENCE_RE)) {
    parts.push(...textPart(text.slice(lastIndex, match.index)));
    lastIndex = (match.index ?? 0) + match[0].length;
    try {
      const request = asPermission(JSON.parse(match[1] ?? ''), count);
      if (request) {
        parts.push({ kind: 'permission_request', request });
        count += 1;
      } else {
        parts.push({ kind: 'text', text: match[0].trim() });
      }
    } catch {
      parts.push({ kind: 'text', text: match[0].trim() });
    }
  }
  parts.push(...textPart(text.slice(lastIndex)));
  return {
    hasPermissionBlocks: count > 0,
    parts: parts.length ? parts : [{ kind: 'text', text }],
  };
}
