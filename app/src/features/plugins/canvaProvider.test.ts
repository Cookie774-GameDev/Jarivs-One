import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvaArtifactDrafts, runCanvaTool, testCanvaConnection } from './canvaProvider';

afterEach(() => {
  vi.restoreAllMocks();
});

const credentials = {
  client_id: 'OC-vibespace-client-id',
  client_secret: 'cnvca-vibespace-client-secret',
  refresh_token: 'canva-refresh-token-before-rotation',
};

function tokenResponse(
  scope = 'profile:read design:meta:read design:content:write brandtemplate:meta:read brandtemplate:content:read',
) {
  return new Response(
    JSON.stringify({
      access_token: 'canva-access-token-must-never-be-returned',
      refresh_token: 'canva-refresh-token-after-rotation',
      token_type: 'Bearer',
      expires_in: 14_400,
      scope,
    }),
    { status: 200 },
  );
}

describe('Canva Connect provider', () => {
  it('rejects provider grants outside the exact connector scope allowlist', async () => {
    const rotateCredential = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse('profile:read user:email:write'));

    await expect(
      testCanvaConnection({
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential,
      }),
    ).rejects.toThrow(/scope_not_allowed/i);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(rotateCredential).not.toHaveBeenCalled();
  });

  it('rejects an incomplete declared scope grant before persisting its rotated credential', async () => {
    const rotateCredential = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      tokenResponse('profile:read design:meta:read design:content:write brandtemplate:meta:read'),
    );

    await expect(
      testCanvaConnection({
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential,
      }),
    ).rejects.toThrow(/required_scope_unavailable/i);
    expect(rotateCredential).not.toHaveBeenCalled();
  });

  it('rotates the one-use refresh token under caller authority before testing the fixed profile endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: { display_name: 'Canva Person' } }), {
          status: 200,
        }),
      );
    const rotateCredential = vi.fn().mockResolvedValue(undefined);

    await expect(
      testCanvaConnection({
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential,
      }),
    ).resolves.toEqual({ ok: true, accountLabel: 'Canva Person' });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.canva.com/rest/v1/oauth/token');
    expect(fetchSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.any(URLSearchParams),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toBe(
      'grant_type=refresh_token&refresh_token=canva-refresh-token-before-rotation',
    );
    expect(rotateCredential).toHaveBeenCalledWith({
      operation: 'rotate',
      fieldId: 'refresh_token',
      expectedValue: 'canva-refresh-token-before-rotation',
      nextValue: 'canva-refresh-token-after-rotation',
    });
    expect(rotateCredential.mock.invocationCallOrder[0]).toBeLessThan(
      fetchSpy.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.canva.com/rest/v1/users/me/profile');
  });

  it('rotates before introspecting an access token when the optional token-response scope is absent', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'canva-access-token-must-never-be-returned',
            refresh_token: 'canva-refresh-token-after-rotation',
            token_type: 'Bearer',
            expires_in: 14_400,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            active: true,
            client: 'OC-vibespace-client-id',
            scope:
              'profile:read design:meta:read design:content:write brandtemplate:meta:read brandtemplate:content:read',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: { display_name: 'Canva Person' } }), {
          status: 200,
        }),
      );
    const rotateCredential = vi.fn().mockResolvedValue(undefined);

    await expect(
      testCanvaConnection({
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential,
      }),
    ).resolves.toEqual({ ok: true, accountLabel: 'Canva Person' });

    expect(rotateCredential.mock.invocationCallOrder[0]).toBeLessThan(
      fetchSpy.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.canva.com/rest/v1/oauth/introspect');
    expect(fetchSpy.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.any(URLSearchParams),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(String(fetchSpy.mock.calls[1]?.[1]?.body)).toBe(
      'token=canva-access-token-must-never-be-returned',
    );
    expect(fetchSpy.mock.calls[2]?.[0]).toBe('https://api.canva.com/rest/v1/users/me/profile');
  });

  it.each([
    ['inactive token', { active: false, scope: 'profile:read' }],
    [
      'wrong client',
      {
        active: true,
        client: 'OC-different-client',
        scope: 'profile:read',
      },
    ],
  ])('fails closed after rotation for an introspected %s', async (_caseName, introspection) => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'canva-access-token-must-never-be-returned',
            refresh_token: 'canva-refresh-token-after-rotation',
            token_type: 'Bearer',
            expires_in: 14_400,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(introspection), { status: 200 }));
    const rotateCredential = vi.fn().mockResolvedValue(undefined);

    await expect(
      testCanvaConnection({
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential,
      }),
    ).rejects.toThrow(/token_introspection_invalid/i);

    expect(rotateCredential).toHaveBeenCalledTimes(2);
    expect(rotateCredential).toHaveBeenLastCalledWith({
      operation: 'invalidate',
      fieldId: 'refresh_token',
      expectedValue: 'canva-refresh-token-after-rotation',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('searches bounded design metadata and returns only validated Canva edit/view links', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'DAFVztcvd9z',
                title: 'Launch plan',
                urls: {
                  edit_url: 'https://www.canva.com/api/design/design-token-123/edit',
                  view_url: 'https://www.canva.com/api/design/design-token-456/view',
                },
                created_at: 1_786_300_000,
                updated_at: 1_786_300_400,
                design_types: ['presentation'],
                page_count: 7,
                owner: { user_id: 'private-user', team_id: 'private-team' },
                thumbnail: { url: 'https://attacker.invalid/thumbnail' },
              },
            ],
            continuation: 'provider-continuation-must-not-leak',
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'designs_search',
      params: { query: "launch's plan", maxResults: 1 },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      ok: true,
      summary: '1 Canva design examined; 1 selected result returned.',
      data: {
        contentTrust: 'external_untrusted',
        designsExamined: 1,
        designsSelected: 1,
        hasMore: true,
        designs: [
          {
            id: 'DAFVztcvd9z',
            untrustedTitle: 'Launch plan',
            designTypes: ['presentation'],
            pageCount: 7,
            createdAt: '2026-08-09T18:26:40.000Z',
            updatedAt: '2026-08-09T18:33:20.000Z',
            editUrl: 'https://www.canva.com/api/design/design-token-123/edit',
            viewUrl: 'https://www.canva.com/api/design/design-token-456/view',
          },
        ],
      },
    });
    const searchUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe(
      'https://api.canva.com/rest/v1/designs',
    );
    expect(searchUrl.searchParams.get('query')).toBe("launch's plan");
    expect(searchUrl.searchParams.get('limit')).toBe('1');
    expect(searchUrl.searchParams.get('ownership')).toBe('any');
    expect(searchUrl.searchParams.get('sort_by')).toBe('relevance');
    expect(JSON.stringify(result)).not.toMatch(
      /private-user|private-team|attacker\.invalid|provider-continuation|access-token|refresh-token/i,
    );
  });

  it('keeps untitled designs and bounded current or future provider design types usable', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'DAUntitled01',
                urls: {
                  edit_url: 'https://www.canva.com/api/design/untitled-token/edit',
                  view_url: 'https://www.canva.com/api/design/untitled-token/view',
                },
                design_types: ['unknown', 'future_canvas'],
              },
            ],
          }),
          { status: 200 },
        ),
      );

    await expect(
      runCanvaTool({
        toolName: 'designs_search',
        params: { query: 'untitled', maxResults: 1 },
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toEqual({
      ok: true,
      summary: '1 Canva design examined; 1 selected result returned.',
      data: {
        contentTrust: 'external_untrusted',
        designsExamined: 1,
        designsSelected: 1,
        hasMore: false,
        designs: [
          {
            id: 'DAUntitled01',
            untrustedTitle: 'Untitled Canva design',
            designTypes: ['unknown', 'future_canvas'],
            editUrl: 'https://www.canva.com/api/design/untitled-token/edit',
            viewUrl: 'https://www.canva.com/api/design/untitled-token/view',
          },
        ],
      },
    });
  });

  it('reads one exact selected design and ignores provider-owned private metadata', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            design: {
              id: 'DAFVztcvd9z',
              title: 'Selected design',
              urls: {
                edit_url: 'https://www.canva.com/api/design/design-token-123/edit',
                view_url: 'https://www.canva.com/api/design/design-token-123/view',
              },
              created_at: 1_786_300_000,
              updated_at: 1_786_300_400,
              design_types: ['doc'],
              page_count: 2,
              owner: { user_id: 'private-owner' },
            },
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'design_read',
      params: { designId: 'DAFVztcvd9z' },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      ok: true,
      summary: 'Canva design DAFVztcvd9z retrieved.',
      data: {
        contentTrust: 'external_untrusted',
        id: 'DAFVztcvd9z',
        untrustedTitle: 'Selected design',
        designTypes: ['doc'],
        pageCount: 2,
        createdAt: '2026-08-09T18:26:40.000Z',
        updatedAt: '2026-08-09T18:33:20.000Z',
        editUrl: 'https://www.canva.com/api/design/design-token-123/edit',
        viewUrl: 'https://www.canva.com/api/design/design-token-123/view',
      },
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.canva.com/rest/v1/designs/DAFVztcvd9z');
    expect(JSON.stringify(result)).not.toMatch(/private-owner|access-token|refresh-token/i);
  });

  it('searches bounded brand-template metadata only when its optional scope is present', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'DAFBrandTemplate123',
                title: 'Launch template',
                created_at: 1_786_300_000,
                updated_at: 1_786_300_400,
                thumbnail: { url: 'https://attacker.invalid/private-thumbnail' },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'brand_templates_search',
      params: { query: 'launch', maxResults: 1 },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      ok: true,
      summary: '1 Canva brand template examined; 1 selected result returned.',
      data: {
        contentTrust: 'external_untrusted',
        templatesExamined: 1,
        templatesSelected: 1,
        hasMore: false,
        templates: [
          {
            id: 'DAFBrandTemplate123',
            untrustedTitle: 'Launch template',
            createdAt: '2026-08-09T18:26:40.000Z',
            updatedAt: '2026-08-09T18:33:20.000Z',
          },
        ],
      },
    });
    const searchUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe(
      'https://api.canva.com/rest/v1/brand-templates',
    );
    expect(searchUrl.searchParams.get('query')).toBe('launch');
    expect(searchUrl.searchParams.get('limit')).toBe('1');
    expect(JSON.stringify(result)).not.toMatch(/attacker\.invalid|access-token|refresh-token/i);
  });

  it('reads a bounded brand-template dataset and marks only stable text fields as supported', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        tokenResponse(
          'profile:read design:meta:read design:content:write brandtemplate:meta:read brandtemplate:content:read',
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dataset: {
              launch_headline: { type: 'text' },
              launch_image: { type: 'image' },
              launch_chart: { type: 'chart' },
            },
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'brand_template_dataset_read',
      params: { brandTemplateId: 'DAFBrandTemplate123' },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      ok: true,
      summary: 'Canva brand template dataset retrieved; 1 stable text field supported.',
      data: {
        contentTrust: 'external_untrusted',
        brandTemplateId: 'DAFBrandTemplate123',
        fields: [
          { untrustedName: 'launch_chart', type: 'chart', supportedForGeneration: false },
          { untrustedName: 'launch_headline', type: 'text', supportedForGeneration: true },
          { untrustedName: 'launch_image', type: 'image', supportedForGeneration: false },
        ],
        supportedTextFields: 1,
      },
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://api.canva.com/rest/v1/brand-templates/DAFBrandTemplate123/dataset',
    );
  });

  it('creates a structured text autofill job and returns its completed design without trial metadata', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job: {
              id: '450a76e7-f96f-43ae-9c37-0e1ce492ac72',
              status: 'success',
              result: {
                type: 'create_design',
                design: {
                  id: 'DAFVautofilled123',
                  title: 'Approved launch campaign',
                  urls: {
                    edit_url: 'https://www.canva.com/api/design/ekimus8HTvsdf&/edit',
                    view_url: 'https://www.canva.com/api/design/eylPinTv358hYb8n1U4/view',
                  },
                  created_at: 1_786_300_000,
                  updated_at: 1_786_300_000,
                },
                trial_information: {
                  uses_remaining: 2,
                  upgrade_url: 'https://attacker.invalid/upgrade',
                },
              },
            },
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'design_autofill',
      params: {
        brandTemplateId: 'DAFBrandTemplate123',
        title: 'Approved launch campaign',
        textDataJson: '{"launch_headline":"Ship today","launch_subtitle":"Built with care"}',
      },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({
      ok: true,
      summary: 'Canva structured design created.',
      data: {
        id: 'DAFVautofilled123',
        untrustedTitle: 'Approved launch campaign',
        editUrl: 'https://www.canva.com/api/design/ekimus8HTvsdf&/edit',
        viewUrl: 'https://www.canva.com/api/design/eylPinTv358hYb8n1U4/view',
        jobId: '450a76e7-f96f-43ae-9c37-0e1ce492ac72',
        created: true,
        structuredContextApplied: true,
      },
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.canva.com/rest/v1/autofills');
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        type: 'create_from_brand_template',
        brand_template_id: 'DAFBrandTemplate123',
        title: 'Approved launch campaign',
        data: {
          launch_headline: { type: 'text', text: 'Ship today' },
          launch_subtitle: { type: 'text', text: 'Built with care' },
        },
      }),
    });
    expect(JSON.stringify(result)).not.toMatch(/uses_remaining|attacker\.invalid|Ship today/i);
    if (!result.ok) throw new Error('expected completed Canva Autofill result');
    expect(
      canvaArtifactDrafts({
        evidence: Object.freeze({
          producerId: 'plugin_result' as const,
          accountId: 'account-canva',
          runId: 'run-canva-autofill',
          requestId: 'request-canva-autofill',
          attemptNumber: 1,
          resultRef: 'jresult_canva_autofill',
          state: 'succeeded' as const,
          verifiedAt: 1_786_300_400_000,
          pluginId: 'canva',
          invocationId: 'approval:approval-canva-autofill',
        }),
        registration: { pluginId: 'canva', toolName: 'design_autofill' },
        result,
      }),
    ).toMatchObject([
      {
        artifact: {
          kind: 'provider_result',
          title: 'Canva design: Approved launch campaign',
          safeSummary: 'Created structured Canva design; open Canva for current state.',
        },
      },
      { artifact: { kind: 'link', title: 'Edit Canva design' } },
      { artifact: { kind: 'link', title: 'View Canva design' } },
    ]);
  });

  it('returns a bounded pending autofill handle and can later read the completed job', async () => {
    const jobId = '450a76e7-f96f-43ae-9c37-0e1ce492ac72';
    const pendingFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job: { id: jobId, status: 'in_progress' } }), {
          status: 200,
        }),
      );
    const pendingResult = await runCanvaTool({
      toolName: 'design_autofill',
      params: {
        brandTemplateId: 'DAFBrandTemplate123',
        title: 'Approved launch campaign',
        textDataJson: '{"launch_headline":"Ship today"}',
      },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });
    expect(pendingResult).toEqual({
      ok: true,
      summary: 'Canva accepted the structured design job; processing continues.',
      data: {
        jobId,
        status: 'in_progress',
        created: false,
        structuredContextApplied: true,
      },
    });
    if (!pendingResult.ok) throw new Error('expected pending Canva Autofill result');
    expect(
      canvaArtifactDrafts({
        evidence: Object.freeze({
          producerId: 'plugin_result' as const,
          accountId: 'account-canva',
          runId: 'run-canva-autofill',
          requestId: 'request-canva-autofill',
          attemptNumber: 1,
          resultRef: 'jresult_canva_autofill_pending',
          state: 'succeeded' as const,
          verifiedAt: 1_786_300_400_000,
          pluginId: 'canva',
          invocationId: 'approval:approval-canva-autofill',
        }),
        registration: { pluginId: 'canva', toolName: 'design_autofill' },
        result: pendingResult,
      }),
    ).toMatchObject([
      {
        artifact: {
          kind: 'provider_result',
          title: 'Canva structured design job',
          safeSummary: 'Canva accepted the structured design job; processing continues.',
        },
      },
    ]);
    expect(pendingFetch).toHaveBeenCalledTimes(2);

    pendingFetch.mockRestore();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job: {
              id: jobId,
              status: 'success',
              result: {
                type: 'create_design',
                design: {
                  id: 'DAFVautofilled123',
                  title: 'Approved launch campaign',
                  urls: {
                    edit_url: 'https://www.canva.com/api/design/completed-job-token/edit',
                    view_url: 'https://www.canva.com/api/design/completed-job-token/view',
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      );
    await expect(
      runCanvaTool({
        toolName: 'autofill_job_read',
        params: { jobId },
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toMatchObject({
      ok: true,
      summary: 'Canva structured design job completed.',
      data: {
        id: 'DAFVautofilled123',
        jobId,
        status: 'success',
        created: true,
        structuredContextApplied: true,
      },
    });
  });

  it('creates one stable preset design only through the approval-bound tool and returns real Canva links', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            design: {
              id: 'DAFVcreated123',
              title: 'Approved launch deck',
              urls: {
                edit_url: 'https://www.canva.com/api/design/created-token/edit',
                view_url: 'https://www.canva.com/api/design/created-token/view',
              },
              created_at: 1_786_300_000,
              updated_at: 1_786_300_000,
              design_types: ['presentation'],
              page_count: 1,
            },
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'design_create',
      params: { title: 'Approved launch deck', preset: 'presentation' },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });
    expect(result).toMatchObject({
      ok: true,
      summary: 'Canva design created.',
      data: {
        id: 'DAFVcreated123',
        untrustedTitle: 'Approved launch deck',
        editUrl: 'https://www.canva.com/api/design/created-token/edit',
        viewUrl: 'https://www.canva.com/api/design/created-token/view',
        created: true,
      },
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://api.canva.com/rest/v1/designs');
    expect(fetchSpy.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer canva-access-token-must-never-be-returned',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          type: 'type_and_asset',
          design_type: { type: 'preset', name: 'presentation' },
          title: 'Approved launch deck',
        }),
      }),
    );
    if (!result.ok) throw new Error('expected created Canva result');
    expect(
      canvaArtifactDrafts({
        evidence: Object.freeze({
          producerId: 'plugin_result' as const,
          accountId: 'account-canva',
          runId: 'run-canva',
          requestId: 'request-canva',
          attemptNumber: 1,
          resultRef: 'jresult_canva_create',
          state: 'succeeded' as const,
          verifiedAt: 1_786_300_400_000,
          pluginId: 'canva',
          invocationId: 'approval:approval-canva',
        }),
        registration: { pluginId: 'canva', toolName: 'design_create' },
        result,
      }),
    ).toEqual([
      expect.objectContaining({
        artifact: expect.objectContaining({
          kind: 'provider_result',
          title: 'Canva design: Approved launch deck',
          safeSummary: 'Created Canva design; open Canva for current state.',
        }),
        backing: expect.objectContaining({
          kind: 'producer_result',
          content: expect.stringContaining('"id":"DAFVcreated123"'),
        }),
      }),
      expect.objectContaining({
        artifact: expect.objectContaining({ kind: 'link', title: 'Edit Canva design' }),
        backing: {
          kind: 'uri',
          uri: 'https://www.canva.com/api/design/created-token/edit',
        },
      }),
      expect.objectContaining({
        artifact: expect.objectContaining({ kind: 'link', title: 'View Canva design' }),
        backing: {
          kind: 'uri',
          uri: 'https://www.canva.com/api/design/created-token/view',
        },
      }),
    ]);
  });

  it('preserves exact approved create identity while redacting secret-shaped display text', async () => {
    const approvedTitle = 'Approved  sk-abcdefghijklmnopqrst';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            design: {
              id: 'DAFVsecretTitle123',
              title: approvedTitle,
              urls: {
                edit_url: 'https://www.canva.com/api/design/secret-title-token/edit',
                view_url: 'https://www.canva.com/api/design/secret-title-token/view',
              },
              design_types: ['doc'],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await runCanvaTool({
      toolName: 'design_create',
      params: { title: approvedTitle, preset: 'doc' },
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        untrustedTitle: 'Approved [redacted secret]',
        created: true,
      },
    });
    expect(String(fetchSpy.mock.calls[1]?.[1]?.body)).toContain(JSON.stringify(approvedTitle));
    expect(JSON.stringify(result)).not.toContain('sk-abcdefghijklmnopqrst');
  });

  it('fails closed before token exchange for unknown tools, extra fields, and invalid exact IDs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const base = {
      values: credentials,
      signal: new AbortController().signal,
      rotateCredential: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      runCanvaTool({
        ...base,
        toolName: 'designs_search',
        params: { query: 'launch', maxResults: 2, continuation: 'provider-owned' },
      }),
    ).rejects.toThrow(/unknown_fields/i);
    await expect(
      runCanvaTool({
        ...base,
        toolName: 'design_read',
        params: { designId: '../private' },
      }),
    ).rejects.toThrow(/provider_response_invalid/i);
    await expect(
      runCanvaTool({
        ...base,
        toolName: 'design_delete',
        params: { designId: 'DAFVztcvd9z' },
      }),
    ).rejects.toThrow(/tool_unavailable/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rotates a granted token but rejects missing scopes and unsafe provider links before disclosure', async () => {
    const rotateCredential = vi.fn().mockResolvedValue(undefined);
    const scopeFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse('profile:read'));
    await expect(
      runCanvaTool({
        toolName: 'designs_search',
        params: { query: 'launch', maxResults: 2 },
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential,
      }),
    ).rejects.toThrow(/required_scope_unavailable/i);
    expect(rotateCredential).not.toHaveBeenCalled();
    expect(scopeFetch).toHaveBeenCalledOnce();

    scopeFetch.mockRestore();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            design: {
              id: 'DAFVztcvd9z',
              title: 'Unsafe link design',
              urls: {
                edit_url: 'https://attacker.invalid/api/private/edit',
                view_url: 'https://www.canva.com/api/private/view',
              },
              design_types: ['presentation'],
            },
          }),
          { status: 200 },
        ),
      );
    await expect(
      runCanvaTool({
        toolName: 'design_read',
        params: { designId: 'DAFVztcvd9z' },
        values: credentials,
        signal: new AbortController().signal,
        rotateCredential: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(/provider_response_invalid/i);
  });
});
