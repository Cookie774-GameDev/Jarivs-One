import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleDriveArtifactDrafts,
  runGoogleDriveTool,
  testGoogleDriveConnection,
} from './googleDriveProvider';

afterEach(() => {
  vi.restoreAllMocks();
});

const credentials = {
  client_id: 'desktop-client.apps.googleusercontent.com',
  refresh_token: 'drive-refresh-value-that-must-never-be-returned',
};

function tokenResponse() {
  return new Response(
    JSON.stringify({
      access_token: 'drive-access-value-that-must-never-be-returned',
      expires_in: 3_600,
      scope:
        'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
      token_type: 'Bearer',
    }),
    { status: 200 },
  );
}

function fileMetadata(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    id: 'drive-file-123',
    name: 'Project plan',
    mimeType: 'application/vnd.google-apps.document',
    modifiedTime: '2026-07-24T14:30:00.000Z',
    size: '120',
    capabilities: { canDownload: true },
    ...overrides,
  };
}

describe('Google Drive provider', () => {
  it('refreshes a Desktop OAuth grant in memory and verifies the Drive account without returning tokens', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              displayName: 'Drive Person',
              emailAddress: 'person@example.com',
              permissionId: 'provider-private-id',
            },
            storageQuota: { usage: '100', limit: '1000' },
          }),
          { status: 200 },
        ),
      );

    await expect(
      testGoogleDriveConnection({
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ ok: true, accountLabel: 'person@example.com' });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
        signal: expect.any(AbortSignal),
      }),
    );
    const tokenBody = String(fetchSpy.mock.calls[0]?.[1]?.body);
    expect(tokenBody).toContain('client_id=desktop-client.apps.googleusercontent.com');
    expect(tokenBody).toContain('refresh_token=drive-refresh-value-that-must-never-be-returned');
    expect(tokenBody).toContain(
      'scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file',
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/drive/v3/about?fields=user%28displayName%2CemailAddress%29',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer drive-access-value-that-must-never-be-returned',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('searches a fixed escaped query and returns bounded metadata with only locally derived links', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: [
              fileMetadata({
                id: 'drive-doc-123',
                name: 'Project plan',
                webViewLink: 'https://attacker.invalid/provider-url',
              }),
              fileMetadata({
                id: 'drive-text-456',
                name: 'Notes',
                mimeType: 'text/plain',
                size: '55',
              }),
            ],
            incompleteSearch: false,
            nextPageToken: 'provider-page-token-must-not-leak',
          }),
          { status: 200 },
        ),
      );

    const result = await runGoogleDriveTool({
      toolName: 'files_search',
      params: { term: "project's plan", maxResults: 2 },
      values: credentials,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      ok: true,
      summary: '2 Google Drive files examined; 2 selected results returned.',
      data: {
        contentTrust: 'external_untrusted',
        filesExamined: 2,
        filesSelected: 2,
        incompleteSearch: false,
        files: [
          {
            id: 'drive-doc-123',
            untrustedName: 'Project plan',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-07-24T14:30:00.000Z',
            sizeBytes: 120,
            sourceUrl: 'https://docs.google.com/document/d/drive-doc-123/edit',
          },
          {
            id: 'drive-text-456',
            untrustedName: 'Notes',
            mimeType: 'text/plain',
            modifiedTime: '2026-07-24T14:30:00.000Z',
            sizeBytes: 55,
            sourceUrl: 'https://drive.google.com/file/d/drive-text-456/view',
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /attacker\.invalid|provider-page-token|access-value|refresh-value/i,
    );
    const searchUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe(
      'https://www.googleapis.com/drive/v3/files',
    );
    expect(searchUrl.searchParams.get('q')).toBe(
      "trashed = false and (name contains 'project\\'s plan' or fullText contains 'project\\'s plan')",
    );
    expect(searchUrl.searchParams.get('pageSize')).toBe('2');
    expect(searchUrl.searchParams.get('spaces')).toBe('drive');
    expect(searchUrl.searchParams.get('orderBy')).toBe('modifiedTime desc,name');
    expect(searchUrl.searchParams.get('fields')).toBe(
      'files(id,name,mimeType,modifiedTime,size,capabilities(canDownload)),incompleteSearch',
    );
  });

  it('sanitizes and truncates unusual provider filenames without aborting an ordinary search', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: [
              fileMetadata({
                id: 'drive-unusual-name-123',
                name: `  ${'X'.repeat(260)}\u0007  `,
              }),
            ],
            incompleteSearch: false,
          }),
          { status: 200 },
        ),
      );

    await expect(
      runGoogleDriveTool({
        toolName: 'files_search',
        params: { term: 'unusual', maxResults: 1 },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        files: [
          {
            id: 'drive-unusual-name-123',
            untrustedName: 'X'.repeat(240),
          },
        ],
      },
    });
  });

  it('reads only an exact downloadable supported document as bounded redacted external context', async () => {
    const providerSecret = 'sk-exampleDriveSecretValue1234567890';
    const longBody = `Selected document body with ${providerSecret}. ${'x'.repeat(45_000)}`;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            fileMetadata({
              id: 'drive-doc-123',
              name: 'Selected project plan',
              webContentLink: 'https://attacker.invalid/not-trusted',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(longBody, { status: 200 }));

    const result = await runGoogleDriveTool({
      toolName: 'document_read',
      params: { fileId: 'drive-doc-123' },
      values: credentials,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      ok: true,
      summary: 'Google Drive document drive-doc-123 retrieved.',
      data: {
        contentTrust: 'external_untrusted',
        id: 'drive-doc-123',
        untrustedName: 'Selected project plan',
        mimeType: 'application/vnd.google-apps.document',
        sourceUrl: 'https://docs.google.com/document/d/drive-doc-123/edit',
        untrustedBodyExcerpt: expect.stringContaining('[redacted secret]'),
        bodyTruncated: true,
        remoteContentLoaded: false,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /exampleDriveSecretValue|attacker\.invalid|access-value|refresh-value/i,
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://www.googleapis.com/drive/v3/files/drive-doc-123?fields=id%2Cname%2CmimeType%2CmodifiedTime%2Csize%2Ccapabilities%28canDownload%29',
    );
    expect(fetchSpy.mock.calls[2]?.[0]).toBe(
      'https://www.googleapis.com/drive/v3/files/drive-doc-123/export?mimeType=text%2Fplain',
    );
  });

  it('reads supported text blobs through alt=media but rejects denied and unsupported content before download', async () => {
    const textFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            fileMetadata({
              id: 'drive-text-456',
              name: 'Notes.txt',
              mimeType: 'text/plain',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('Selected notes.', { status: 200 }));

    await expect(
      runGoogleDriveTool({
        toolName: 'document_read',
        params: { fileId: 'drive-text-456' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: 'drive-text-456',
        untrustedBodyExcerpt: 'Selected notes.',
        sourceUrl: 'https://drive.google.com/file/d/drive-text-456/view',
      },
    });
    expect(textFetch.mock.calls[2]?.[0]).toBe(
      'https://www.googleapis.com/drive/v3/files/drive-text-456?alt=media',
    );

    vi.restoreAllMocks();
    const deniedFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            fileMetadata({
              id: 'drive-denied-123',
              capabilities: { canDownload: false },
            }),
          ),
          { status: 200 },
        ),
      );
    await expect(
      runGoogleDriveTool({
        toolName: 'document_read',
        params: { fileId: 'drive-denied-123' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/download_not_permitted/i);
    expect(deniedFetch).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
    const unsupportedFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            fileMetadata({
              id: 'drive-pdf-123',
              mimeType: 'application/pdf',
            }),
          ),
          { status: 200 },
        ),
      );
    await expect(
      runGoogleDriveTool({
        toolName: 'document_read',
        params: { fileId: 'drive-pdf-123' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/document_type_unsupported/i);
    expect(unsupportedFetch).toHaveBeenCalledTimes(2);
  });

  it('creates one bounded Google Doc through multipart upload and emits canonical created-document artifacts', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [], incompleteSearch: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            fileMetadata({
              id: 'created-drive-doc-123',
              name: 'Approved project brief',
              size: undefined,
              webViewLink: 'https://attacker.invalid/provider-url',
            }),
          ),
          { status: 200 },
        ),
      );

    const result = await runGoogleDriveTool({
      toolName: 'document_create',
      params: {
        title: 'Approved project brief',
        content: 'The approved document body.',
      },
      values: credentials,
      signal: new AbortController().signal,
      idempotencyKey: 'approval-bound-drive-create-1',
    });

    expect(result).toEqual({
      ok: true,
      summary: 'Google Drive document created.',
      data: {
        id: 'created-drive-doc-123',
        untrustedName: 'Approved project brief',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-07-24T14:30:00.000Z',
        sourceUrl: 'https://docs.google.com/document/d/created-drive-doc-123/edit',
        created: true,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /The approved document body|attacker\.invalid|access-value|refresh-value/i,
    );
    expect(fetchSpy.mock.calls[2]?.[0]).toBe(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CmimeType%2CmodifiedTime%2Csize%2Ccapabilities%28canDownload%29',
    );
    const idempotencyUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]));
    expect(`${idempotencyUrl.origin}${idempotencyUrl.pathname}`).toBe(
      'https://www.googleapis.com/drive/v3/files',
    );
    expect(idempotencyUrl.searchParams.get('q')).toMatch(
      /^trashed = false and appProperties has \{ key='vibespace_request_sha256' and value='[0-9a-f]{64}' \}$/,
    );
    expect(idempotencyUrl.searchParams.get('fields')).toBe(
      'files(id,name,mimeType,modifiedTime,size,capabilities(canDownload)),incompleteSearch,nextPageToken',
    );
    const createInit = fetchSpy.mock.calls[2]?.[1];
    expect(createInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(String((createInit?.headers as Record<string, string>)?.['Content-Type'])).toMatch(
      /^multipart\/related; boundary=vibespace_drive_[0-9a-f]{32}$/,
    );
    const multipartBody = String(createInit?.body);
    expect(multipartBody).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(multipartBody).toContain('"name":"Approved project brief"');
    expect(multipartBody).toMatch(/"vibespace_request_sha256":"[0-9a-f]{64}"/);
    expect(multipartBody).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(multipartBody).toContain('The approved document body.');
    expect(multipartBody).not.toMatch(/access-value|refresh-value/i);

    if (!result.ok) throw new Error('expected created document result');
    const evidence = Object.freeze({
      producerId: 'plugin_result' as const,
      accountId: 'account-drive',
      runId: 'run-drive',
      requestId: 'request-drive',
      attemptNumber: 1,
      resultRef: 'jresult_drive_create',
      state: 'succeeded' as const,
      verifiedAt: 1_786_300_400_000,
      pluginId: 'google-drive',
      invocationId: 'approval:approval-drive',
    });
    expect(
      googleDriveArtifactDrafts({
        evidence,
        registration: { pluginId: 'google-drive', toolName: 'document_create' },
        result,
      }),
    ).toEqual([
      expect.objectContaining({
        artifact: expect.objectContaining({
          kind: 'provider_result',
          title: 'Google Drive document: Approved project brief',
          safeSummary: 'Created Google Drive document; open Drive for current state.',
        }),
        backing: expect.objectContaining({
          kind: 'producer_result',
          content: expect.stringContaining('"id":"created-drive-doc-123"'),
        }),
      }),
      expect.objectContaining({
        artifact: expect.objectContaining({
          kind: 'link',
          title: 'Open Google Drive document',
        }),
        backing: {
          kind: 'uri',
          uri: 'https://docs.google.com/document/d/created-drive-doc-123/edit',
        },
      }),
    ]);
  });

  it('preserves an approved repeated-space title for create identity while returning a sanitized display name', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [], incompleteSearch: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            fileMetadata({
              id: 'created-spaced-drive-doc-123',
              name: 'Approved  project brief',
              size: undefined,
            }),
          ),
          { status: 200 },
        ),
      );

    await expect(
      runGoogleDriveTool({
        toolName: 'document_create',
        params: {
          title: 'Approved  project brief',
          content: 'The approved document body.',
        },
        values: credentials,
        signal: new AbortController().signal,
        idempotencyKey: 'approval-bound-drive-spaced-title',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: 'created-spaced-drive-doc-123',
        untrustedName: 'Approved project brief',
        created: true,
      },
    });
  });

  it('recovers an ambiguously accepted creation by its approval-bound idempotency marker without uploading twice', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [], incompleteSearch: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: [
              fileMetadata({
                id: 'recovered-drive-doc-123',
                name: 'Approved retry brief',
                size: undefined,
              }),
            ],
            incompleteSearch: false,
          }),
          { status: 200 },
        ),
      );
    const input = {
      toolName: 'document_create',
      params: {
        title: 'Approved retry brief',
        content: 'Create this document once.',
      },
      values: credentials,
      signal: new AbortController().signal,
      idempotencyKey: 'same-approval-bound-drive-create',
    } as const;

    await expect(runGoogleDriveTool(input)).rejects.toThrow(/provider_rejected_504/i);
    await expect(runGoogleDriveTool(input)).resolves.toMatchObject({
      ok: true,
      data: {
        id: 'recovered-drive-doc-123',
        created: true,
        idempotentlyRecovered: true,
      },
    });
    expect(
      fetchSpy.mock.calls.filter(([url]) =>
        String(url).startsWith('https://www.googleapis.com/upload/drive/v3/files'),
      ),
    ).toHaveLength(1);
  });

  it('uses the exact approved title for idempotent recovery without exposing secret-shaped provider text', async () => {
    const approvedTitle = 'Approved  sk-abcdefghijklmnopqrst';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: [
              fileMetadata({
                id: 'recovered-secret-shaped-drive-doc-123',
                name: approvedTitle,
                size: undefined,
              }),
            ],
            incompleteSearch: false,
          }),
          { status: 200 },
        ),
      );

    const result = await runGoogleDriveTool({
      toolName: 'document_create',
      params: {
        title: approvedTitle,
        content: 'The approved recovery body.',
      },
      values: credentials,
      signal: new AbortController().signal,
      idempotencyKey: 'approval-bound-secret-shaped-title',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'recovered-secret-shaped-drive-doc-123',
        untrustedName: 'Approved [redacted secret]',
        created: true,
        idempotentlyRecovered: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain('sk-abcdefghijklmnopqrst');
    expect(
      fetchSpy.mock.calls.filter(([url]) =>
        String(url).startsWith('https://www.googleapis.com/upload/drive/v3/files'),
      ),
    ).toHaveLength(0);
  });

  it.each([
    ['zero', []],
    [
      'one',
      [
        fileMetadata({
          id: 'hidden-later-page-drive-doc-123',
          name: 'Approved paginated brief',
          size: undefined,
        }),
      ],
    ],
  ])(
    'fails closed when an idempotency lookup has %s visible candidates and a next page',
    async (_label, files) => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              files,
              incompleteSearch: false,
              nextPageToken: 'provider-page-token-must-not-leak',
            }),
            { status: 200 },
          ),
        );

      await expect(
        runGoogleDriveTool({
          toolName: 'document_create',
          params: {
            title: 'Approved paginated brief',
            content: 'Do not create while the lookup is incomplete.',
          },
          values: credentials,
          signal: new AbortController().signal,
          idempotencyKey: `approval-bound-paginated-${_label}`,
        }),
      ).rejects.toThrow(/idempotency_state_ambiguous/i);
      expect(
        fetchSpy.mock.calls.filter(([url]) =>
          String(url).startsWith('https://www.googleapis.com/upload/drive/v3/files'),
        ),
      ).toHaveLength(0);
    },
  );

  it('fails closed before network on invalid model input and never includes provider error bodies or grants', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      runGoogleDriveTool({
        toolName: 'files_search',
        params: { term: "safe\u0000' or trashed = true", maxResults: 20 },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/search_term_invalid/i);
    await expect(
      runGoogleDriveTool({
        toolName: 'document_read',
        params: { fileId: '../private' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/file_id_invalid/i);
    await expect(
      runGoogleDriveTool({
        toolName: 'document_create',
        params: {
          title: 'Bad\r\nInjected: value',
          content: 'Safe body.',
        },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/title_invalid/i);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          'provider says drive-refresh-value-that-must-never-be-returned and private body',
          { status: 403 },
        ),
      );
    let error = '';
    try {
      await runGoogleDriveTool({
        toolName: 'files_search',
        params: { term: 'project', maxResults: 5 },
        values: credentials,
        signal: new AbortController().signal,
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    expect(error).toMatch(/provider_rejected_403/i);
    expect(error).not.toMatch(/refresh-value|private body/i);
  });

  it('rejects missing exact scopes, oversized provider responses, unknown tools, and extra parameters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'drive-access-value-that-must-never-be-returned',
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          token_type: 'Bearer',
        }),
        { status: 200 },
      ),
    );
    await expect(
      testGoogleDriveConnection({
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/required_scope_unavailable/i);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': String(2_000_000) },
        }),
      );
    await expect(
      runGoogleDriveTool({
        toolName: 'files_search',
        params: { term: 'project', maxResults: 5 },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/provider_response_too_large/i);

    vi.restoreAllMocks();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      runGoogleDriveTool({
        toolName: 'files_search',
        params: { term: 'project', maxResults: 5, rawQuery: 'trashed = true' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/unknown_fields/i);
    await expect(
      runGoogleDriveTool({
        toolName: 'delete_file',
        params: { fileId: 'drive-file-123' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/tool_unavailable/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
