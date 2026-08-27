import { describe, expect, it } from 'vitest';
import { buildCatalogEntry } from './providerRegistry';

describe('provider access pages', () => {
  it.each([
    ['Stripe', 'Payments', 'https://dashboard.stripe.com/apikeys'],
    ['Cloudflare', 'Cloud & Hosting', 'https://dash.cloudflare.com/profile/api-tokens'],
  ])('publishes the official %s account page', (name, category, expectedUrl) => {
    expect(buildCatalogEntry(name, category).providerAccessUrl).toBe(expectedUrl);
  });

  it('uses an OAuth consent endpoint, never a credential console, for OAuth entries', () => {
    const gmail = buildCatalogEntry('Gmail', 'Google Workspace');
    expect(gmail.providerAccessUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(gmail.providerAccessUrl).toBe(gmail.authorizationUrl);
    expect(gmail.providerAccessUrl).not.toBe(gmail.credentialUrl);
  });
});
