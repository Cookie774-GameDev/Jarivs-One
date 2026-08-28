export type PluginStatus =
  | 'implemented'
  | 'configurable'
  | 'planned'
  | 'blocked'
  | 'needs_credentials';

export type PluginAuthType = 'token' | 'api_key' | 'oauth' | 'service_account' | 'none';
export type PluginConnectionStrategy =
  | 'native_oauth_pkce'
  | 'hosted_oauth'
  | 'device_authorization'
  | 'app_installation'
  | 'official_connector'
  | 'manual_credential';

export type PluginAuthorizationCapability =
  | Readonly<{
      kind: 'provider_hosted_oauth';
      strategy: Extract<
        PluginConnectionStrategy,
        'native_oauth_pkce' | 'hosted_oauth' | 'device_authorization' | 'app_installation'
      >;
      authorizationUrl: string;
      manualFallback: boolean;
      externalPrerequisites: readonly string[];
    }>
  | Readonly<{
      kind: 'manual_fallback';
      providerAccessUrl: string;
      verification: 'provider_probe' | 'trusted_runtime';
      externalPrerequisites: readonly string[];
    }>
  | Readonly<{
      kind: 'no_auth';
      reason: string;
    }>
  | Readonly<{
      kind: 'external_blocker';
      reason: string;
      providerAccessUrl?: string;
      externalPrerequisites: readonly string[];
    }>;

export type PluginField = {
  id: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help?: string;
};

export type PluginTool = {
  name: string;
  description: string;
  readOnly: boolean;
};

/** Safe HTTP probe used by the generic connection tester. */
export type PluginHttpTest = {
  url: string;
  method?: 'GET' | 'POST';
  /** Header values may use `{{fieldId}}` placeholders from saved credentials. */
  headers?: Record<string, string>;
  body?: string;
  /** Dot-path into JSON response for account label, e.g. `login` or `data.email`. */
  accountLabelPath?: string;
  /** When true, a 2xx response is enough (empty body allowed). */
  acceptEmpty?: boolean;
};

export type PluginManifest = {
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string;
  authType: PluginAuthType;
  /** Executable connection truth. Required by the curated catalog validator. */
  authorizationCapability?: PluginAuthorizationCapability;
  /** Explicit interactive connection route. Defaults conservatively from authType. */
  connectionStrategy?: PluginConnectionStrategy;
  fields: PluginField[];
  /** Exact provider permissions required by this connector's implemented operations. */
  requiredScopes?: string[];
  status: PluginStatus;
  docsUrl?: string;
  /** Official page to create API keys, OAuth apps, or tokens. */
  credentialUrl?: string;
  /** Provider authorization endpoint metadata. It is executable only for provider_hosted_oauth. */
  authorizationUrl?: string;
  /**
   * Exact official external page opened beside the in-app connection UI. Provider-hosted
   * authorization uses the verified authorization endpoint; manual and externally blocked
   * connectors use the signed-in provider account/configuration page.
   */
  providerAccessUrl?: string;
  help: string;
  tools: PluginTool[];
  tags: string[];
  setupSteps: string[];
  supportedFeatures: string[];
  limitations?: string;
  /** When set, the trusted account-scoped runtime uses this connection probe. */
  httpTest?: PluginHttpTest;
};

export type ClassifiedPluginManifest = PluginManifest & {
  authorizationCapability: PluginAuthorizationCapability;
};

export type PluginConnectionState =
  | 'connected'
  | 'not_connected'
  | 'needs_setup'
  | 'connecting'
  | 'awaiting_approval'
  | 'reauthorize'
  | 'expired'
  | 'error';

export type PluginConnection = {
  accountId: string;
  pluginId: string;
  state: PluginConnectionState;
  enabled: boolean;
  enabledProjectIds: string[];
  accountLabel?: string;
  lastTestedAt?: number;
  error?: string;
  configuredFields: string[];
  updatedAt: number;
};

export type PluginConnectionsByAccount = Readonly<
  Record<string, Readonly<Record<string, PluginConnection>>>
>;

export type PluginTestResult = {
  ok: boolean;
  accountLabel?: string;
  error?: string;
};

export function isConnectableStatus(status: PluginStatus): boolean {
  return status === 'implemented' || status === 'configurable' || status === 'needs_credentials';
}

export function supportsAutomatedTest(manifest: PluginManifest): boolean {
  return Boolean(manifest.httpTest) || manifest.status === 'implemented';
}
