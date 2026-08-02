import { afterEach, describe, expect, it, vi } from 'vitest';
import { gmailArtifactDrafts, runGmailTool, testGmailConnection } from './gmailProvider';

afterEach(() => {
  vi.restoreAllMocks();
});

const credentials = {
  client_id: 'desktop-client.apps.googleusercontent.com',
  refresh_token: 'refresh-value-that-must-never-be-returned',
};

function tokenResponse() {
  return new Response(
    JSON.stringify({
      access_token: 'access-value-that-must-never-be-returned',
      expires_in: 3_600,
      scope:
        'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose',
      token_type: 'Bearer',
    }),
    { status: 200 },
  );
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(
      atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)),
      (character) => character.charCodeAt(0),
    ),
  );
}

function paddedBase64Url(value: string): string {
  return `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
}

async function fingerprintForRaw(value: string): Promise<string> {
  const binary = atob(
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4),
  );
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function message(input: {
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  messageId?: string;
  references?: string;
  replyTo?: string;
  snippet?: string;
}) {
  return {
    id: input.id,
    threadId: input.threadId ?? 'thread-1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: input.snippet ?? 'Safe bounded preview',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: input.from ?? 'Sender <sender@example.com>' },
        ...(input.replyTo ? [{ name: 'Reply-To', value: input.replyTo }] : []),
        { name: 'To', value: input.to ?? 'me@example.com' },
        { name: 'Subject', value: input.subject ?? 'Project update' },
        { name: 'Date', value: 'Fri, 24 Jul 2026 09:00:00 -0500' },
        { name: 'Message-ID', value: input.messageId ?? '<message-1@example.com>' },
        ...(input.references ? [{ name: 'References', value: input.references }] : []),
      ],
      body: { data: base64Url(input.body ?? 'Hello from Gmail.') },
    },
  };
}

describe('Gmail provider', () => {
  it('refreshes a desktop OAuth grant in memory and verifies the Gmail profile without returning tokens', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            emailAddress: 'person@example.com',
            messagesTotal: 120,
            threadsTotal: 75,
            historyId: '999',
          }),
          { status: 200 },
        ),
      );

    await expect(
      testGmailConnection({
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
    const tokenBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(String(tokenBody)).toContain('client_id=desktop-client.apps.googleusercontent.com');
    expect(String(tokenBody)).toContain('refresh_token=refresh-value-that-must-never-be-returned');
    expect(String(tokenBody)).toContain(
      'scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.compose',
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-value-that-must-never-be-returned',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('searches bounded metadata and reads selected messages as redacted external-untrusted text', async () => {
    const secretBody = 'sk-exampleSecretValue1234567890';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              { id: 'message-1', threadId: 'thread-1' },
              { id: 'message-2', threadId: 'thread-2' },
            ],
            resultSizeEstimate: 2,
            nextPageToken: 'provider-pagination-token-must-not-leak',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            message({
              id: 'message-1',
              subject: 'First message',
              snippet: 'First safe preview',
              body: 'UNSELECTED_PRIVATE_BODY',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            message({
              id: 'message-2',
              threadId: 'thread-2',
              subject: 'Second message',
              snippet: 'Second safe preview',
              body: 'UNSELECTED_PRIVATE_BODY',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            message({
              id: 'message-1',
              body: `Private message body with ${secretBody}`,
              snippet: 'Provider supplied snippet',
            }),
          ),
          { status: 200 },
        ),
      );

    const search = await runGmailTool({
      toolName: 'message_search',
      params: { query: 'in:inbox is:unread', maxResults: 2 },
      values: credentials,
      signal: new AbortController().signal,
    });
    expect(search).toEqual({
      ok: true,
      summary: '2 Gmail messages examined across 2 selected threads.',
      data: {
        contentTrust: 'external_untrusted',
        queryApplied: true,
        messagesExamined: 2,
        threadsSelected: 2,
        resultSizeEstimate: 2,
        messages: [
          expect.objectContaining({
            id: 'message-1',
            threadId: 'thread-1',
            untrustedSubject: 'First message',
            untrustedSnippet: 'First safe preview',
          }),
          expect.objectContaining({
            id: 'message-2',
            threadId: 'thread-2',
            untrustedSubject: 'Second message',
            untrustedSnippet: 'Second safe preview',
          }),
        ],
      },
    });
    expect(JSON.stringify(search)).not.toMatch(
      /UNSELECTED_PRIVATE_BODY|pagination-token|access-value|refresh-value/i,
    );

    const read = await runGmailTool({
      toolName: 'message_read',
      params: { messageId: 'message-1' },
      values: credentials,
      signal: new AbortController().signal,
    });
    expect(read).toMatchObject({
      ok: true,
      summary: 'Gmail message message-1 retrieved.',
      data: {
        contentTrust: 'external_untrusted',
        id: 'message-1',
        threadId: 'thread-1',
        untrustedSubject: 'Project update',
        untrustedBodyExcerpt: expect.stringContaining('[redacted secret]'),
        bodyTruncated: false,
      },
    });
    expect(JSON.stringify(read)).not.toContain(secretBody);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox+is%3Aunread&maxResults=2&includeSpamTrash=false',
    );
    expect(String(fetchSpy.mock.calls[2]?.[0])).toMatch(/messages\/message-1\?format=metadata/);
    expect(String(fetchSpy.mock.calls[2]?.[0])).not.toMatch(/UNSELECTED|provider/i);
  });

  it('creates fingerprinted drafts, honors Reply-To/thread headers, and sends only the unchanged approved draft', async () => {
    let createdRaw = '';
    let replyRaw = '';
    const longDraftBody = `The work is ready. ${'x'.repeat(2_000)}`;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementationOnce(async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { message: { raw: string } };
        createdRaw = request.message.raw;
        return new Response(
          JSON.stringify({
            id: 'draft-created',
            message: { id: 'draft-message', threadId: 'thread-created' },
            webViewLink: 'https://attacker.invalid/not-trusted',
          }),
          { status: 200 },
        );
      })
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              id: 'draft-created',
              message: {
                id: 'draft-message',
                threadId: 'thread-created',
                raw: paddedBase64Url(createdRaw),
              },
            }),
            { status: 200 },
          ),
      )
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            message({
              id: 'message-original',
              threadId: 'thread-original',
              from: 'Original Sender <sender@example.com>',
              replyTo: 'Replies <reply@example.com>',
              subject: 'Existing subject',
              messageId: '<original@example.com>',
              references: '<older@example.com>',
            }),
          ),
          { status: 200 },
        ),
      )
      .mockImplementationOnce(async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { message: { raw: string } };
        replyRaw = request.message.raw;
        return new Response(
          JSON.stringify({
            id: 'draft-reply',
            message: { id: 'reply-message', threadId: 'thread-original' },
          }),
          { status: 200 },
        );
      })
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              id: 'draft-reply',
              message: {
                id: 'reply-message',
                threadId: 'thread-original',
                raw: paddedBase64Url(replyRaw),
              },
            }),
            { status: 200 },
          ),
      )
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              id: 'draft-reply',
              message: {
                id: 'reply-message',
                threadId: 'thread-original',
                raw: paddedBase64Url(replyRaw),
              },
            }),
            { status: 200 },
          ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'sent-message',
            threadId: 'thread-original',
            labelIds: ['SENT'],
          }),
          { status: 200 },
        ),
      );

    const created = await runGmailTool({
      toolName: 'draft_create',
      params: {
        to: 'person@example.com',
        subject: 'Project update',
        body: longDraftBody,
      },
      values: credentials,
      signal: new AbortController().signal,
    });
    expect(created).toEqual({
      ok: true,
      summary: 'Gmail draft created for 1 recipient.',
      data: {
        draftId: 'draft-created',
        messageId: 'draft-message',
        threadId: 'thread-created',
        draftFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        untrustedSubject: 'Project update',
        recipientCount: 1,
        untrustedRecipients: ['person@example.com'],
        recipientsTruncated: false,
        openGmailUrl: 'https://mail.google.com/',
      },
    });
    const createBody = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body)) as {
      message: { raw: string };
    };
    expect(createBody.message.raw).not.toMatch(/[+=/]/);
    const decodedDraft = decodeBase64UrlText(createBody.message.raw);
    expect(decodedDraft).toContain('To: person@example.com\r\n');
    expect(decodedDraft).toContain('Subject: Project update\r\n');
    expect(decodedDraft).toContain('Content-Transfer-Encoding: base64\r\n');
    const decodedDraftBody = new TextDecoder().decode(
      Uint8Array.from(atob(decodedDraft.split('\r\n\r\n')[1]!.replace(/\r\n/g, '')), (character) =>
        character.charCodeAt(0),
      ),
    );
    expect(decodedDraftBody).toBe(longDraftBody);
    expect(
      decodedDraft.split('\r\n').every((line) => new TextEncoder().encode(line).byteLength <= 998),
    ).toBe(true);
    expect(JSON.stringify(created)).not.toMatch(/attacker\.invalid|access-value|refresh-value/i);

    const replied = await runGmailTool({
      toolName: 'reply_draft_create',
      params: { messageId: 'message-original', body: 'Thanks.' },
      values: credentials,
      signal: new AbortController().signal,
    });
    expect(replied).toMatchObject({
      ok: true,
      summary: 'Gmail reply draft created for 1 recipient.',
      data: {
        draftId: 'draft-reply',
        messageId: 'reply-message',
        threadId: 'thread-original',
        draftFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        untrustedSubject: 'Existing subject',
        recipientCount: 1,
        untrustedRecipients: ['reply@example.com'],
      },
    });
    const replyBody = JSON.parse(String(fetchSpy.mock.calls[5]?.[1]?.body)) as {
      message: { raw: string; threadId: string };
    };
    expect(replyBody.message.threadId).toBe('thread-original');
    const decodedReply = decodeBase64UrlText(replyBody.message.raw);
    expect(decodedReply).toContain('To: reply@example.com\r\n');
    expect(decodedReply).toContain('Subject: Existing subject\r\n');
    expect(decodedReply).toContain('In-Reply-To: <original@example.com>\r\n');
    expect(decodedReply).toContain(
      'References: <older@example.com>\r\n <original@example.com>\r\n',
    );

    const repliedData =
      replied.ok && replied.data && typeof replied.data === 'object'
        ? (replied.data as Record<string, unknown>)
        : undefined;
    if (!repliedData || typeof repliedData.draftFingerprint !== 'string') {
      throw new Error('expected a fingerprinted reply draft');
    }
    const approvedFingerprint = repliedData.draftFingerprint;

    const sent = await runGmailTool({
      toolName: 'draft_send',
      params: { draftId: 'draft-reply', draftFingerprint: approvedFingerprint },
      values: credentials,
      signal: new AbortController().signal,
    });
    expect(sent).toEqual({
      ok: true,
      summary: 'Approved unchanged Gmail draft draft-reply sent.',
      data: {
        draftId: 'draft-reply',
        draftFingerprint: approvedFingerprint,
        messageId: 'sent-message',
        threadId: 'thread-original',
        sourceDraftDeletedByProvider: true,
        openGmailUrl: 'https://mail.google.com/',
      },
    });
    expect(fetchSpy.mock.calls[9]?.[0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send',
    );
    expect(fetchSpy.mock.calls[9]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          id: 'draft-reply',
          message: {
            raw: paddedBase64Url(replyRaw),
            threadId: 'thread-original',
          },
        }),
      }),
    );
  });

  it('reads a bounded thread without attachments or active HTML and fails closed before network on invalid input', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'thread-1',
            messages: [
              message({
                id: 'message-1',
                threadId: 'thread-1',
                body: 'Plain message body.',
              }),
              {
                ...message({
                  id: 'message-2',
                  threadId: 'thread-1',
                  subject: 'HTML message',
                }),
                payload: {
                  mimeType: 'multipart/alternative',
                  headers: message({ id: 'header-source' }).payload.headers,
                  parts: [
                    {
                      mimeType: 'text/html',
                      body: {
                        data: base64Url(
                          '<script>ACTIVE_CONTENT_MUST_NOT_APPEAR</script><p>Visible text</p><img src="https://tracking.invalid/pixel">',
                        ),
                      },
                    },
                    {
                      mimeType: 'application/pdf',
                      filename: 'private.pdf',
                      body: { attachmentId: 'attachment-must-not-be-fetched', size: 1000 },
                    },
                    {
                      mimeType: 'text/plain',
                      filename: 'private.txt',
                      body: { data: base64Url('INLINE_TEXT_ATTACHMENT_MUST_NOT_APPEAR') },
                    },
                    {
                      mimeType: 'text/plain',
                      headers: [{ name: 'Content-Disposition', value: 'attachment' }],
                      body: { data: base64Url('DISPOSITION_ATTACHMENT_MUST_NOT_APPEAR') },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const thread = await runGmailTool({
      toolName: 'thread_read',
      params: { threadId: 'thread-1' },
      values: credentials,
      signal: new AbortController().signal,
    });
    expect(thread).toMatchObject({
      ok: true,
      summary: '2 Gmail messages retrieved from thread thread-1.',
      data: {
        contentTrust: 'external_untrusted',
        threadId: 'thread-1',
        messagesExamined: 2,
        messages: [
          expect.objectContaining({
            id: 'message-1',
            attachmentsRetrieved: false,
            remoteContentLoaded: false,
            untrustedBodyExcerpt: 'Plain message body.',
          }),
          expect.objectContaining({
            id: 'message-2',
            attachmentsRetrieved: false,
            remoteContentLoaded: false,
            untrustedBodyExcerpt: 'Visible text',
          }),
        ],
      },
    });
    expect(JSON.stringify(thread)).not.toMatch(
      /ACTIVE_CONTENT|tracking\.invalid|attachment-must-not-be-fetched|private\.(?:pdf|txt)|INLINE_TEXT_ATTACHMENT|DISPOSITION_ATTACHMENT/i,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockClear();
    await expect(
      runGmailTool({
        toolName: 'draft_send',
        params: { draftId: '../escape', approvalId: 'model-controlled' },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/send_parameters_invalid|resource_id_invalid/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to send when the Gmail draft changed after the approved fingerprint was captured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'draft-changed',
            message: {
              id: 'changed-message',
              threadId: 'changed-thread',
              raw: base64Url('To: attacker@example.com\r\n\r\nChanged content'),
            },
          }),
          { status: 200 },
        ),
      );

    await expect(
      runGmailTool({
        toolName: 'draft_send',
        params: {
          draftId: 'draft-changed',
          draftFingerprint: '0'.repeat(64),
        },
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/draft_changed_since_approval/i);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts/draft-changed?format=raw',
    );
  });

  it('cannot duplicate a send after an accepted response is lost because Gmail removes the sent draft', async () => {
    const raw = base64Url('To: person@example.com\r\n\r\nApproved content');
    const approvedFingerprint = await fingerprintForRaw(raw);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'draft-ambiguous',
            message: {
              id: 'draft-message',
              threadId: 'draft-thread',
              raw,
            },
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error('response lost after provider acceptance'))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    const send = () =>
      runGmailTool({
        toolName: 'draft_send',
        params: {
          draftId: 'draft-ambiguous',
          draftFingerprint: approvedFingerprint,
        },
        values: credentials,
        signal: new AbortController().signal,
      });

    await expect(send()).rejects.toThrow(/response lost after provider acceptance/i);
    await expect(send()).rejects.toThrow(/provider_rejected_404/i);
    expect(
      fetchSpy.mock.calls.filter(
        ([url]) => url === 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send',
      ),
    ).toHaveLength(1);
  });

  it('rejects missing OAuth scopes, oversized provider data, and pre-aborted requests without leaking provider bodies', async () => {
    const missingScopeFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'access-value-that-must-never-be-returned',
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        }),
        { status: 200 },
      ),
    );
    await expect(
      testGmailConnection({
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/required_scope_unavailable/i);
    expect(missingScopeFetch).toHaveBeenCalledTimes(1);

    missingScopeFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access-value-that-must-never-be-returned',
            token_type: 'Bearer',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access-value-that-must-never-be-returned',
            token_type: 'Bearer',
            scope:
              'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://mail.google.com/',
          }),
          { status: 200 },
        ),
      );
    await expect(
      testGmailConnection({
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/scope_invalid/i);
    await expect(
      testGmailConnection({
        values: credentials,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/required_scope_unavailable/i);
    expect(missingScopeFetch).toHaveBeenCalledTimes(3);

    missingScopeFetch.mockReset();
    missingScopeFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      new Response('PRIVATE_PROVIDER_BODY_MUST_NOT_LEAK', {
        status: 200,
        headers: { 'Content-Length': String(2 * 1024 * 1024) },
      }),
    );
    const oversized = await runGmailTool({
      toolName: 'message_read',
      params: { messageId: 'message-1' },
      values: credentials,
      signal: new AbortController().signal,
    }).catch((error) => error);
    expect(String(oversized)).toMatch(/provider_response_too_large/i);
    expect(String(oversized)).not.toMatch(/PRIVATE_PROVIDER_BODY/i);

    missingScopeFetch.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runGmailTool({
        toolName: 'message_search',
        params: { query: 'in:inbox', maxResults: 5 },
        values: credentials,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(missingScopeFetch).not.toHaveBeenCalled();
  });

  it('creates safe generic Gmail artifacts without persisting private message bodies or provider URLs', () => {
    const evidence = Object.freeze({
      producerId: 'plugin_result' as const,
      accountId: 'account-a',
      runId: 'run-gmail',
      requestId: 'request-gmail',
      attemptNumber: 1,
      resultRef: 'result-gmail',
      state: 'succeeded' as const,
      verifiedAt: 1_786_300_400_000,
      pluginId: 'gmail',
      invocationId: 'approval:approval-gmail',
    });
    const drafts = gmailArtifactDrafts({
      evidence,
      registration: {
        kind: 'plugin_tool',
        pluginId: 'gmail',
        toolName: 'draft_create',
      },
      result: {
        ok: true,
        summary: 'Gmail draft created.',
        data: {
          draftId: 'draft-created',
          draftFingerprint: 'a'.repeat(64),
          untrustedSubject: 'Project update',
          recipientCount: 1,
          untrustedRecipients: ['person@example.com'],
          recipientsTruncated: false,
          untrustedBodyExcerpt: 'PRIVATE_BODY_MUST_NOT_PERSIST',
          openGmailUrl: 'https://attacker.invalid/not-trusted',
        },
      },
    });

    expect(drafts).toEqual([
      expect.objectContaining({
        artifact: expect.objectContaining({
          kind: 'provider_result',
          title: 'Gmail draft: Project update',
          safeSummary: 'Draft snapshot for person@example.com; open Gmail for current state.',
        }),
        backing: expect.objectContaining({
          kind: 'producer_result',
          content: expect.stringContaining('"draftId":"draft-created"'),
        }),
      }),
      expect.objectContaining({
        artifact: expect.objectContaining({
          kind: 'link',
          title: 'Open Gmail',
          safeSummary: 'Open Gmail to review the draft’s current state.',
        }),
        backing: { kind: 'uri', uri: 'https://mail.google.com/' },
      }),
    ]);
    expect(JSON.stringify(drafts)).not.toMatch(/PRIVATE_BODY|attacker\.invalid/i);
  });
});
