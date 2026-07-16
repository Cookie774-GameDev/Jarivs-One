import { Info } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import type { ProviderConnection } from '@/lib/ai/adapters/types';
import { CONNECTION_MODE_LABELS } from '@/lib/ai/useAccessibleChatModels';
import { getProviderConnectionDescriptor } from '@/lib/ai/adapters/catalog';

export function ConnectionInfoPopover({ connectionId }: { connectionId: string }) {
  let connection: Readonly<ProviderConnection>;
  try {
    connection = getProviderConnectionDescriptor(connectionId);
  } catch {
    return null;
  }
  const capabilities = [
    connection.capabilities.images && 'Images',
    connection.capabilities.files && 'Files',
    connection.capabilities.tools && 'Tools',
    connection.capabilities.streaming && 'Streaming',
  ].filter(Boolean);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Connection details for ${connection.displayName}`}>
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 space-y-2 p-3">
        <div>
          <p className="text-sm font-medium text-foreground">{connection.displayName}</p>
          <p className="text-xs text-muted-foreground">{CONNECTION_MODE_LABELS[connection.mode]}</p>
        </div>
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Auth</dt><dd>{connection.authSource}</dd>
          <dt className="text-muted-foreground">Supports</dt><dd>{capabilities.join(', ') || 'Text'}</dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
