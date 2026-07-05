import { ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface QueuedChatMessage {
  id: string;
  text: string;
  createdAt: number;
}

export function QueuedMessagesBar({
  messages,
  onEdit,
  onSendNow,
  onDelete,
}: {
  messages: QueuedChatMessage[];
  onEdit: (id: string) => void;
  onSendNow: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (messages.length === 0) return null;
  return (
    <div
      aria-label="Queued messages"
      className="mb-1.5 rounded-lg border border-accent-copper/20 bg-background/70 px-1.5 py-1 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
    >
      <div className="mb-0.5 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>Queued</span>
        <span>{messages.length} queued</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {messages.map((message) => (
          <div
            key={message.id}
            className="group flex items-center gap-1.5 rounded-md border border-border/50 bg-panel/80 px-2 py-0.5"
          >
            <p className="min-w-0 flex-1 truncate text-[12px] leading-5 text-foreground">{message.text}</p>
            <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit queued message" onClick={() => onEdit(message.id)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Send queued message now" onClick={() => onSendNow(message.id)}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete queued message" onClick={() => onDelete(message.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
