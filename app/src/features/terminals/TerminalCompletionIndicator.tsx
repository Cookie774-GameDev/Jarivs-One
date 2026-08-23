import { useTerminalExecutionStore } from './terminalExecutionStore';
import './terminal-completion-indicator.css';

export interface TerminalCompletionIndicatorProps {
  executionId?: string;
}

export function TerminalCompletionIndicator({ executionId }: TerminalCompletionIndicatorProps) {
  const status = useTerminalExecutionStore((state) =>
    executionId ? state.executions[executionId]?.status : undefined,
  );
  if (status !== 'complete' && status !== 'failed') return null;

  const label = status === 'complete' ? 'Terminal finished' : 'Terminal failed';
  return (
    <span
      role="status"
      aria-label={label}
      className="terminal-completion-indicator"
      data-terminal-completion-state
      data-state={status}
      title={label}
    >
      <span aria-hidden="true" data-terminal-completion-dot />
    </span>
  );
}
