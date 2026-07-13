/**
 * Desktop file + PowerShell actions Jarvis can propose in chat.
 * All mutating ops stay approval-gated via the action runner.
 */
import { FilePlus2, FileText, Terminal as TerminalIcon } from 'lucide-react';
import { writeTextFile, readTextFileSample } from '@/lib/fs';
import { enqueueTerminalCommand } from '@/features/terminals/terminalCommandQueue';
import { useUIStore } from '@/stores/ui';
import {
  createChatActivityId,
  countUnifiedDiffLines,
  useChatActivityStore,
} from '@/features/chat/activity';
import type { ActionDef, ActionResult } from './types';

const ok = (summary: string, data?: unknown): ActionResult => ({
  ok: true,
  summary,
  data,
});
const fail = (error: string): ActionResult => ({ ok: false, error });

const MAX_WRITE_CHARS = 900_000;

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function asAbsolutePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path) return null;
  // Windows drive or UNC, or POSIX absolute
  if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path)) return null;
  return path;
}

function buildCreateDiff(path: string, content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const body = lines.map((line) => `+${line}`).join('\n');
  return [`--- /dev/null`, `+++ b/${basename(path)}`, `@@ -0,0 +1,${lines.length} @@`, body].join('\n');
}

function recordWriteActivity(chatId: string | undefined, path: string, content: string, title: string): void {
  if (!chatId) return;
  const diff = buildCreateDiff(path, content);
  const counts = countUnifiedDiffLines(diff);
  useChatActivityStore.getState().record({
    id: createChatActivityId('diff'),
    chatId,
    kind: 'diff',
    status: 'done',
    title,
    subtitle: path,
    filePath: path,
    diff,
    ts: Date.now(),
    addedLines: counts.addedLines,
    removedLines: counts.removedLines,
  });
}

function navigateToTerminal(): void {
  useUIStore.getState().setRoute('terminal');
}

export const FILE_ACTIONS: ActionDef[] = [
  {
    id: 'files.write',
    category: 'host',
    label: 'Write text file',
    description:
      'Create or overwrite a UTF-8 text file at an absolute path (Desktop app). Requires user approval.',
    icon: FilePlus2,
    destructive: true,
    params: [
      {
        key: 'path',
        label: 'Absolute path',
        type: 'string',
        required: true,
        placeholder: 'C:\\Users\\you\\Downloads\\story.txt',
        help: 'Full absolute path including filename.',
      },
      {
        key: 'content',
        label: 'File content',
        type: 'string',
        required: true,
        placeholder: 'Hello from Jarvis…',
        help: 'UTF-8 text to write (max ~1 MB).',
      },
    ],
    run: async (params, ctx) => {
      const path = asAbsolutePath(params.path);
      if (!path) return fail('path must be an absolute filesystem path.');
      const content = typeof params.content === 'string' ? params.content : '';
      if (!content) return fail('content must be a non-empty string.');
      if (content.length > MAX_WRITE_CHARS) {
        return fail(`content is too large (${content.length} chars). Keep under ${MAX_WRITE_CHARS}.`);
      }

      // Native fs_write_text creates or overwrites when the parent folder exists.
      const written = await writeTextFile(path, content);
      if (!written.ok) {
        return fail(written.error.raw ?? written.error.code ?? 'write_failed');
      }
      recordWriteActivity(ctx.chatId, path, content, 'Wrote file');
      return ok(`Wrote ${basename(path)}.`, { path, bytes: content.length });
    },
  },
  {
    id: 'files.read',
    category: 'host',
    label: 'Read text file sample',
    description: 'Read a sample of a UTF-8 text file at an absolute path for Jarvis context.',
    icon: FileText,
    destructive: false,
    autoApprove: false,
    params: [
      {
        key: 'path',
        label: 'Absolute path',
        type: 'string',
        required: true,
        placeholder: 'C:\\Users\\you\\Documents\\notes.txt',
      },
      {
        key: 'maxBytes',
        label: 'Max bytes',
        type: 'number',
        required: false,
        default: 48_000,
        help: 'How many bytes to sample (default 48 KB).',
      },
    ],
    run: async (params, ctx) => {
      const path = asAbsolutePath(params.path);
      if (!path) return fail('path must be an absolute filesystem path.');
      const maxBytes =
        typeof params.maxBytes === 'number' && Number.isFinite(params.maxBytes)
          ? Math.max(1, Math.min(Math.floor(params.maxBytes), 256_000))
          : 48_000;
      const sample = await readTextFileSample(path, maxBytes);
      if (!sample.ok) {
        return fail(sample.error.raw ?? sample.error.code ?? 'read_failed');
      }
      if (ctx.chatId) {
        useChatActivityStore.getState().record({
          id: createChatActivityId('file'),
          chatId: ctx.chatId,
          kind: 'file',
          status: 'done',
          title: 'Read file',
          subtitle: path,
          filePath: path,
          detail: sample.content.slice(0, 4000),
          ts: Date.now(),
        });
      }
      return ok(`Read ${basename(path)} (${sample.content.length} chars).`, {
        path,
        content: sample.content,
      });
    },
  },
  {
    id: 'shell.powershell',
    category: 'terminal',
    label: 'Run PowerShell command',
    description:
      'Open Terminals and run a PowerShell command in a new pane. Requires user approval.',
    icon: TerminalIcon,
    destructive: true,
    params: [
      {
        key: 'command',
        label: 'PowerShell command',
        type: 'string',
        required: true,
        placeholder: 'Get-ChildItem $env:USERPROFILE\\Downloads',
        help: 'Command body (run via powershell -NoProfile -Command …).',
      },
      {
        key: 'cwd',
        label: 'Working directory',
        type: 'string',
        required: false,
        placeholder: 'C:\\Users\\you\\Downloads',
      },
      {
        key: 'label',
        label: 'Pane label',
        type: 'string',
        required: false,
        placeholder: 'PowerShell',
      },
    ],
    run: async (params, ctx) => {
      const body = typeof params.command === 'string' ? params.command.trim() : '';
      if (!body) return fail('Missing required parameter: command.');
      const cwd = typeof params.cwd === 'string' && params.cwd.trim() ? params.cwd.trim() : undefined;
      const label =
        typeof params.label === 'string' && params.label.trim()
          ? params.label.trim()
          : 'PowerShell';

      // Escape for double-quoted -Command string
      const escaped = body.replace(/"/g, '`"');
      const full = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${escaped}"`;
      enqueueTerminalCommand({ command: full, label, cwd });
      navigateToTerminal();

      if (ctx.chatId) {
        useChatActivityStore.getState().record({
          id: createChatActivityId('tool'),
          chatId: ctx.chatId,
          kind: 'tool',
          status: 'running',
          title: 'PowerShell',
          subtitle: body.slice(0, 120),
          detail: body,
          ts: Date.now(),
        });
      }
      return ok(`Queued PowerShell: ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`);
    },
  },
];

export const FILE_ACTION_COUNT = FILE_ACTIONS.length;
