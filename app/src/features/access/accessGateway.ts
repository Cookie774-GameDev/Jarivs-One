/**
 * Typed, fail-closed transport boundary for VibeSpace Access.
 *
 * The server RPC is the entitlement authority. This module sends only the
 * installed app version, validates the returned decision artifact, and exposes
 * server-provided timestamps without deriving billing state locally. Checkout
 * and portal functions receive no client-controlled price, customer, plan, or
 * redirect authority.
 */

const MAX_APP_VERSION_LENGTH = 128;
const MAX_TIMESTAMP_LENGTH = 64;
const MAX_URL_LENGTH = 2048;
const MAX_DAYS_REMAINING = 36_500;
const SAFE_ERROR_MESSAGE = 'The access service returned an error.';

export type AppAccessServerStatus =
  | 'prelaunch'
  | 'trialing'
  | 'active'
  | 'cancel_at_period_end'
  | 'past_due'
  | 'grace'
  | 'locked'
  | 'admin'
  | 'internal'
  | 'unknown';

export type AppAccessCheckoutReason =
  | 'trial_will_convert'
  | 'payment_failed'
  | 'grace_period'
  | 'access_locked'
  | 'account_verification_required';

const SERVER_STATUSES: ReadonlySet<string> = new Set<AppAccessServerStatus>([
  'prelaunch',
  'trialing',
  'active',
  'cancel_at_period_end',
  'past_due',
  'grace',
  'locked',
  'admin',
  'internal',
  'unknown',
]);

const CHECKOUT_REASONS: ReadonlySet<string> = new Set<AppAccessCheckoutReason>([
  'trial_will_convert',
  'payment_failed',
  'grace_period',
  'access_locked',
  'account_verification_required',
]);

const SECRET_PATTERNS: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}\b/u,
  /\b(?:service_role|anon|supabase)_[A-Za-z0-9_.-]{10,}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b/u,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/u,
];

const ISO_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

export type AccessGatewayErrorCode =
  | 'invalid_configuration'
  | 'rpc_error'
  | 'function_error'
  | 'malformed_response'
  | 'insecure_url'
  | 'aborted';

export class AccessGatewayError extends Error {
  readonly code: AccessGatewayErrorCode;

  constructor(code: AccessGatewayErrorCode, message: string) {
    super(message);
    this.name = 'AccessGatewayError';
    this.code = code;
  }
}

export interface AccessGatewayTransport {
  rpc(
    fn: string,
    params: Record<string, unknown>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<{ data: unknown; error: unknown }>;
  invokeFunction(
    fn: string,
    options: { readonly body: Record<string, unknown>; readonly signal?: AbortSignal },
  ): Promise<{ data: unknown; error: unknown }>;
}

export interface AccessGatewayDeps {
  readonly transport: AccessGatewayTransport;
  readonly appVersion: string;
}

/** Exact, normalized projection of the server RPC response. */
export interface AccessServerSnapshot {
  readonly status: AppAccessServerStatus;
  readonly enabled: boolean;
  readonly serverTime: string;
  readonly trialEndsAt: string | null;
  readonly currentPeriodEndsAt: string | null;
  readonly graceEndsAt: string | null;
  readonly daysRemaining: number | null;
  readonly canUseApp: boolean;
  readonly canEdit: boolean;
  readonly canExport: boolean;
  readonly requiresCheckout: boolean;
  readonly checkoutReason: AppAccessCheckoutReason | null;
}

export interface AccessUrlResult {
  readonly url: string;
}

export interface AccessGateway {
  checkAccess(signal?: AbortSignal): Promise<AccessServerSnapshot>;
  createCheckoutUrl(signal?: AbortSignal): Promise<AccessUrlResult>;
  createPortalUrl(signal?: AbortSignal): Promise<AccessUrlResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(message: string): never {
  throw new AccessGatewayError('malformed_response', message);
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : malformed(`"${key}" must be a boolean.`);
}

function parseTimestamp(value: unknown, key: string, required: boolean): string | null {
  if (value === undefined || value === null) {
    return required ? malformed(`"${key}" is required.`) : null;
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TIMESTAMP_LENGTH) {
    return malformed(`"${key}" must be a bounded ISO-8601 timestamp.`);
  }
  const match = ISO_TIMESTAMP_RE.exec(value);
  if (!match || value.trim() !== value || !Number.isFinite(Date.parse(value))) {
    return malformed(`"${key}" must be a bounded ISO-8601 timestamp.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return malformed(`"${key}" must be a valid ISO-8601 timestamp.`);
  }
  return value;
}

function parseDaysRemaining(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_DAYS_REMAINING
  ) {
    return malformed('"daysRemaining" must be a bounded non-negative whole number.');
  }
  return value;
}

function parseCheckoutReason(value: unknown): AppAccessCheckoutReason | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !CHECKOUT_REASONS.has(value)) {
    return malformed('"checkoutReason" is not recognized.');
  }
  return value as AppAccessCheckoutReason;
}

function validateStateConsistency(snapshot: AccessServerSnapshot): void {
  const production = new Set<AppAccessServerStatus>([
    'prelaunch',
    'trialing',
    'active',
    'cancel_at_period_end',
    'past_due',
    'grace',
    'admin',
    'internal',
  ]);
  const expectedUse = production.has(snapshot.status);
  if (snapshot.canUseApp !== expectedUse || snapshot.canEdit !== expectedUse) {
    return malformed(`Capabilities are inconsistent with status "${snapshot.status}".`);
  }
  if (!snapshot.canExport) {
    return malformed('The server must preserve export access in every entitlement state.');
  }

  let expectedCheckout = false;
  let expectedReason: AppAccessCheckoutReason | null = null;
  switch (snapshot.status) {
    case 'trialing':
      expectedCheckout = true;
      expectedReason = 'trial_will_convert';
      if (snapshot.trialEndsAt === null) malformed('A trialing response requires trialEndsAt.');
      break;
    case 'active':
    case 'cancel_at_period_end':
      if (snapshot.currentPeriodEndsAt === null) {
        malformed(`An ${snapshot.status} response requires currentPeriodEndsAt.`);
      }
      break;
    case 'past_due':
      expectedCheckout = true;
      expectedReason = 'payment_failed';
      if (snapshot.currentPeriodEndsAt === null) {
        malformed('A past_due response requires currentPeriodEndsAt.');
      }
      break;
    case 'grace':
      expectedCheckout = true;
      expectedReason = 'grace_period';
      if (snapshot.graceEndsAt === null) malformed('A grace response requires graceEndsAt.');
      break;
    case 'locked':
      if (snapshot.checkoutReason === 'account_verification_required') {
        expectedCheckout = false;
        expectedReason = 'account_verification_required';
      } else {
        expectedCheckout = true;
        expectedReason = 'access_locked';
      }
      break;
    default:
      break;
  }
  if (
    snapshot.requiresCheckout !== expectedCheckout ||
    snapshot.checkoutReason !== expectedReason
  ) {
    malformed(`Checkout metadata is inconsistent with status "${snapshot.status}".`);
  }
}

function validateServerSnapshot(data: unknown): AccessServerSnapshot {
  if (!isRecord(data)) malformed('Access status response must be an object.');
  const status = data.status;
  if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) {
    return malformed('"status" is not recognized.');
  }
  const snapshot: AccessServerSnapshot = {
    status: status as AppAccessServerStatus,
    enabled: requireBoolean(data, 'enabled'),
    serverTime: parseTimestamp(data.serverTime, 'serverTime', true) as string,
    trialEndsAt: parseTimestamp(data.trialEndsAt, 'trialEndsAt', false),
    currentPeriodEndsAt: parseTimestamp(data.currentPeriodEndsAt, 'currentPeriodEndsAt', false),
    graceEndsAt: parseTimestamp(data.graceEndsAt, 'graceEndsAt', false),
    daysRemaining: parseDaysRemaining(data.daysRemaining),
    canUseApp: requireBoolean(data, 'canUseApp'),
    canEdit: requireBoolean(data, 'canEdit'),
    canExport: requireBoolean(data, 'canExport'),
    requiresCheckout: requireBoolean(data, 'requiresCheckout'),
    checkoutReason: parseCheckoutReason(data.checkoutReason),
  };
  validateStateConsistency(snapshot);
  return Object.freeze(snapshot);
}

function sanitizeErrorMessage(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024) {
    return SAFE_ERROR_MESSAGE;
  }
  return SECRET_PATTERNS.some((pattern) => pattern.test(raw)) ? SAFE_ERROR_MESSAGE : raw;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeErrorMessage(error.message);
  if (isRecord(error)) return sanitizeErrorMessage(error.message);
  return SAFE_ERROR_MESSAGE;
}

function aborted(): AccessGatewayError {
  return new AccessGatewayError('aborted', 'The operation was cancelled.');
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted();
}

/** Reject promptly even when an injected transport ignores AbortSignal. */
function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(aborted());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function validateUrlResponse(data: unknown): AccessUrlResult {
  if (!isRecord(data)) {
    throw new AccessGatewayError('insecure_url', 'Billing URL response must be an object.');
  }
  const url = data.url;
  if (
    typeof url !== 'string' ||
    url.length === 0 ||
    url.length > MAX_URL_LENGTH ||
    url.trim() !== url
  ) {
    throw new AccessGatewayError('insecure_url', 'Billing URL is missing or oversized.');
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname === '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      throw new Error('unsafe billing URL');
    }
  } catch {
    throw new AccessGatewayError(
      'insecure_url',
      'Billing URL must be a credential-free HTTPS URL.',
    );
  }
  return Object.freeze({ url });
}

export function createAccessGateway(deps: AccessGatewayDeps): AccessGateway {
  const { transport, appVersion } = deps;
  if (
    typeof appVersion !== 'string' ||
    appVersion.length === 0 ||
    appVersion.length > MAX_APP_VERSION_LENGTH ||
    appVersion.trim() !== appVersion
  ) {
    throw new AccessGatewayError(
      'invalid_configuration',
      'A bounded, trimmed app version is required.',
    );
  }

  async function checkAccess(signal?: AbortSignal): Promise<AccessServerSnapshot> {
    assertNotAborted(signal);
    let envelope: unknown;
    try {
      envelope = await awaitWithAbort(
        transport.rpc('get_app_access', { p_app_version: appVersion }, { signal }),
        signal,
      );
    } catch (error) {
      if (error instanceof AccessGatewayError && error.code === 'aborted') throw error;
      if (signal?.aborted) throw aborted();
      throw new AccessGatewayError('rpc_error', extractErrorMessage(error));
    }
    assertNotAborted(signal);
    if (!isRecord(envelope) || !('data' in envelope) || !('error' in envelope)) {
      throw new AccessGatewayError(
        'rpc_error',
        'The access service returned an invalid transport response.',
      );
    }
    const result = envelope;
    if (result.error !== null && result.error !== undefined) {
      throw new AccessGatewayError('rpc_error', extractErrorMessage(result.error));
    }
    return validateServerSnapshot(result.data);
  }

  async function invokeUrlFunction(
    functionName: string,
    signal?: AbortSignal,
  ): Promise<AccessUrlResult> {
    assertNotAborted(signal);
    let envelope: unknown;
    try {
      envelope = await awaitWithAbort(
        transport.invokeFunction(functionName, { body: {}, signal }),
        signal,
      );
    } catch (error) {
      if (error instanceof AccessGatewayError && error.code === 'aborted') throw error;
      if (signal?.aborted) throw aborted();
      throw new AccessGatewayError('function_error', extractErrorMessage(error));
    }
    assertNotAborted(signal);
    if (!isRecord(envelope) || !('data' in envelope) || !('error' in envelope)) {
      throw new AccessGatewayError(
        'function_error',
        'The access service returned an invalid transport response.',
      );
    }
    const result = envelope;
    if (result.error !== null && result.error !== undefined) {
      throw new AccessGatewayError('function_error', extractErrorMessage(result.error));
    }
    return validateUrlResponse(result.data);
  }

  return Object.freeze({
    checkAccess,
    createCheckoutUrl: (signal?: AbortSignal) =>
      invokeUrlFunction('create-access-checkout', signal),
    createPortalUrl: (signal?: AbortSignal) => invokeUrlFunction('create-access-portal', signal),
  });
}
