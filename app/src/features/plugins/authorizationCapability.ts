import type {
  PluginAuthorizationCapability,
  ClassifiedPluginManifest,
  PluginManifest,
} from './types';

type PluginManifestDraft = Omit<PluginManifest, 'authorizationCapability'>;

const TRUSTED_MANUAL_RUNTIME_VERIFIERS = new Set(['canva', 'gmail', 'google-drive', 'zapier']);

const VERIFIED_PROVIDER_AUTHORIZATION = Object.freeze({
  github: Object.freeze({
    strategy: 'device_authorization' as const,
    authorizationUrl: 'https://github.com/login/device',
    manualFallback: true,
    externalPrerequisites: Object.freeze([
      'Configure a registered GitHub OAuth application public client ID with device flow enabled.',
    ]),
  }),
});

const MANUAL_OAUTH_PREREQUISITES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  gmail: Object.freeze([
    'Bring a refresh grant from your own registered Google Desktop OAuth client.',
    'Complete the exact loopback callback and restricted-scope consent outside VibeSpace.',
  ]),
  'google-drive': Object.freeze([
    'Bring a refresh grant from your own registered Google Desktop OAuth client.',
    'Complete the exact loopback callback and restricted-scope consent outside VibeSpace.',
  ]),
  canva: Object.freeze([
    'Bring client credentials and a current rotating refresh grant from your own Canva integration.',
    'Configure and complete the exact Canva redirect callback outside VibeSpace.',
  ]),
});

const HOSTED_OAUTH_INTEGRATION_BLOCKERS: Readonly<
  Record<
    string,
    Readonly<{
      reason: string;
      externalPrerequisites: readonly string[];
    }>
  >
> = Object.freeze({
  supabase: Object.freeze({
    reason:
      'Supabase offers provider-hosted browser sign-in for its remote MCP server, but VibeSpace has not implemented the MCP OAuth discovery, callback, or token lifecycle required to connect it safely.',
    externalPrerequisites: Object.freeze([
      'Integrate the official hosted Supabase MCP endpoint through OAuth discovery; never substitute a project API-key page for sign-in.',
      'Implement and verify the exact redirect callback, PKCE/state validation, secure token storage and refresh, cancellation, reconnect, revocation, and error recovery.',
      'Complete native provider-owned login and consent verification without exposing project credentials.',
    ]),
  }),
});

function parseOfficialHttpsPage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || value.length > 8192) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseExactAuthorizationEndpoint(value: string | undefined): string | undefined {
  const normalized = parseOfficialHttpsPage(value);
  if (!normalized) return undefined;
  const url = new URL(normalized);
  return url.hash ? undefined : normalized;
}

function externalBlocker(input: PluginManifestDraft): PluginAuthorizationCapability {
  const providerAccessUrl = parseOfficialHttpsPage(input.credentialUrl ?? input.providerAccessUrl);
  return Object.freeze({
    kind: 'external_blocker',
    reason: `VibeSpace has no registered ${input.provider} application, exact redirect/callback handler, or trusted token exchange for this connector.`,
    ...(providerAccessUrl ? { providerAccessUrl } : {}),
    externalPrerequisites: Object.freeze([
      `Register a provider application for the exact ${input.name} connector.`,
      'Approve an exact redirect/callback and the declared least-privilege scopes.',
      'Add and verify a trusted token exchange, reconnect, cancellation, and revocation implementation.',
    ]),
  });
}

export function classifyPluginAuthorization(
  input: PluginManifestDraft,
): PluginAuthorizationCapability {
  const verified =
    VERIFIED_PROVIDER_AUTHORIZATION[input.id as keyof typeof VERIFIED_PROVIDER_AUTHORIZATION];
  if (verified) {
    const authorizationUrl = parseExactAuthorizationEndpoint(input.authorizationUrl);
    if (
      input.connectionStrategy !== verified.strategy ||
      authorizationUrl !== new URL(verified.authorizationUrl).toString()
    ) {
      return externalBlocker(input);
    }
    return Object.freeze({
      kind: 'provider_hosted_oauth',
      strategy: verified.strategy,
      authorizationUrl,
      manualFallback: verified.manualFallback,
      externalPrerequisites: verified.externalPrerequisites,
    });
  }

  const hostedOAuthBlocker = HOSTED_OAUTH_INTEGRATION_BLOCKERS[input.id];
  if (hostedOAuthBlocker) {
    const providerAccessUrl = parseOfficialHttpsPage(input.providerAccessUrl ?? input.docsUrl);
    return Object.freeze({
      kind: 'external_blocker',
      reason: hostedOAuthBlocker.reason,
      ...(providerAccessUrl ? { providerAccessUrl } : {}),
      externalPrerequisites: hostedOAuthBlocker.externalPrerequisites,
    });
  }

  if (input.authType === 'none' && input.fields.length === 0) {
    return Object.freeze({
      kind: 'no_auth',
      reason: 'This deterministic local connector does not contact an external provider.',
    });
  }

  const providerAccessUrl = parseOfficialHttpsPage(input.credentialUrl);
  const hasTrustedManualVerifier =
    Boolean(input.httpTest) || TRUSTED_MANUAL_RUNTIME_VERIFIERS.has(input.id);
  if (
    input.fields.length > 0 &&
    providerAccessUrl &&
    hasTrustedManualVerifier &&
    input.status !== 'blocked' &&
    input.status !== 'planned'
  ) {
    return Object.freeze({
      kind: 'manual_fallback',
      providerAccessUrl,
      verification: input.httpTest ? 'provider_probe' : 'trusted_runtime',
      externalPrerequisites: Object.freeze([...(MANUAL_OAUTH_PREREQUISITES[input.id] ?? [])]),
    });
  }

  return externalBlocker(input);
}

export function completePluginAuthorizationManifest(
  input: PluginManifestDraft,
): ClassifiedPluginManifest {
  const authorizationCapability = classifyPluginAuthorization(input);
  const providerAccessUrl =
    authorizationCapability.kind === 'provider_hosted_oauth'
      ? authorizationCapability.authorizationUrl
      : authorizationCapability.kind === 'manual_fallback'
        ? authorizationCapability.providerAccessUrl
        : authorizationCapability.kind === 'external_blocker'
          ? authorizationCapability.providerAccessUrl
          : undefined;
  return Object.freeze({
    ...input,
    providerAccessUrl,
    authorizationCapability,
  });
}

export function verifiedProviderAuthorizationUrl(
  capability: PluginAuthorizationCapability,
  candidate: string | undefined,
): string {
  if (capability.kind !== 'provider_hosted_oauth') {
    throw new Error('Provider-hosted authorization is not available for this connector.');
  }
  const normalized = parseExactAuthorizationEndpoint(candidate);
  const expected = new URL(capability.authorizationUrl).toString();
  if (!normalized || normalized !== expected) {
    throw new Error('Provider authorization returned an unverified authorization endpoint.');
  }
  return normalized;
}

export function isProviderHostedAuthorization(
  capability: PluginAuthorizationCapability,
): capability is Extract<PluginAuthorizationCapability, { kind: 'provider_hosted_oauth' }> {
  return capability.kind === 'provider_hosted_oauth';
}
