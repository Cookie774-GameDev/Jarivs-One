export type PreviewUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: string; message: string };

/** Normalize and validate preview navigation targets. */
export function normalizePreviewUrl(raw: string): PreviewUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, code: 'invalid_url', message: 'Enter a URL or localhost address.' };
  }
  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) {
    return {
      ok: false,
      code: 'unsupported_protocol',
      message: 'Only http:// and https:// URLs are allowed.',
    };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (
      candidate.startsWith('localhost') ||
      candidate.startsWith('127.0.0.1') ||
      /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(candidate)
    ) {
      candidate = `http://${candidate}`;
    } else if (candidate.includes('.') || candidate.includes('/')) {
      candidate = `https://${candidate}`;
    } else {
      return {
        ok: false,
        code: 'invalid_url',
        message: 'Could not understand that address.',
      };
    }
  }

  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return {
        ok: false,
        code: 'unsupported_protocol',
        message: `Unsupported protocol: ${u.protocol}`,
      };
    }
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, code: 'invalid_url', message: 'Malformed URL.' };
  }
}
