import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { HiveModelIcon } from '@/components/brand';
import { scrollPickerItemIntoView } from './pickerScroll';
import {
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  FileText,
  HelpCircle,
  History,
  ListTodo,
  MessageSquare,
  Network,
  Plug,
  Sparkles,
  Terminal,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface SlashCommandDef {
  cmd: string;
  /** Legacy spellings that resolve to this command (e.g. terminal → terminals). */
  aliases?: string[];
  description: string;
  icon: LucideIcon;
  /** Official Hive model mark instead of Lucide icon. */
  brandIcon?: 'hive';
  category?: 'chat' | 'navigation' | 'utility';
  takesArg?: boolean;
  argPlaceholder?: string;
  hasOptions?: boolean;
}

export const SLASH_CMD_ALIASES: Record<string, string> = {
  terminal: 'terminals',
  contextmap: 'context',
  contexts: 'context',
  foundry: 'build-ai',
  agent: 'multitask',
  multitaksk: 'multitask',
  multiatask: 'multitask',
  mulititask: 'multitask',
  multitaks: 'multitask',
  subagent: 'subagents',
  suabagent: 'subagents',
  subagnts: 'subagents',
  subagens: 'subagents',
};

export function normalizeSlashCmd(raw: string): string {
  const cmd = raw.toLowerCase();
  return SLASH_CMD_ALIASES[cmd] ?? cmd;
}

export const CHAT_ATTACH_SLASH_CMDS = new Set(['context', 'plug', 'skills', 'allaboutme']);

export function isChatAttachSlashCmd(cmd: string): boolean {
  return CHAT_ATTACH_SLASH_CMDS.has(normalizeSlashCmd(cmd));
}

export function findSlashCommandDef(cmd: string): SlashCommandDef | undefined {
  const canonical = normalizeSlashCmd(cmd);
  return SLASH_COMMANDS.find((entry) => entry.cmd === canonical);
}

function fuzzyTokenScore(query: string, target: string): number {
  const t = target.toLowerCase();
  if (!query) return 1;
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  if (t.includes(query)) return 40;
  return 0;
}

export function slashCmdMatchScore(query: string, def: SlashCommandDef): number {
  const q = query.toLowerCase();
  return Math.max(
    fuzzyTokenScore(q, def.cmd),
    ...(def.aliases ?? []).map((alias) => fuzzyTokenScore(q, alias)),
    fuzzyTokenScore(q, def.description) * 0.5,
  );
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    cmd: 'ask',
    description: 'Ask only: answer without edits, commands, or plans',
    icon: HelpCircle,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<question>',
  },
  {
    cmd: 'plan',
    description: 'Plan mode: read-only plan with Build/Redo/Cancel',
    icon: ClipboardList,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<goal>',
  },
  {
    cmd: 'multitask',
    aliases: ['agent'],
    description: 'Launch a chat-native Jarvis agent for a task',
    icon: Bot,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<task>',
  },
  {
    cmd: 'subagents',
    aliases: ['subagent'],
    description: 'Spawn chat-native subagents for the task using this chat model',
    icon: Bot,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<task>',
  },
  {
    cmd: 'terminals',
    aliases: ['terminal'],
    description: 'Reference the terminal surface in chat',
    icon: Terminal,
    category: 'chat',
  },
  {
    cmd: 'context',
    aliases: ['contextmap'],
    description: 'Attach a context map to this chat',
    icon: Network,
    category: 'chat',
    hasOptions: true,
  },
  {
    cmd: 'plug',
    description: 'Attach a connected plugin to this chat',
    icon: Plug,
    category: 'chat',
    hasOptions: true,
  },
  {
    cmd: 'skills',
    description: 'Add a skill to this chat turn',
    icon: Sparkles,
    category: 'chat',
    hasOptions: true,
  },
  {
    cmd: 'allaboutme',
    description: 'Attach, edit, retake, or update AllAboutMe.md',
    icon: Brain,
    category: 'chat',
    hasOptions: true,
  },
  {
    cmd: 'hive',
    description: 'Reference Hive Balanced in chat',
    icon: Sparkles,
    brandIcon: 'hive',
    category: 'chat',
  },
  {
    cmd: 'file',
    description: 'Attach a project file',
    icon: FileText,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<filename>',
  },
  {
    cmd: 'model',
    description: 'Switch AI model',
    icon: Zap,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<provider>',
    hasOptions: true,
  },
  {
    cmd: 'attach',
    description: 'Attach by path',
    icon: FileText,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<path>',
  },
  { cmd: 'clearfiles', description: 'Clear file attachments', icon: FileText, category: 'chat' },

  { cmd: 'kanban', description: 'Reference Kanban', icon: ListTodo, category: 'navigation' },
  { cmd: 'history', description: 'Reference History', icon: History, category: 'navigation' },
  { cmd: 'tools', description: 'Reference Tools', icon: Wrench, category: 'navigation' },
  { cmd: 'agents', description: 'Reference Agents page/editor', icon: Users, category: 'navigation' },
  { cmd: 'build-ai', aliases: ['foundry'], description: 'Open Build Your Own AI', icon: FlaskConical, category: 'navigation' },
  { cmd: 'schedule', description: 'Reference Schedule', icon: CalendarDays, category: 'navigation' },
  { cmd: 'chat', description: 'Reference Chat', icon: MessageSquare, category: 'navigation' },

  { cmd: 'usage', description: 'Show usage info', icon: BarChart3, category: 'utility' },
  { cmd: 'commands', description: 'Command catalog', icon: Zap, category: 'utility' },
  { cmd: 'help', description: 'Show help', icon: HelpCircle, category: 'utility' },
];

const CATEGORY_LABELS: Record<string, string> = {
  chat: 'Chat context',
  navigation: 'Navigation',
  utility: 'Utility',
};

const CATEGORY_ORDER = ['chat', 'navigation', 'utility'];

export function orderSlashCommandsForDisplay(commands: SlashCommandDef[]): SlashCommandDef[] {
  const grouped = commands.reduce<Record<string, SlashCommandDef[]>>((acc, cmd) => {
    const cat = cmd.category ?? 'utility';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {});
  return CATEGORY_ORDER.flatMap((category) => grouped[category] ?? []);
}

export interface SlashCommandTypeaheadProps {
  commands: SlashCommandDef[];
  selectedCmd: string;
  query: string;
  onHoverCmd?: (cmd: string) => void;
  onSelect: (cmd: SlashCommandDef) => void;
}

export interface SlashCommandTypeaheadRef {
  moveUp: () => void;
  moveDown: () => void;
  selectCurrent: () => void;
}

export const SlashCommandTypeahead = forwardRef<
  SlashCommandTypeaheadRef,
  SlashCommandTypeaheadProps
>(function SlashCommandTypeahead({ commands, selectedCmd, query, onHoverCmd, onSelect }, ref) {
  const listRef = useRef<HTMLDivElement>(null);
  const displayCommands = orderSlashCommandsForDisplay(commands);

  useImperativeHandle(ref, () => ({
    moveUp: () => {
      if (displayCommands.length === 0) return;
      const i = displayCommands.findIndex((c) => c.cmd === selectedCmd);
      const next = displayCommands[(i - 1 + displayCommands.length) % displayCommands.length]!;
      onHoverCmd?.(next.cmd);
    },
    moveDown: () => {
      if (displayCommands.length === 0) return;
      const i = displayCommands.findIndex((c) => c.cmd === selectedCmd);
      const next = displayCommands[(i + 1) % displayCommands.length]!;
      onHoverCmd?.(next.cmd);
    },
    selectCurrent: () => {
      const cmd = displayCommands.find((c) => c.cmd === selectedCmd) ?? displayCommands[0];
      if (cmd) onSelect(cmd);
    },
  }));

  useEffect(() => {
    if (!listRef.current || !selectedCmd) return;
    scrollPickerItemIntoView(listRef.current, `[data-value="${selectedCmd}"]`);
  }, [selectedCmd]);

  const groupedCommands = displayCommands.reduce<Record<string, SlashCommandDef[]>>((acc, cmd) => {
    const cat = cmd.category ?? 'utility';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'jarvis-slash-dropdown w-[276px] overflow-hidden rounded-[12px] border border-border-mid/80',
        'bg-elevated/95 text-foreground backdrop-blur-xl',
        'shadow-[0_18px_48px_rgba(0,0,0,0.48),inset_0_1px_0_hsl(var(--foreground)/0.05)]',
        'font-mono text-[11px]',
      )}
    >
      <div className="border-b border-border bg-panel/90 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-accent-copper" />
          <span className="text-[10px] text-muted-foreground">
            {query ? `/${query}` : 'commands'}
          </span>
        </div>
      </div>

      <div ref={listRef} className="max-h-[200px] overflow-y-auto py-0.5 scrollbar-hidden">
        {commands.length === 0 ? (
          <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
            No match for /{query}
          </div>
        ) : (
          CATEGORY_ORDER.map((category) => {
            const cmds = groupedCommands[category];
            if (!cmds?.length) return null;
            return (
              <div key={category}>
                <div className="px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-accent-copper/65">
                  {CATEGORY_LABELS[category]}
                </div>
                {cmds.map((c) => {
                  const Icon = c.icon;
                  const isSelected = selectedCmd === c.cmd;

                  return (
                    <div
                      key={c.cmd}
                      data-value={c.cmd}
                      onClick={() => onSelect(c)}
                      onMouseEnter={() => onHoverCmd?.(c.cmd)}
                      className={cn(
                        'mx-1 flex cursor-pointer items-center gap-2 rounded-[7px] border px-2.5 py-1.5',
                        'transition-all duration-100',
                        isSelected
                          ? 'jarvis-slash-item-selected border-accent-copper/45 bg-accent-copper/12 text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground',
                      )}
                    >
                      {c.brandIcon === 'hive' ? (
                        <HiveModelIcon size={18} className={isSelected ? '' : 'opacity-80'} />
                      ) : (
                        <Icon
                          className={cn(
                            'h-3 w-3 shrink-0',
                            isSelected ? 'text-accent-copper' : 'text-muted-foreground/70',
                          )}
                        />
                      )}
                      <span className="flex-1 truncate">/{c.cmd}</span>
                      {c.hasOptions && (
                        <ChevronRight className="h-2.5 w-2.5 text-accent-copper/60" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-panel/90 px-3 py-1.5 text-[9px] text-muted-foreground">
        <span>
          <kbd className="jarvis-kbd">up/down</kbd> nav
        </span>
        <span>
          <kbd className="jarvis-kbd">enter</kbd> select
        </span>
        <span className="ml-auto">
          <kbd className="jarvis-kbd">esc</kbd>
        </span>
      </div>
    </motion.div>
  );
});

export default SlashCommandTypeahead;
