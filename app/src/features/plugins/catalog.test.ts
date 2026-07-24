import { describe, expect, it } from 'vitest';
import {
  PLUGIN_CATALOG,
  PLUGIN_CATALOG_TARGET,
  catalogStats,
  validatePluginCatalog,
} from './catalog';

describe('plugin catalog', () => {
  it('contains 112 schema-valid verified connectors', () => {
    expect(PLUGIN_CATALOG.length).toBe(PLUGIN_CATALOG_TARGET);
    expect(PLUGIN_CATALOG.length).toBe(112);
    expect(validatePluginCatalog()).toEqual([]);
    expect(new Set(PLUGIN_CATALOG.map((plugin) => plugin.id)).size).toBe(PLUGIN_CATALOG.length);
  });

  it('only labels connectors with declared runtime tools as implemented', () => {
    const implemented = PLUGIN_CATALOG.filter((plugin) => plugin.status === 'implemented');
    expect(implemented.map((plugin) => plugin.id)).toEqual(
      expect.arrayContaining([
        'github',
        'figma',
        'supabase',
        'shopify',
        'slack',
        'mock-connector',
        'gmail',
      ]),
    );
    expect(implemented.every((plugin) => plugin.tools.length > 0)).toBe(true);
  });

  it('publishes Gmail as a fixed implemented provider with narrow desktop OAuth credentials', () => {
    const gmail = PLUGIN_CATALOG.find((plugin) => plugin.id === 'gmail');

    expect(gmail).toMatchObject({
      id: 'gmail',
      provider: 'Google',
      authType: 'oauth',
      status: 'implemented',
      fields: [
        { id: 'client_id', secret: false, required: true },
        { id: 'refresh_token', secret: true, required: true },
      ],
      supportedFeatures: [
        'message search',
        'message and thread reading',
        'drafts',
        'approved send',
      ],
      tools: [
        { name: 'message_search', readOnly: true },
        { name: 'message_read', readOnly: true },
        { name: 'thread_read', readOnly: true },
        { name: 'draft_create', readOnly: false },
        { name: 'reply_draft_create', readOnly: false },
        { name: 'draft_send', readOnly: false },
      ],
    });
    expect(gmail?.limitations).toMatch(/restricted scopes|provider verification/i);
    expect(JSON.stringify(gmail)).not.toMatch(/client_secret/i);
  });

  it('excludes needs_credentials placeholders from the curated catalog', () => {
    expect(PLUGIN_CATALOG.every((plugin) => plugin.status !== 'needs_credentials')).toBe(true);
  });

  it('reports catalog coverage stats', () => {
    const stats = catalogStats();
    expect(stats).toEqual({
      total: 112,
      implemented: 7,
      configurable: 105,
      needsCredentials: 0,
      blocked: 0,
      withHttpTest: 87,
    });
  });
});
