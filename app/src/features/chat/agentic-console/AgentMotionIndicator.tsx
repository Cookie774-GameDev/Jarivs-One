import * as React from 'react';
import type { ChatActivityKind, ChatActivityStatus } from '../activity/types';
import './agent-motion.css';

export type AgentMotionKind =
  | 'glyph-current'
  | 'nine-dot-fold'
  | 'twin-loop'
  | 'cursor-forge'
  | 'breathing-brackets'
  | 'stack-shift'
  | 'code-shimmer';

export interface AgentMotionEvidence {
  status?: ChatActivityStatus;
  activityKind?: ChatActivityKind;
  title?: string;
  detail?: string;
  filePath?: string;
}

const LIVE_STATUSES = new Set<ChatActivityStatus>(['pending', 'running']);

export function resolveAgentMotion(evidence: AgentMotionEvidence): AgentMotionKind | null {
  if (evidence.status && !LIVE_STATUSES.has(evidence.status)) return null;
  const text = `${evidence.title ?? ''} ${evidence.detail ?? ''} ${evidence.filePath ?? ''}`.toLowerCase();

  if (/allaboutme|all about me|learning from this chat/.test(text)) {
    return 'breathing-brackets';
  }
  if (/context map|context md|keeping context|memory update|second brain/.test(text)) {
    return 'twin-loop';
  }
  if (
    evidence.activityKind === 'subagent' ||
    /subagents?|delegat|coordinat|handoff|spawn(?:ing|ed)? agent/.test(text)
  ) {
    return 'nine-dot-fold';
  }
  if (/final response|final answer|preparing (?:the )?(?:reply|response)|summari[sz]|audit/.test(text)) {
    return 'glyph-current';
  }
  if (
    evidence.activityKind === 'diff' ||
    /writing|wrote|editing|edited|patch|apply changes|implement|code change/.test(text)
  ) {
    return 'code-shimmer';
  }
  if (
    evidence.activityKind === 'file' ||
    /reading|inspect|index|search(?:ing)? (?:the )?(?:workspace|files?)|discover(?:ing)? files?/.test(text)
  ) {
    return 'stack-shift';
  }
  return 'cursor-forge';
}

export function AgentMotionIndicator({
  motion,
  compact = false,
}: {
  motion: AgentMotionKind;
  compact?: boolean;
}) {
  const common = {
    'data-agent-motion': motion,
    'data-agent-motion-size': compact ? 'compact' : 'standard',
    'aria-hidden': true,
  } as const;

  if (motion === 'glyph-current') {
    return (
      <span {...common} className="agent-motion agent-motion--glyph-current">
        <span className="agent-motion__word" data-text="VIBE">
          VIBE
        </span>
        <span className="agent-motion__baseline" />
      </span>
    );
  }
  if (motion === 'nine-dot-fold') {
    return (
      <span {...common} className="agent-motion agent-motion--nine-dot-fold">
        {Array.from({ length: 9 }, (_, index) => (
          <i key={index} style={{ '--motion-index': index } as React.CSSProperties} />
        ))}
      </span>
    );
  }
  if (motion === 'twin-loop') {
    return (
      <span {...common} className="agent-motion agent-motion--twin-loop">
        <i />
        <i />
      </span>
    );
  }
  if (motion === 'breathing-brackets') {
    return (
      <span {...common} className="agent-motion agent-motion--breathing-brackets">
        <i className="agent-motion__bracket agent-motion__bracket--left">[</i>
        <i className="agent-motion__seed" />
        <i className="agent-motion__bracket agent-motion__bracket--right">]</i>
      </span>
    );
  }
  if (motion === 'stack-shift') {
    return (
      <span {...common} className="agent-motion agent-motion--stack-shift">
        {[0.78, 0.44, 0.62, 0.31].map((fill, index) => (
          <i
            key={index}
            style={{ '--motion-index': index, '--motion-fill': fill } as React.CSSProperties}
          />
        ))}
      </span>
    );
  }
  if (motion === 'code-shimmer') {
    return (
      <span {...common} className="agent-motion agent-motion--code-shimmer">
        {[0.9, 0.64, 0.82, 0.5].map((width, index) => (
          <i
            key={index}
            style={{ '--motion-index': index, '--motion-width': width } as React.CSSProperties}
          />
        ))}
      </span>
    );
  }
  return (
    <span {...common} className="agent-motion agent-motion--cursor-forge">
      <i className="agent-motion__forge-line" />
      <i className="agent-motion__forge-cursor" />
    </span>
  );
}
