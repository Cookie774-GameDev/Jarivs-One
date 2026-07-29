import * as React from 'react';
import {
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button, Input, Textarea, toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useAgentStore } from '@/stores/agents';
import { findProtectedJarvisAgent } from '@/lib/jarvis/identity';
import type { ProjectId } from '@/types';
import {
  createTextFile,
  describeFsError,
  listDirectory,
  readTextFile,
  writeTextFile,
  type FsEntry,
} from '@/lib/fs';
import { runAgent } from '@/lib/ai/router';
import {
  applyChatModelSelectionToAgent,
} from '@/lib/ai/modelSelection';
import {
  basename,
  chooseProjectFolder,
  dirname,
  extension,
  getStoredOpenFile,
  getStoredProjectRoot,
  isPopularTextFile,
  joinPath,
  setStoredOpenFile,
  setStoredProjectRoot,
} from './projectFiles';
import { startRightClickDrag } from '@/lib/rightClickDrag';

/** Mini Files-panel chat only — never writes into the main Chat route. */
type MiniLine = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
};

const FILES_MINI_SYSTEM = [
  'You are Jarvis answering questions about a code/file selection inside the VibeSpace Files page.',
  'Keep replies short, clear, and to the point — prefer tight bullet lines over long essays.',
  'Stay focused on the attached selection and the user question. Do not invent files that are not shown.',
].join(' ');

const MAX_TREE_CHILDREN = 500;

interface TreeNodeProps {
  entry: FsEntry;
  depth: number;
  rootDir: string;
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string) => void;
}

function FileTreeNode({ entry, depth, rootDir, selectedPath, onOpenFile, onOpenDir }: TreeNodeProps) {
  const [open, setOpen] = React.useState(false);
  const [children, setChildren] = React.useState<FsEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const loadChildren = async () => {
    if (!entry.isDir) return;
    if (children.length > 0) return;
    setLoading(true);
    const result = await listDirectory(entry.path, { root: rootDir });
    setLoading(false);
    if (!result.ok) {
      toast.error('Could not open folder', describeFsError(result.error));
      return;
    }
    setChildren(result.entries.slice(0, MAX_TREE_CHILDREN));
  };

  const toggle = async () => {
    if (!entry.isDir) {
      onOpenFile(entry.path);
      return;
    }
    const next = !open;
    setOpen(next);
    onOpenDir(entry.path);
    if (next) await loadChildren();
  };

  const onDragStart = (e: React.DragEvent) => {
    if (entry.isDir) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', entry.path);
    e.dataTransfer.setData('application/x-jarvis-file', entry.path);
  };

  return (
    <div>
      <button
        type="button"
        draggable={!entry.isDir}
        onDragStart={onDragStart}
        onMouseDown={(e) => {
          if (e.button === 2 && !entry.isDir) {
            e.stopPropagation();
            startRightClickDrag(e, 'file', { path: entry.path });
          }
        }}
        onClick={() => void toggle()}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          selectedPath === entry.path && 'bg-muted ring-1 ring-accent-copper/40',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {entry.isDir ? (
          <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        ) : (
          <span className="h-3.5 w-3.5" />
        )}
        {entry.isDir ? (
          open ? <FolderOpen className="h-4 w-4 text-accent-honey" /> : <Folder className="h-4 w-4 text-accent-honey" />
        ) : (
          <FileText className={cn('h-4 w-4', isPopularTextFile(entry.path) ? 'text-accent-copper' : 'text-muted-foreground')} />
        )}
        <span className="min-w-0 flex-1 truncate text-secondary text-foreground">{entry.name}</span>
        {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        {!entry.isDir && entry.size !== undefined && (
          <span className="text-metadata text-muted-foreground">{Math.ceil(entry.size / 1024)}k</span>
        )}
      </button>
      {open && children.length > 0 && children.map((child) => (
        <FileTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          rootDir={rootDir}
          selectedPath={selectedPath}
          onOpenFile={onOpenFile}
          onOpenDir={onOpenDir}
        />
      ))}
    </div>
  );
}

export function FilesPage() {
  const projectId = useAuthStore((s) => s.projectId) as ProjectId | null;
  const [rootDraft, setRootDraft] = React.useState(() => getStoredProjectRoot(projectId));
  const [rootDir, setRootDir] = React.useState(() => getStoredProjectRoot(projectId));
  const [currentDir, setCurrentDir] = React.useState(() => getStoredProjectRoot(projectId));
  const [entries, setEntries] = React.useState<FsEntry[]>([]);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(() => getStoredOpenFile(projectId) || null);
  const [content, setContent] = React.useState('');
  const [savedContent, setSavedContent] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [newFileName, setNewFileName] = React.useState('');
  const [askDraft, setAskDraft] = React.useState('Explain this code and suggest a safe edit.');
  /** Selection attached via the highlight → Ask Jarvis control. */
  const [attachedSelection, setAttachedSelection] = React.useState<string>('');
  const [miniLines, setMiniLines] = React.useState<MiniLine[]>([]);
  const [miniBusy, setMiniBusy] = React.useState(false);
  const [selPopup, setSelPopup] = React.useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const editorRef = React.useRef<HTMLTextAreaElement>(null);
  const miniScrollRef = React.useRef<HTMLDivElement>(null);
  const jarvisAgent = useAgentStore(
    (s) => findProtectedJarvisAgent(Object.values(s.agents)) ?? null,
  );
  const chatModelSelection = useAuthStore((s) => s.chatModelSelection);

  const dirty = content !== savedContent;

  const loadRoot = React.useCallback(async (path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    const clean = path.trim();
    const result = await listDirectory(clean, { root: clean });
    setLoading(false);
    if (!result.ok) {
      toast.error('Could not open project folder', describeFsError(result.error));
      return;
    }
    setRootDir(result.path);
    setCurrentDir(result.path);
    setRootDraft(result.path);
    setEntries(result.entries);
    setStoredProjectRoot(projectId, result.path);
  }, [projectId]);

  React.useEffect(() => {
    const nextRoot = getStoredProjectRoot(projectId);
    const nextFile = getStoredOpenFile(projectId);
    setRootDraft(nextRoot);
    setRootDir(nextRoot);
    setCurrentDir(nextRoot);
    setEntries([]);
    setSelectedPath(nextFile || null);
    setContent('');
    setSavedContent('');
    if (nextRoot) void loadRoot(nextRoot);
    if (nextFile) void openFile(nextFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openFile = async (path: string) => {
    const result = await readTextFile(path, { root: rootDir });
    if (!result.ok) {
      toast.error('Could not read file', describeFsError(result.error));
      return;
    }
    setSelectedPath(path);
    setContent(result.content);
    setSavedContent(result.content);
    setStoredOpenFile(projectId, path, false);
  };

  React.useEffect(() => {
    const onOpenPath = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string | null; path?: string }>).detail;
      if (!detail?.path) return;
      if ((detail.projectId ?? null) !== (projectId ?? null)) return;
      setCurrentDir(dirname(detail.path));
      void openFile(detail.path);
    };
    window.addEventListener('jarvis:files:open-path', onOpenPath as EventListener);
    return () => window.removeEventListener('jarvis:files:open-path', onOpenPath as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const chooseRoot = async () => {
    const picked = await chooseProjectFolder({
      title: 'Choose project folder',
      initialPath: rootDraft.trim() || rootDir || undefined,
    });
    if (!picked) return;
    setRootDraft(picked);
    await loadRoot(picked);
    toast.success('Project folder selected', picked);
  };

  const saveFile = async () => {
    if (!selectedPath) return;
    const result = await writeTextFile(selectedPath, content, { root: rootDir });
    if (!result.ok) {
      toast.error('Save failed', describeFsError(result.error));
      return;
    }
    setSavedContent(content);
    toast.success('Saved', basename(selectedPath));
    if (rootDir) void loadRoot(rootDir);
  };

  const createFile = async () => {
    const name = newFileName.trim();
    if (!name || !currentDir) return;
    const path = joinPath(currentDir, name);
    const result = await createTextFile(path, { root: rootDir });
    if (!result.ok) {
      toast.error('Could not create file', describeFsError(result.error));
      return;
    }
    setNewFileName('');
    if (rootDir) await loadRoot(rootDir);
    await openFile(path);
  };

  const readEditorSelection = React.useCallback((): string => {
    const el = editorRef.current;
    if (!el) return '';
    return content.slice(el.selectionStart, el.selectionEnd).trim();
  }, [content]);

  const updateSelectionPopup = React.useCallback(() => {
    const el = editorRef.current;
    if (!el) {
      setSelPopup(null);
      return;
    }
    const text = content.slice(el.selectionStart, el.selectionEnd).trim();
    if (!text || el.selectionStart === el.selectionEnd) {
      setSelPopup(null);
      return;
    }
    // Anchor a compact toolbar near the top of the editor (selection APIs
    // on <textarea> don't expose a client rect for the caret range).
    const rect = el.getBoundingClientRect();
    setSelPopup({
      text,
      top: Math.max(8, rect.top + 10),
      left: Math.min(window.innerWidth - 160, Math.max(12, rect.left + rect.width / 2 - 70)),
    });
  }, [content]);

  React.useEffect(() => {
    const hide = () => setSelPopup(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  React.useEffect(() => {
    miniScrollRef.current?.scrollTo({ top: miniScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [miniLines, miniBusy]);

  const copySelection = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied', `${Math.min(text.length, 48)} chars`);
    } catch {
      toast.error('Copy failed', 'Clipboard is not available.');
    }
    setSelPopup(null);
  };

  /** Attach highlight into the Files mini chat only (no main Chat route). */
  const attachSelectionForAsk = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setAttachedSelection(clean);
    setSelPopup(null);
    if (!askDraft.trim()) setAskDraft('Explain this selection briefly.');
  };

  const askJarvisMini = async () => {
    if (!selectedPath) return;
    const code = attachedSelection.trim() || readEditorSelection() || content.slice(0, 6000);
    const question = askDraft.trim() || 'Explain this briefly.';
    if (!code.trim()) {
      toast.warning('Nothing to ask about', 'Select text in the file or open a file first.');
      return;
    }
    if (!jarvisAgent) {
      toast.error('Jarvis not ready', 'Wait for agents to finish loading.');
      return;
    }

    const userLine = attachedSelection.trim()
      ? `${question}\n\n(Selection from ${basename(selectedPath)})`
      : question;

    const userId = `u_${Date.now().toString(36)}`;
    const assistantId = `a_${Date.now().toString(36)}`;
    setMiniLines((prev) => [
      ...prev,
      { id: userId, role: 'user', text: userLine },
      { id: assistantId, role: 'assistant', text: '' },
    ]);
    setMiniBusy(true);

    const agent = applyChatModelSelectionToAgent(
      {
        ...jarvisAgent,
        system_prompt: [FILES_MINI_SYSTEM, jarvisAgent.system_prompt ?? ''].filter(Boolean).join('\n\n'),
      },
      chatModelSelection,
    );

    const payload = [
      `File: ${selectedPath}`,
      '',
      'Selection:',
      '```',
      code.slice(0, 12_000),
      '```',
      '',
      `Question: ${question}`,
    ].join('\n');

    try {
      const response = await runAgent({
        agent,
        messages: [{ role: 'user', content: payload }],
        max_output_tokens: 512,
        temperature: 0.35,
        onChunk: (chunk) => {
          if (!chunk.delta) return;
          setMiniLines((prev) =>
            prev.map((line) =>
              line.id === assistantId ? { ...line, text: line.text + chunk.delta } : line,
            ),
          );
        },
      });
      const finalText = (response.text || '').trim() || 'No response.';
      setMiniLines((prev) =>
        prev.map((line) =>
          line.id === assistantId ? { ...line, text: finalText } : line,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMiniLines((prev) =>
        prev.map((line) =>
          line.id === assistantId
            ? { ...line, role: 'error', text: msg.slice(0, 280) }
            : line,
        ),
      );
    } finally {
      setMiniBusy(false);
    }
  };

  return (
    <div
      data-monochrome-route="files"
      className="flex h-full min-h-0 w-full bg-background [html[data-theme=monochrome]_&]:font-sans"
    >
      <aside
        data-monochrome-surface="files-tree"
        className="flex w-[360px] shrink-0 flex-col border-r border-border bg-panel [html[data-theme=monochrome]_&]:w-[304px]"
      >
        <div className="border-b border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-accent-copper" />
            <div className="text-ui-strong text-foreground">Project Files</div>
          </div>
          <div className="flex gap-1.5">
            <Input
              value={rootDraft}
              onChange={(e) => setRootDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void loadRoot(rootDraft); }}
              placeholder="C:\\Users\\you\\project or /home/you/project"
              className="font-mono text-metadata"
            />
            <Button size="sm" variant="secondary" onClick={() => void chooseRoot()}>Choose</Button>
            <Button size="sm" variant="accent" onClick={() => void loadRoot(rootDraft)}>Open</Button>
          </div>
          {rootDir && (
            <div className="flex items-center gap-1.5 text-metadata text-muted-foreground">
              <button className="hover:text-foreground" onClick={() => void loadRoot(dirname(rootDir))}>Up</button>
              <span className="truncate font-mono" title={rootDir}>{rootDir}</span>
              <button className="ml-auto hover:text-foreground" onClick={() => void loadRoot(rootDir)} aria-label="Refresh files">
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <div className="p-3 text-secondary text-muted-foreground">
              Open a project folder. Folders expand in-place and files can be dragged into chat or terminals.
            </div>
          ) : entries.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              rootDir={rootDir}
              selectedPath={selectedPath}
              onOpenFile={(path) => void openFile(path)}
              onOpenDir={setCurrentDir}
            />
          ))}
        </div>

        <div className="border-t border-border p-2">
          <div className="mb-1 truncate text-metadata text-muted-foreground">New file in: <span className="font-mono">{currentDir || rootDir || 'open a folder'}</span></div>
          <div className="flex gap-1.5">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void createFile(); }}
              placeholder="new-file.ts"
              className="font-mono text-metadata"
              disabled={!currentDir}
            />
            <Button size="sm" variant="ghost" onClick={() => void createFile()} disabled={!currentDir || !newFileName.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <main
        data-monochrome-surface="files-editor"
        className="flex min-w-0 flex-1 flex-col [html[data-theme=monochrome]_&]:bg-background"
      >
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border bg-paper-soft px-3 py-1.5 [html[data-theme=monochrome]_&]:bg-panel">
          <div className="min-w-0">
            <div className="truncate font-mono text-secondary text-foreground">{selectedPath ?? 'No file selected'}</div>
            <div className="text-metadata text-muted-foreground">
              Popular text/code formats are editable. Binary and oversized files are safely rejected.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedPath && <span className="text-metadata text-muted-foreground">.{extension(selectedPath) || 'file'}</span>}
            {dirty && <span className="text-metadata text-accent-copper">Unsaved</span>}
            <Button size="sm" variant="accent" onClick={() => void saveFile()} disabled={!selectedPath || !dirty} className="gap-1">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col gap-2 p-3">
          <Textarea
            ref={editorRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={updateSelectionPopup}
            onMouseUp={updateSelectionPopup}
            onKeyUp={updateSelectionPopup}
            onBlur={() => {
              // Delay so toolbar buttons can receive the click first.
              window.setTimeout(() => setSelPopup(null), 180);
            }}
            placeholder="Open a text/code file to edit it here."
            spellCheck={false}
            className="min-h-0 flex-1 resize-none font-mono text-sm leading-5"
          />

          {/* Compact selection toolbar — Files page only */}
          {selPopup && (
            <div
              data-monochrome-surface="files-selection-tools"
              className="fixed z-50 flex items-center gap-0.5 rounded-full border border-accent-copper/40 bg-panel/95 px-1 py-0.5 shadow-lg backdrop-blur [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:shadow-none [html[data-theme=monochrome]_&]:backdrop-blur-none"
              style={{ top: selPopup.top, left: selPopup.left }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent-copper/15"
                onClick={() => void copySelection(selPopup.text)}
                title="Copy"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
              <span className="h-3 w-px bg-border" aria-hidden />
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-accent-copper transition-colors hover:bg-accent-copper/15"
                onClick={() => attachSelectionForAsk(selPopup.text)}
                title="Ask Jarvis about this selection"
              >
                <Sparkles className="h-3 w-3" />
                Ask Jarvis
              </button>
            </div>
          )}

          {/* Mini Files Jarvis panel — isolated from main Chat */}
          <div
            data-monochrome-surface="files-jarvis"
            className="flex max-h-[42%] min-h-[140px] shrink-0 flex-col rounded-lg border border-border bg-panel shadow-soft [html[data-theme=monochrome]_&]:rounded-sm [html[data-theme=monochrome]_&]:border-border-mid [html[data-theme=monochrome]_&]:shadow-none"
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-accent-copper" />
              <span className="text-metadata font-medium text-foreground">Ask Jarvis (this file)</span>
              <span className="text-[10px] text-muted-foreground">short answers · stays on Files</span>
              {miniLines.length > 0 && (
                <button
                  type="button"
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setMiniLines([])}
                >
                  Clear
                </button>
              )}
            </div>

            <div
              ref={miniScrollRef}
              className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2"
            >
              {miniLines.length === 0 ? (
                <p className="text-metadata text-muted-foreground">
                  Highlight code → <span className="text-foreground">Ask Jarvis</span>, then send a short question.
                </p>
              ) : (
                miniLines.map((line) => (
                  <div
                    key={line.id}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[12px] leading-snug whitespace-pre-wrap break-words',
                      line.role === 'user' && 'bg-muted/60 text-foreground',
                      line.role === 'assistant' && 'border border-accent-copper/20 bg-accent-copper/5 text-foreground',
                      line.role === 'error' && 'border border-destructive/30 bg-destructive/10 text-destructive',
                    )}
                  >
                    <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {line.role === 'user' ? 'You' : line.role === 'error' ? 'Error' : 'Jarvis'}
                    </span>
                    {line.text || (miniBusy && line.role === 'assistant' ? '…' : '')}
                  </div>
                ))
              )}
            </div>

            {attachedSelection ? (
              <div className="mx-2 mb-1 flex items-start gap-1.5 rounded-md border border-accent-copper/30 bg-accent-copper/10 px-2 py-1">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent-copper" />
                <pre className="min-w-0 flex-1 overflow-hidden text-[11px] leading-snug text-foreground/90 line-clamp-3 whitespace-pre-wrap font-mono">
                  {attachedSelection.slice(0, 400)}
                  {attachedSelection.length > 400 ? '…' : ''}
                </pre>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setAttachedSelection('')}
                  aria-label="Clear attached selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : null}

            <div className="flex gap-1.5 border-t border-border p-2">
              <Input
                value={askDraft}
                onChange={(e) => setAskDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void askJarvisMini();
                  }
                }}
                placeholder="Ask about the selection…"
                disabled={miniBusy}
                className="h-8 text-sm"
              />
              <Button
                variant="accent"
                size="sm"
                onClick={() => void askJarvisMini()}
                disabled={miniBusy || !selectedPath || !content.trim()}
                className="gap-1 shrink-0"
              >
                {miniBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default FilesPage;
