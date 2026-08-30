import { Command } from 'cmdk';
import { Avatar } from '@/components/ui';
import { cn, colorFromString } from '@/lib/utils';
import type { ReferenceCatalogEntry } from '@/features/references/referenceCatalog';

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
          entries.map((entry) => {
            const color = colorFromString(entry.key);
            return (
              <Command.Item
                key={entry.key}
                value={entry.key}
                onSelect={() => onSelect(entry)}
                onMouseEnter={() => onHoverKey?.(entry.key)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 mx-1 rounded cursor-pointer',
                  'text-secondary text-foreground',
                  'data-[selected=true]:bg-muted data-[selected=true]:text-foreground',
                )}
              >
                <Avatar seed={entry.key} size={20} />
                <span className="font-mono text-secondary" style={{ color }}>
                  {entry.mention}
                </span>
                <span className="text-secondary text-foreground truncate">{entry.label}</span>
                <span className="ml-auto text-metadata text-muted-foreground truncate max-w-[14ch]">
                  {entry.metadata ?? entry.description}
                </span>
              </Command.Item>
            );
          })
        )}
      </Command.List>
    </Command>
  );
}
