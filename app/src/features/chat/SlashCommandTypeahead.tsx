import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { HiveModelIcon } from '@/components/brand';
import { scrollPickerItemIntoView } from './pickerScroll';
import { LEGACY_DROPDOWN_TRANSITION, resolveDropdownMotion } from './dropdownMotion';
import { useThemeMotionTransition } from '@/features/appearance/themeMotion';
import {
  BarChart3,
  Bot,
  Brain,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileText,
  HelpCircle,
  History,
  ListTodo,
  MessageSquare,
  Network,
  Palette,
  Plug,
  Redo2,
  Shield,
  Sparkles,
  Terminal,
  Undo2,
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
  agent: 'multitask',
  multitaksk: 'multitask',
  multiatask: 'multitask',
  mulititask: 'multitask',
  multitaks: 'multitask',
  subagent: 'subagents',
  suabagent: 'subagents',
  subagnts: 'subagents',
  subagens: 'subagents',
  clearfile: 'clearfiles',
  'clear-files': 'clearfiles',
  cearfile: 'clearfiles',
  cearfiles: 'clearfiles',
  permission: 'permissions',
  perms: 'permissions',
  access: 'permissions',
};

export function normalizeSlashCmd(raw: string): string {
  const cmd = raw.toLowerCase();
  return SLASH_CMD_ALIASES[cmd] ?? cmd;
}

export const CHAT_ATTACH_SLASH_CMDS = new Set([
  'context',
  'plug',
  'skills',
  'allaboutme',
  'file',
  'canvas',
]);

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
    cmd: 'permissions',
    aliases: ['permission', 'perms', 'access'],
    description: 'Set chat mode: Agent, Plan, or Ask',
    icon: Shield,
    category: 'chat',
    takesArg: true,
    argPlaceholder: 'agent | plan | ask',
    hasOptions: true,
  },
  {
    cmd: 'ask',
    description: 'Switch to Ask Mode (or ask a question)',
    icon: HelpCircle,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<question>',
  },
  {
    cmd: 'plan',
    description: 'Switch to Plan Mode (or plan a goal)',
    icon: ClipboardList,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<goal>',
  },
  {
    cmd: 'multitask',
    aliases: ['agent'],
    description: 'Agent Mode task — launch a chat-native Jarvis agent',
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
    description: 'Attach a file from the open project',
    icon: FileText,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<name or path>',
    hasOptions: true,
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
    description: 'Attach by absolute path',
    icon: FileText,
    category: 'chat',
    takesArg: true,
    argPlaceholder: '<path>',
  },
  {
    cmd: 'clearfiles',
    aliases: ['clearfile', 'clear-files', 'cearfile'],
    description: 'Clear all attached files & images from this message',
    icon: FileText,
    category: 'chat',
  },

  { cmd: 'kanban', description: 'Reference Kanban', icon: ListTodo, category: 'navigation' },
  {
    cmd: 'canvas',
    description: 'Reference Canvas',
    icon: Network,
    category: 'navigation',
    hasOptions: true,
  },
  { cmd: 'history', description: 'Reference History', icon: History, category: 'navigation' },
  { cmd: 'tools', description: 'Reference Tools', icon: Wrench, category: 'navigation' },
  {
    cmd: 'agents',
    description: 'Reference Agents page/editor',
    icon: Users,
    category: 'navigation',
  },
  {
    cmd: 'schedule',
    description: 'Reference Schedule',
    icon: CalendarDays,
    category: 'navigation',
  },
  { cmd: 'chat', description: 'Reference Chat', icon: MessageSquare, category: 'navigation' },

  {
    cmd: 'usage',
    description: 'Show truthful current-chat usage and quota availability',
    icon: BarChart3,
    category: 'utility',
    argPlaceholder: '[refresh|session|all]',
  },
  {
    cmd: 'theme',
    description: 'Switch Jarvis Core, VibeSpace, Default, MonoChrome, or Sakura',
    icon: Palette,
    category: 'utility',
    takesArg: true,
    argPlaceholder: 'jarvis | vibespace | default | monochrome | sakura',
  },
  {
    cmd: 'undo',
    description: 'Undo the last full chat turn (user + reply)',
    icon: Undo2,
    category: 'utility',
  },
  {
    cmd: 'redo',
    description: 'Redo the last undone chat turn',
    icon: Redo2,
    category: 'utility',
  },
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
  const reducedMotion = useReducedMotion();
  const dropdownTransition = useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION);
  const dropdownMotion = resolveDropdownMotion(reducedMotion, dropdownTransition);
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
      {...dropdownMotion}
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
