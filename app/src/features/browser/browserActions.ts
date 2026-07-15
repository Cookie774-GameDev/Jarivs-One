import type { BrowserActionRisk } from './browserTypes';
import { DESTRUCTIVE_HINTS, SENSITIVE_TOOLS } from './browserTypes';
import { useBrowserStore } from './browserStore';
import type { CdpSession } from './browserClient';

export interface BrowserToolRequest {
  tool: string;
  params?: Record<string, unknown>;
  summary?: string;
}

export interface BrowserToolResult {
  ok: boolean;
  tool: string;
  message: string;
  data?: unknown;
}

const ALLOWED_TOOLS = new Set([
  'browser.open',
  'browser.newTab',
  'browser.closeTab',
  'browser.navigate',
  'browser.back',
  'browser.forward',
  'browser.reload',
  'browser.wait',
  'browser.inspect',
  'browser.readPage',
  'browser.findText',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.scroll',
  'browser.screenshot',
  'browser.getConsoleErrors',
  'browser.getCurrentUrl',
  'browser.listTabs',
  'browser.switchTab',
  'browser.stop',
]);

export function classifyRisk(tool: string, summary = ''): BrowserActionRisk {
  const hay = `${tool} ${summary}`.toLowerCase();
  if (DESTRUCTIVE_HINTS.some((h) => hay.includes(h))) return 'destructive';
  if (SENSITIVE_TOOLS.has(tool)) return 'sensitive';
  return 'safe';
}

export function validateBrowserTool(req: BrowserToolRequest): BrowserToolResult | null {
  if (!ALLOWED_TOOLS.has(req.tool)) {
    return {
      ok: false,
      tool: req.tool,
      message: `Unknown or disallowed browser tool: ${req.tool}`,
    };
  }
  if (req.tool === 'browser.evaluate' || req.tool === 'browser.runJs') {
    return { ok: false, tool: req.tool, message: 'Arbitrary JavaScript is not allowed.' };
  }
  return null;
}

/**
 * Queue or run a browser tool with approval policy.
 * Sensitive/destructive actions always require approval unless control mode is agent_controlled
 * and the action is classified safe (still not for destructive).
 */
export async function requestBrowserTool(
  req: BrowserToolRequest,
  cdp: CdpSession | null,
): Promise<BrowserToolResult> {
  const invalid = validateBrowserTool(req);
  if (invalid) return invalid;

  const store = useBrowserStore.getState();
  const tab = store.activeTab();
  const risk = classifyRisk(req.tool, req.summary);
  const mode = tab?.controlMode ?? 'ask_every_action';

  if (req.tool === 'browser.stop') {
    store.abortAgentActions();
    return { ok: true, tool: req.tool, message: 'Agent control stopped.' };
  }

  const needsApproval =
    mode === 'user_only'
      ? true
      : mode === 'ask_every_action'
        ? true
        : mode === 'allow_safe_session'
          ? risk !== 'safe'
          : risk === 'destructive';

  if (mode === 'user_only' && risk !== 'safe') {
    return {
      ok: false,
      tool: req.tool,
      message: 'Tab is user-only. Change control mode to allow agent actions.',
    };
  }

  if (needsApproval && risk !== 'safe') {
    const id = store.enqueueAgentAction({
      tool: req.tool,
      summary: req.summary ?? `${req.tool} ${JSON.stringify(req.params ?? {})}`.slice(0, 160),
      risk,
    });
    return {
      ok: false,
      tool: req.tool,
      message: 'Approval required — confirm the pending agent action in Vibe Browser.',
      data: { actionId: id, risk },
    };
  }

  return executeBrowserTool(req, cdp);
}

export async function executeBrowserTool(
  req: BrowserToolRequest,
  cdp: CdpSession | null,
): Promise<BrowserToolResult> {
  const store = useBrowserStore.getState();
  const tab = store.activeTab();

  try {
    switch (req.tool) {
      case 'browser.listTabs':
        return {
          ok: true,
          tool: req.tool,
          message: `${store.tabs.length} tabs`,
          data: store.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })),
        };
      case 'browser.getCurrentUrl':
        return { ok: true, tool: req.tool, message: tab?.url ?? '', data: { url: tab?.url } };
      case 'browser.getConsoleErrors':
        return {
          ok: true,
          tool: req.tool,
          message: 'console errors',
          data: store.consoleEntries.filter((e) => e.level === 'error').slice(0, 30),
        };
      case 'browser.newTab': {
        const url = String(req.params?.url ?? 'about:blank');
        const id = store.newTab(url);
        if (cdp && url !== 'about:blank') await cdp.navigate(url);
        return { ok: true, tool: req.tool, message: 'Tab created', data: { id, url } };
      }
      case 'browser.closeTab': {
        const id = String(req.params?.tabId ?? store.activeTabId);
        store.closeTab(id);
        return { ok: true, tool: req.tool, message: 'Tab closed' };
      }
      case 'browser.switchTab': {
        const id = String(req.params?.tabId ?? '');
        store.setActiveTab(id);
        return { ok: true, tool: req.tool, message: 'Switched tab' };
      }
      case 'browser.navigate':
      case 'browser.open': {
        const url = String(req.params?.url ?? '');
        if (!url) return { ok: false, tool: req.tool, message: 'url required' };
        if (tab) store.updateTab(tab.id, { url, title: url, loading: true });
        store.setDraftUrl(url);
        if (cdp) await cdp.navigate(url);
        if (tab) store.updateTab(tab.id, { loading: false });
        return { ok: true, tool: req.tool, message: `Navigated to ${url}` };
      }
      case 'browser.reload':
        if (cdp) await cdp.reload(Boolean(req.params?.hard));
        return { ok: true, tool: req.tool, message: 'Reloaded' };
      case 'browser.click': {
        if (!cdp) return { ok: false, tool: req.tool, message: 'CDP not connected' };
        const x = Number(req.params?.x ?? 0);
        const y = Number(req.params?.y ?? 0);
        await cdp.inputClick(x, y);
        return { ok: true, tool: req.tool, message: `Clicked ${x},${y}` };
      }
      case 'browser.type': {
        if (!cdp) return { ok: false, tool: req.tool, message: 'CDP not connected' };
        const text = String(req.params?.text ?? '');
        // Never type into password-like payloads if marked
        if (req.params?.secret === true) {
          return { ok: false, tool: req.tool, message: 'Refusing to type secret values.' };
        }
        await cdp.inputType(text);
        return { ok: true, tool: req.tool, message: 'Typed text' };
      }
      case 'browser.press': {
        if (!cdp) return { ok: false, tool: req.tool, message: 'CDP not connected' };
        await cdp.inputKey(String(req.params?.key ?? 'Enter'));
        return { ok: true, tool: req.tool, message: 'Key pressed' };
      }
      case 'browser.readPage': {
        if (!cdp) return { ok: false, tool: req.tool, message: 'CDP not connected' };
        const result = await cdp.evaluate(
          `(() => ({
            title: document.title,
            url: location.href,
            headings: [...document.querySelectorAll('h1,h2,h3')].slice(0,20).map(h => h.innerText.trim()).filter(Boolean),
            text: (document.body?.innerText || '').slice(0, 4000)
          }))()`,
        );
        return { ok: true, tool: req.tool, message: 'Page snapshot', data: result };
      }
      case 'browser.screenshot':
        return {
          ok: true,
          tool: req.tool,
          message: 'Use live screencast frame',
          data: { frame: store.frameDataUrl },
        };
      case 'browser.wait':
        await new Promise((r) => setTimeout(r, Math.min(10_000, Number(req.params?.ms ?? 500))));
        return { ok: true, tool: req.tool, message: 'Waited' };
      default:
        return { ok: false, tool: req.tool, message: 'Not implemented yet' };
    }
  } catch (e) {
    return {
      ok: false,
      tool: req.tool,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
