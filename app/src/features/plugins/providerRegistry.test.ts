import { describe, expect, it } from 'vitest';
import { buildCatalogEntry } from './providerRegistry';

describe('provider access pages', () => {
  it.each([
    ['Stripe', 'Payments', 'https://dashboard.stripe.com/apikeys'],
    ['Cloudflare', 'Cloud & Hosting', 'https://dash.cloudflare.com/profile/api-tokens'],
  ])('publishes the official %s account page', (name, category, expectedUrl) => {
    expect(buildCatalogEntry(name, category).providerAccessUrl).toBe(expectedUrl);
  });

  it('uses the provider configuration console for a supported bring-your-own OAuth grant', () => {
    const gmail = buildCatalogEntry('Gmail', 'Google Workspace');
    expect(gmail.authorizationCapability).toMatchObject({
      kind: 'manual_fallback',
      providerAccessUrl: 'https://console.cloud.google.com/apis/credentials',
      verification: 'trusted_runtime',
    });
    expect(gmail.providerAccessUrl).toBe('https://console.cloud.google.com/apis/credentials');
    expect(gmail.providerAccessUrl).toBe(gmail.credentialUrl);
    expect(gmail.providerAccessUrl).not.toBe(gmail.authorizationUrl);
  });

  it.each([
    ['Google Calendar', 'Google Workspace'],
    ['Outlook', 'Microsoft 365'],
  ])('blocks unregistered %s OAuth instead of inventing a callback', (name, category) => {
    const plugin = buildCatalogEntry(name, category);
    expect(plugin.status).toBe('configurable');
    expect(plugin.authorizationCapability).toMatchObject({
      kind: 'external_blocker',
    });
    if (plugin.authorizationCapability.kind !== 'external_blocker') {
      throw new Error('Expected an external authorization blocker.');
    }
    expect(plugin.authorizationCapability.reason).toMatch(
      /registered provider application|callback|token exchange/i,
    );
    expect(plugin.authorizationCapability.externalPrerequisites).not.toEqual([]);
    expect(plugin.authorizationUrl).toBeUndefined();
  });
});
