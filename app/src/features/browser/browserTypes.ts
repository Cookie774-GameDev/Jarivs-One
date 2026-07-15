export type BrowserControlMode =
  | 'user_only'
  | 'ask_every_action'
  | 'allow_safe_session'
  | 'agent_controlled';

export type BrowserActionRisk = 'safe' | 'sensitive' | 'destructive';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  pinned: boolean;
  muted: boolean;
  controlMode: BrowserControlMode;
  lastError?: string;
}

export interface BrowserConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info';
  text: string;
  ts: number;
}

export interface BrowserAgentAction {
  id: string;
  tool: string;
  summary: string;
  risk: BrowserActionRisk;
  status: 'pending' | 'approved' | 'denied' | 'running' | 'done' | 'failed' | 'aborted';
  createdAt: number;
  result?: string;
}

export interface BrowserRuntimeInfo {
  running: boolean;
  executable?: string | null;
  profile_dir?: string | null;
  cdp_port?: number | null;
  cdp_ws_url?: string | null;
  session_id?: string | null;
  last_error?: string | null;
  installations?: Array<{ name: string; path: string; kind: string }>;
}

export const SENSITIVE_TOOLS = new Set([
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.select',
  'browser.check',
  'browser.uncheck',
  'browser.upload',
  'browser.download',
  'browser.navigate',
]);

export const DESTRUCTIVE_HINTS = [
  'submit',
  'delete',
  'purchase',
  'pay',
  'password',
  'sign in',
  'login',
  'checkout',
];
