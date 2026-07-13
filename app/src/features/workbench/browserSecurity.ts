export const EMBEDDED_BROWSER_SANDBOX =
  'allow-forms allow-modals allow-popups allow-scripts';

const FORBIDDEN_SCHEME = /^(?:javascript|data|file|tauri|asset|chrome|about|vbscript):/i;

export function normalizeBrowserUrl(input: string): string {
  const raw = input.trim();
  if (!raw || FORBIDDEN_SCHEME.test(raw)) {
    throw new Error('Only HTTP and HTTPS pages can open in the Workbench browser.');
  }

  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)
      ? `http://${raw}`
      : `https://${raw}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS pages can open in the Workbench browser.');
  }
  if (url.username || url.password) {
    throw new Error('HTTP URLs with embedded credentials are not allowed.');
  }
  return url.toString();
}

export function browserFramePolicy(input: string): {
  src: string;
  sandbox: string;
  referrerPolicy: 'no-referrer';
  allow: string;
} {
  return {
    src: normalizeBrowserUrl(input),
    sandbox: EMBEDDED_BROWSER_SANDBOX,
    referrerPolicy: 'no-referrer',
    allow:
      "clipboard-read 'none'; clipboard-write 'none'; camera 'none'; microphone 'none'; geolocation 'none'",
  };
}
