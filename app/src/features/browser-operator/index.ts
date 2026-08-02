export type BrowserMode = 'local' | 'cloud';
export type BrowserRisk =
  | 'read'
  | 'navigation'
  | 'form_draft'
  | 'external_send'
  | 'financial'
  | 'destructive'
  | 'credential';
export type BrowserTakeoverReason =
  | 'login'
  | 'password'
  | 'passkey'
  | 'captcha'
  | 'mfa'
  | 'payment'
  | 'legal_publish'
  | 'high_risk_publish'
  | 'credential';
export type BrowserToolName =
  | 'snapshot'
  | 'screenshot'
  | 'navigate'
  | 'form_draft'
  | 'external_send'
  | 'upload'
  | 'download';

export interface BrowserPolicy {
  mode: BrowserMode;
  /** Exact domains only. Subdomains must be listed separately. */
  allowedDomains: string[];
  /** Exact domains only. A block always wins over an allow. */
  blockedDomains: string[];
  uploads: 'deny' | 'allow';
  downloads: 'deny' | 'sandbox';
  screenshotRetention: 'none' | 'session';
  cloud?: {
    enabled: boolean;
    metered: boolean;
    /** User-facing provider region label, never inferred or hidden. */
    regionLabel: string;
  };
}

export interface BrowserSessionRequest {
  sessionId: string;
  profileId: string;
  accountScopeId: string;
  cloudConsent?: {
    meteredAccepted: boolean;
    regionLabel: string;
  };
}

export interface BrowserSessionState {
  sessionId: string;
  profileId: string;
  accountScopeId: string;
  isolationKey: string;
  mode: BrowserMode;
  cookieAccess: 'isolated_ephemeral';
  downloadSandboxId: string | null;
  cloud: { metered: boolean; regionLabel: string } | null;
}

export type BrowserSessionResult =
  | { ok: true; session: BrowserSessionState }
  | {
      ok: false;
      reason:
        | 'invalid_session_scope'
        | 'cloud_disabled'
        | 'cloud_consent_required'
        | 'cloud_region_mismatch';
    };

export interface BrowserAction {
  risk: BrowserRisk;
  phase?: 'draft' | 'submit';
  sensitive?: boolean;
  takeoverReason?: BrowserTakeoverReason;
}

export type BrowserActionDecision =
  | { outcome: 'allow' }
  | { outcome: 'approval_required'; risk: 'external_send' | 'destructive' }
  | {
      outcome: 'takeover_required';
      reason: BrowserTakeoverReason;
      approvalRequired: boolean;
    };

export type NavigationDecision =
  | { outcome: 'allow'; domain: string }
  | {
      outcome: 'deny';
      reason:
        | 'invalid_url'
        | 'credential_bearing_url'
        | 'consumer_ai_denied'
        | 'domain_blocked'
        | 'domain_not_approved';
      domain?: string;
    };

const TOOL_ORDER: readonly BrowserToolName[] = [
  'snapshot',
  'screenshot',
  'navigate',
  'form_draft',
  'external_send',
  'upload',
  'download',
];
const TOOL_SET = new Set<string>(TOOL_ORDER);
const CONSUMER_AI_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'bard.google.com',
] as const;
const CREDENTIAL_PARAMETER_NAMES = new Set([
  'access_token',
  'api_key',
  'apikey',
  'client_secret',
  'id_token',
  'mfa',
  'otp',
  'passwd',
  'password',
  'refresh_token',
  'secret',
  'token',
]);

function canonicalPolicyDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\.$/u, '');
  if (!trimmed || /[/:@?#\s]/u.test(trimmed)) return null;
  try {
    const parsed = new URL(`https://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return null;
  }
}

function canonicalDomainSet(values: readonly string[]): Set<string> {
  const domains = new Set<string>();
  for (const value of values) {
    const domain = canonicalPolicyDomain(value);
    if (domain) domains.add(domain);
  }
  return domains;
}

function isConsumerAiDomain(domain: string): boolean {
  return CONSUMER_AI_DOMAINS.some(
    (consumerDomain) => domain === consumerDomain || domain.endsWith(`.${consumerDomain}`),
  );
}

function hasCredentialParameters(parameters: URLSearchParams): boolean {
  return [...parameters.keys()].some((key) => CREDENTIAL_PARAMETER_NAMES.has(key.toLowerCase()));
}

export function decideNavigation(policy: BrowserPolicy, target: string): NavigationDecision {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { outcome: 'deny', reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { outcome: 'deny', reason: 'invalid_url' };
  }
  const fragmentParameters = parsed.hash.includes('=')
    ? new URLSearchParams(parsed.hash.slice(1))
    : new URLSearchParams();
  if (
    parsed.username ||
    parsed.password ||
    hasCredentialParameters(parsed.searchParams) ||
    hasCredentialParameters(fragmentParameters)
  ) {
    return { outcome: 'deny', reason: 'credential_bearing_url' };
  }
  const domain = parsed.hostname.toLowerCase().replace(/\.$/u, '');
  if (!domain) return { outcome: 'deny', reason: 'invalid_url' };
  if (isConsumerAiDomain(domain)) {
    return { outcome: 'deny', reason: 'consumer_ai_denied', domain };
  }
  if (canonicalDomainSet(policy.blockedDomains).has(domain)) {
    return { outcome: 'deny', reason: 'domain_blocked', domain };
  }
  if (!canonicalDomainSet(policy.allowedDomains).has(domain)) {
    return { outcome: 'deny', reason: 'domain_not_approved', domain };
  }
  return { outcome: 'allow', domain };
}

export function exposeImplementedTools(
  implemented: readonly BrowserToolName[],
  requested: readonly BrowserToolName[] = TOOL_ORDER,
): BrowserToolName[] {
  for (const tool of [...implemented, ...requested]) {
    if (!TOOL_SET.has(tool)) throw new Error(`Unknown browser tool: ${tool}`);
  }
  const implementedSet = new Set(implemented);
  const requestedSet = new Set(requested);
  return TOOL_ORDER.filter((tool) => implementedSet.has(tool) && requestedSet.has(tool));
}

export function planObservation(
  need: 'semantic' | 'layout' | 'image' | 'canvas',
): Array<'snapshot' | 'screenshot'> {
  return need === 'semantic' ? ['snapshot'] : ['snapshot', 'screenshot'];
}

function validScopePart(value: string): boolean {
  return value.trim().length > 0 && value.length <= 128 && !/[\u0000-\u001f]/u.test(value);
}

export function createBrowserSession(
  policy: BrowserPolicy,
  request: BrowserSessionRequest,
): BrowserSessionResult {
  if (
    !validScopePart(request.sessionId) ||
    !validScopePart(request.profileId) ||
    !validScopePart(request.accountScopeId)
  ) {
    return { ok: false, reason: 'invalid_session_scope' };
  }

  let cloud: BrowserSessionState['cloud'] = null;
  if (policy.mode === 'cloud') {
    if (!policy.cloud?.enabled) return { ok: false, reason: 'cloud_disabled' };
    if (policy.cloud.metered && request.cloudConsent?.meteredAccepted !== true) {
      return { ok: false, reason: 'cloud_consent_required' };
    }
    if (
      !policy.cloud.regionLabel.trim() ||
      request.cloudConsent?.regionLabel !== policy.cloud.regionLabel
    ) {
      return { ok: false, reason: 'cloud_region_mismatch' };
    }
    cloud = {
      metered: policy.cloud.metered,
      regionLabel: policy.cloud.regionLabel,
    };
  }

  const isolationKey = [request.profileId, request.accountScopeId, request.sessionId]
    .map(encodeURIComponent)
    .join(':');
  return {
    ok: true,
    session: {
      sessionId: request.sessionId,
      profileId: request.profileId,
      accountScopeId: request.accountScopeId,
      isolationKey,
      mode: policy.mode,
      cookieAccess: 'isolated_ephemeral',
      downloadSandboxId: policy.downloads === 'sandbox' ? `download:${request.sessionId}` : null,
      cloud,
    },
  };
}

export function decideBrowserAction(action: BrowserAction): BrowserActionDecision {
  if (action.takeoverReason) {
    return {
      outcome: 'takeover_required',
      reason: action.takeoverReason,
      approvalRequired: true,
    };
  }
  if (action.risk === 'credential' || (action.phase === 'submit' && action.sensitive)) {
    return {
      outcome: 'takeover_required',
      reason: 'credential',
      approvalRequired: true,
    };
  }
  if (action.risk === 'financial') {
    return {
      outcome: 'takeover_required',
      reason: 'payment',
      approvalRequired: true,
    };
  }
  if (
    action.risk === 'external_send' ||
    (action.risk === 'form_draft' && action.phase === 'submit')
  ) {
    return { outcome: 'approval_required', risk: 'external_send' };
  }
  if (action.risk === 'destructive') {
    return { outcome: 'approval_required', risk: 'destructive' };
  }
  return { outcome: 'allow' };
}

export class BrowserOperatorSession {
  private takeover: { id: string; reason: BrowserTakeoverReason } | undefined;
  private takeoverSequence = 0;
  status: 'ready' | 'takeover_paused' = 'ready';

  constructor(private readonly sessionId: string) {
    if (!validScopePart(sessionId)) throw new Error('Invalid browser session id');
  }

  pauseForTakeover(reason: BrowserTakeoverReason): { id: string; reason: BrowserTakeoverReason } {
    if (this.status === 'takeover_paused') throw new Error('Browser takeover is already paused');
    this.takeoverSequence += 1;
    this.takeover = {
      id: `${this.sessionId}:takeover:${this.takeoverSequence}`,
      reason,
    };
    this.status = 'takeover_paused';
    return { ...this.takeover };
  }

  resumeAfterTakeover(takeoverId: string, userConfirmed: boolean): boolean {
    if (
      this.status !== 'takeover_paused' ||
      !this.takeover ||
      this.takeover.id !== takeoverId ||
      userConfirmed !== true
    ) {
      return false;
    }
    this.takeover = undefined;
    this.status = 'ready';
    return true;
  }

  getModelVisibleState():
    | { sessionId: string; status: 'ready'; takeover: null }
    | {
        sessionId: string;
        status: 'takeover_paused';
        takeover: { id: string; reason: BrowserTakeoverReason };
      } {
    if (!this.takeover) return { sessionId: this.sessionId, status: 'ready', takeover: null };
    return {
      sessionId: this.sessionId,
      status: 'takeover_paused',
      takeover: { ...this.takeover },
    };
  }
}
