/**
 * Typed, validated window-to-window protocol for main / pet-overlay / pet-mini-panel.
 * Reject malformed or unauthorized messages. Pure — no Tauri imports required for tests.
 */

export const PET_WINDOW_LABELS = ['main', 'pet-overlay', 'pet-mini-panel'] as const;
export type PetWindowLabel = (typeof PET_WINDOW_LABELS)[number];

export const PET_PROTOCOL_ACTIONS = [
  'pet:ready',
  'pet:anim_changed',
  'pet:click',
  'pet:drag_start',
  'pet:drag_end',
  'pet:position',
  'panel:open',
  'panel:focus',
  'panel:minimize',
  'panel:restore',
  'panel:close_request',
  'panel:close_confirmed',
  'panel:closed',
  'panel:lifecycle',
  'presentation:claim_chat',
  'presentation:release_chat',
  'presentation:claim_terminal',
  'presentation:release_terminal',
  'presentation:sync',
  'activity:push',
  'session:heartbeat',
] as const;
export type PetProtocolAction = (typeof PET_PROTOCOL_ACTIONS)[number];

export interface PetProtocolEnvelope<T = unknown> {
  v: 1;
  id: string;
  sessionId: string;
  action: PetProtocolAction;
  source: PetWindowLabel;
  dest: PetWindowLabel | 'broadcast';
  ts: number;
  payload: T;
}

export type ProtocolValidationError =
  | 'bad_version'
  | 'bad_id'
  | 'bad_session'
  | 'bad_action'
  | 'bad_source'
  | 'bad_dest'
  | 'bad_ts'
  | 'unauthorized_route'
  | 'not_object';

const ALLOWED_ROUTES: Record<PetProtocolAction, Array<{ from: PetWindowLabel; to: PetWindowLabel | 'broadcast' }>> = {
  'pet:ready': [
    { from: 'pet-overlay', to: 'main' },
    { from: 'pet-overlay', to: 'broadcast' },
  ],
  'pet:anim_changed': [
    { from: 'pet-overlay', to: 'main' },
    { from: 'pet-overlay', to: 'pet-mini-panel' },
    { from: 'pet-overlay', to: 'broadcast' },
  ],
  'pet:click': [
    { from: 'pet-overlay', to: 'main' },
    { from: 'pet-overlay', to: 'pet-mini-panel' },
    { from: 'pet-overlay', to: 'broadcast' },
  ],
  'pet:drag_start': [{ from: 'pet-overlay', to: 'main' }, { from: 'pet-overlay', to: 'broadcast' }],
  'pet:drag_end': [{ from: 'pet-overlay', to: 'main' }, { from: 'pet-overlay', to: 'broadcast' }],
  'pet:position': [
    { from: 'pet-overlay', to: 'main' },
    { from: 'pet-overlay', to: 'pet-mini-panel' },
    { from: 'pet-overlay', to: 'broadcast' },
  ],
  'panel:open': [
    { from: 'pet-overlay', to: 'main' },
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-overlay', to: 'pet-mini-panel' },
    { from: 'main', to: 'broadcast' },
  ],
  'panel:focus': [
    { from: 'pet-overlay', to: 'main' },
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-overlay', to: 'pet-mini-panel' },
  ],
  'panel:minimize': [
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'pet-mini-panel', to: 'pet-overlay' },
    { from: 'main', to: 'pet-mini-panel' },
  ],
  'panel:restore': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-overlay', to: 'pet-mini-panel' },
    { from: 'pet-mini-panel', to: 'main' },
  ],
  'panel:close_request': [
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'main', to: 'pet-mini-panel' },
  ],
  'panel:close_confirmed': [
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'pet-mini-panel', to: 'pet-overlay' },
    { from: 'main', to: 'broadcast' },
  ],
  'panel:closed': [
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'pet-mini-panel', to: 'pet-overlay' },
    { from: 'pet-mini-panel', to: 'broadcast' },
  ],
  'panel:lifecycle': [
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'pet-mini-panel', to: 'pet-overlay' },
    { from: 'main', to: 'broadcast' },
  ],
  'presentation:claim_chat': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'main', to: 'broadcast' },
  ],
  'presentation:release_chat': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'main', to: 'broadcast' },
  ],
  'presentation:claim_terminal': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'main', to: 'broadcast' },
  ],
  'presentation:release_terminal': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'main', to: 'broadcast' },
  ],
  'presentation:sync': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'pet-mini-panel', to: 'main' },
    { from: 'main', to: 'broadcast' },
  ],
  'activity:push': [
    { from: 'main', to: 'pet-mini-panel' },
    { from: 'main', to: 'broadcast' },
  ],
  'session:heartbeat': [
    { from: 'main', to: 'broadcast' },
    { from: 'pet-overlay', to: 'broadcast' },
    { from: 'pet-mini-panel', to: 'broadcast' },
  ],
};

function isPetWindowLabel(v: unknown): v is PetWindowLabel {
  return typeof v === 'string' && (PET_WINDOW_LABELS as readonly string[]).includes(v);
}

function isAction(v: unknown): v is PetProtocolAction {
  return typeof v === 'string' && (PET_PROTOCOL_ACTIONS as readonly string[]).includes(v);
}

export function validatePetProtocolMessage(
  raw: unknown,
  expectedSessionId?: string,
): { ok: true; message: PetProtocolEnvelope } | { ok: false; error: ProtocolValidationError } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not_object' };
  const m = raw as Record<string, unknown>;
  if (m.v !== 1) return { ok: false, error: 'bad_version' };
  if (typeof m.id !== 'string' || m.id.length < 4) return { ok: false, error: 'bad_id' };
  if (typeof m.sessionId !== 'string' || m.sessionId.length < 4) return { ok: false, error: 'bad_session' };
  if (expectedSessionId && m.sessionId !== expectedSessionId) return { ok: false, error: 'bad_session' };
  if (!isAction(m.action)) return { ok: false, error: 'bad_action' };
  if (!isPetWindowLabel(m.source)) return { ok: false, error: 'bad_source' };
  if (m.dest !== 'broadcast' && !isPetWindowLabel(m.dest)) return { ok: false, error: 'bad_dest' };
  if (typeof m.ts !== 'number' || !Number.isFinite(m.ts)) return { ok: false, error: 'bad_ts' };

  const routes = ALLOWED_ROUTES[m.action];
  const dest = m.dest as PetWindowLabel | 'broadcast';
  const allowed = routes.some((r) => r.from === m.source && r.to === dest);
  if (!allowed) return { ok: false, error: 'unauthorized_route' };

  return {
    ok: true,
    message: {
      v: 1,
      id: m.id,
      sessionId: m.sessionId as string,
      action: m.action,
      source: m.source,
      dest,
      ts: m.ts as number,
      payload: m.payload,
    },
  };
}

export function createPetProtocolMessage<T>(
  partial: Omit<PetProtocolEnvelope<T>, 'v' | 'id' | 'ts'> & { id?: string; ts?: number },
): PetProtocolEnvelope<T> {
  return {
    v: 1,
    id: partial.id ?? `msg_${Math.random().toString(36).slice(2, 10)}`,
    sessionId: partial.sessionId,
    action: partial.action,
    source: partial.source,
    dest: partial.dest,
    ts: partial.ts ?? Date.now(),
    payload: partial.payload,
  };
}
