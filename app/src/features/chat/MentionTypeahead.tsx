import { Command } from 'cmdk';
import { Blocks, Bot, FileText, PlugZap, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ReferenceCatalogEntry,
  ReferenceCatalogKind,
} from '@/features/references/referenceCatalog';

export interface MentionTypeaheadProps {
  /** Safe mixed reference entries matching the typeahead query. */
  entries: readonly ReferenceCatalogEntry[];
  /** Currently highlighted stable catalog key (controlled). */
  selectedKey: string;
  /** What the user typed after the '@' (used for the empty-state copy). */
  query: string;
  /** Called when user clicks an item or hovers it. */
  onHoverKey?: (key: string) => void;
  /** Called when user activates an item (mouse click). Enter handling lives in Composer. */
  onSelect: (entry: ReferenceCatalogEntry) => void;
}

type MentionGroup = Readonly<{
  id: string;
  label: string;
  kinds: readonly ReferenceCatalogKind[];
}>;

const MENTION_GROUPS: readonly MentionGroup[] = [
  { id: 'agents', label: 'Agents', kinds: ['cao', 'agent'] },
  { id: 'mcps', label: 'MCPs', kinds: ['mcp'] },
  { id: 'plugins', label: 'Plugins', kinds: ['plugin'] },
  { id: 'references', label: 'References', kinds: ['artifact'] },
] as const;

const KIND_ICONS: Readonly<Record<ReferenceCatalogKind, LucideIcon>> = {
  cao: Sparkles,
  agent: Bot,
  mcp: PlugZap,
  plugin: Blocks,
  artifact: FileText,
};

const KIND_ICON_STYLES: Readonly<Record<ReferenceCatalogKind, string>> = {
  cao: 'border-accent-copper/45 bg-accent-copper/10 text-accent-copper',
  agent: 'border-accent-copper/35 bg-accent-copper/10 text-accent-copper',
  mcp: 'border-accent-cyan/45 bg-accent-cyan/10 text-accent-cyan',
  plugin: 'border-accent-honey/45 bg-accent-honey/10 text-accent-honey',
  artifact: 'border-border bg-muted/70 text-muted-foreground',
};

/**
 * The list rendered inside the mention popover. Uses cmdk's Command + List + Item
 * primitives for accessibility, with controlled `value` so the Composer (which keeps
 * focus on its textarea) can drive selection via keyboard.
 *
 * Keyboard handling lives in Composer; this component is presentational.
 */
export function MentionTypeahead({
  entries,
  selectedKey,
  query,
  onHoverKey,
  onSelect,
}: MentionTypeaheadProps) {
  return (
    <Command
      shouldFilter={false}
      value={selectedKey}
      // We control selection externally; this no-op keeps cmdk happy.
      onValueChange={() => {}}
      className="outline-none"
      // Don't let cmdk steal arrow keys from our textarea.
      loop
    >
      <Command.List className="max-h-[260px] overflow-y-auto py-1">
        {entries.length === 0 ? (
          <Command.Empty className="px-3 py-3 text-secondary text-muted-foreground">
            No references match <span className="font-mono text-foreground">@{query}</span>
          </Command.Empty>
        ) : (
          MENTION_GROUPS.map((group) => {
            const groupEntries = entries.filter((entry) => group.kinds.includes(entry.kind));
            if (groupEntries.length === 0) return null;
            return (
              <div key={group.id} role="group" aria-label={group.label}>
                <div className="px-3 pb-1 pt-1.5 text-[9px] font-medium uppercase tracking-[0.16em] text-accent-copper/70">
                  {group.label}
                </div>
                {groupEntries.map((entry) => {
                  const Icon = KIND_ICONS[entry.kind];
                  return (
                    <Command.Item
                      key={entry.key}
                      value={entry.key}
                      data-reference-kind={entry.kind}
                      onSelect={() => onSelect(entry)}
                      onMouseEnter={() => onHoverKey?.(entry.key)}
                      className={cn(
                        'mx-1 flex cursor-pointer items-center gap-2 rounded-[7px] border border-transparent px-2 py-1.5',
                        'text-secondary text-muted-foreground transition-colors duration-100',
                        'hover:border-border hover:bg-muted/60 hover:text-foreground',
                        'data-[selected=true]:border-accent-copper/35 data-[selected=true]:bg-accent-copper/10 data-[selected=true]:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                          KIND_ICON_STYLES[entry.kind],
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 font-mono text-[11px] text-foreground">
                            {entry.mention}
                          </span>
                          <span className="truncate text-secondary text-foreground">
                            {entry.label}
                          </span>
                        </span>
                        {entry.description ? (
                          <span className="block truncate text-[9px] text-muted-foreground/80">
                            {entry.description}
                          </span>
                        ) : null}
                      </span>
                      {entry.metadata ? (
                        <span className="ml-auto max-w-[14ch] shrink-0 truncate text-metadata text-muted-foreground">
                          {entry.metadata}
                        </span>
                      ) : null}
                    </Command.Item>
                  );
                })}
              </div>
            );
          })
        )}
      </Command.List>
    </Command>
  );
}
