const SAFE_STATUS = new Set([
  'active',
  'idle',
  'open',
  'running',
  'queued',
  'blocked',
  'done',
  'failed',
  'stopped',
  'cancelled',
  'unknown',
]);

const SAFE_PLUGIN_STATE = new Set([
  'connected',
  'not_connected',
  'needs_setup',
  'connecting',
  'awaiting_approval',
  'reauthorize',
  'expired',
  'error',
]);

const DEVICE_ONLINE_TTL_MS = 20_000;
const TERMINAL_FRESH_TTL_MS = 15_000;

function safeText(value, maxLength = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeMultilineText(value, maxLength = 16_384) {
  return String(value ?? '')
    .replace(/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\r\n?/gu, '\n')
    .slice(-maxLength);
}

function safeDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeArray(value, limit = 50) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function boundedNumber(value, min = 0, max = 1_000_000_000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(min, Math.min(number, max));
}

function normalizeDevices(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object' && !row.revoked_at)
    .map((row) => {
      const lastSeenAt = safeDate(row.last_seen_at);
      const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
      return {
        userId: safeText(row.user_id, 80),
        deviceId: safeText(row.device_id, 128),
        displayName: safeText(row.display_name, 80) || 'VibeSpace desktop',
        appVersion: safeText(row.app_version, 40) || 'Unknown version',
        isOnline:
          row.is_online === true &&
          Number.isFinite(lastSeenMs) &&
          now >= lastSeenMs &&
          now - lastSeenMs <= DEVICE_ONLINE_TTL_MS,
        lastSeenAt,
        activeRuntime: safeText(row.active_runtime, 120) || null,
        backgroundTaskCount: Math.trunc(boundedNumber(row.background_task_count, 0, 1000)),
        providerUsage:
          row.provider_usage && typeof row.provider_usage === 'object' && !Array.isArray(row.provider_usage)
            ? row.provider_usage
            : {},
        recentSyncAt: safeDate(row.recent_sync_at),
        updatedAt: safeDate(row.updated_at),
      };
    })
    .filter((device) => device.deviceId)
    .sort((left, right) => {
      if (left.isOnline !== right.isOnline) return left.isOnline ? -1 : 1;
      return String(right.lastSeenAt).localeCompare(String(left.lastSeenAt));
    });
}

function normalizeTerminals(rows, devices = [], now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  const deviceById = new Map(devices.map((device) => [device.deviceId, device]));
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const updatedAt = safeDate(row.updated_at);
      const updatedMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
      const lastOutputAt = safeDate(row.last_output_at);
      const startedAt = safeDate(row.started_at);
      const endedAt = safeDate(row.ended_at);
      const device = deviceById.get(safeText(row.device_id, 128));
      const rawStatus = safeText(row.status, 24).toLowerCase();
      const status = SAFE_STATUS.has(rawStatus) ? rawStatus : 'unknown';
      const pluginIds = safeArray(row.plugin_ids, 30)
        .map((entry) => safeText(entry, 80))
        .filter(Boolean);
      return {
        key: `${safeText(row.device_id, 128)}:${safeText(row.session_id, 128)}`,
        userId: safeText(row.user_id, 80),
        deviceId: safeText(row.device_id, 128),
        deviceName: device?.displayName || 'VibeSpace desktop',
        deviceOnline: Boolean(device?.isOnline),
        sessionId: safeText(row.session_id, 128),
        paneId: safeText(row.pane_id, 128) || null,
        projectId: safeText(row.project_id, 128) || null,
        projectName: safeText(row.project_name, 120) || 'Unassigned project',
        title: safeText(row.title, 120) || 'Terminal',
        agentSlug: safeText(row.agent_slug, 80) || null,
        commandLabel: safeText(row.command_label, 240) || null,
        requestSummary: safeText(row.request_summary, 2000) || null,
        status,
        provider: safeText(row.provider, 80) || null,
        model: safeText(row.model, 160) || null,
        reasoningMode: safeText(row.reasoning_mode, 80) || null,
        pluginIds,
        outputTail: safeMultilineText(row.output_tail, 16_384),
        outputSequence: Math.trunc(boundedNumber(row.output_sequence, 0, Number.MAX_SAFE_INTEGER)),
        bytesSeen: Math.trunc(boundedNumber(row.bytes_seen, 0, Number.MAX_SAFE_INTEGER)),
        startedAt,
        lastOutputAt,
        endedAt,
        exitCode: Number.isInteger(row.exit_code) ? row.exit_code : null,
        outputShared: row.output_shared !== false,
        updatedAt,
        fresh:
          Number.isFinite(updatedMs) &&
          now >= updatedMs &&
          now - updatedMs <= TERMINAL_FRESH_TTL_MS,
      };
    })
    .filter((terminal) => terminal.deviceId && terminal.sessionId)
    .sort((left, right) => {
      const score = (terminal) => {
        if (terminal.status === 'running' || terminal.status === 'active') return 5;
        if (terminal.status === 'queued') return 4;
        if (terminal.status === 'blocked') return 3;
        if (terminal.status === 'idle') return 2;
        return 1;
      };
      const statusDelta = score(right) - score(left);
      if (statusDelta) return statusDelta;
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });
}

function normalizePluginSnapshots(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const rawState = safeText(row.state, 40).toLowerCase();
      return {
        key: `${safeText(row.device_id, 128)}:${safeText(row.plugin_id, 100)}`,
        deviceId: safeText(row.device_id, 128),
        pluginId: safeText(row.plugin_id, 100),
        label: safeText(row.label, 120) || safeText(row.plugin_id, 100) || 'Plugin',
        kind: safeText(row.kind, 80) || 'integration',
        state: SAFE_PLUGIN_STATE.has(rawState) ? rawState : 'not_connected',
        enabled: row.enabled === true,
        accountLabel: safeText(row.account_label, 160) || null,
        enabledProjectIds: safeArray(row.enabled_project_ids, 50)
          .map((entry) => safeText(entry, 128))
          .filter(Boolean),
        updatedAt: safeDate(row.updated_at),
      };
    })
    .filter((plugin) => plugin.deviceId && plugin.pluginId)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeIntegrations(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: safeText(row.id, 100),
      label: safeText(row.label, 120) || safeText(row.kind, 80) || 'Integration',
      kind: safeText(row.kind, 80) || 'integration',
      enabled: row.enabled !== false,
      updatedAt: safeDate(row.updated_at),
    }))
    .filter((integration) => integration.id);
}

function mergePlugins(integrations, snapshots) {
  const result = new Map();
  for (const integration of integrations) {
    result.set(integration.id, {
      key: `cloud:${integration.id}`,
      deviceId: null,
      pluginId: integration.id,
      label: integration.label,
      kind: integration.kind,
      state: integration.enabled ? 'connected' : 'not_connected',
      enabled: integration.enabled,
      accountLabel: null,
      enabledProjectIds: [],
      updatedAt: integration.updatedAt,
    });
  }
  for (const snapshot of snapshots) {
    const previous = result.get(snapshot.pluginId);
    const previousMs = Date.parse(previous?.updatedAt ?? '') || 0;
    const nextMs = Date.parse(snapshot.updatedAt ?? '') || 0;
    if (!previous || nextMs >= previousMs) result.set(snapshot.pluginId, snapshot);
  }
  return [...result.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function aggregateUsage(rows) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyTotal: 0,
    latencyCount: 0,
    requests: 0,
    byModel: new Map(),
  };
  if (!Array.isArray(rows)) return totals;
  for (const row of rows.slice(0, 5000)) {
    if (!row || typeof row !== 'object') continue;
    const provider = safeText(row.provider, 80) || 'unknown';
    const model = safeText(row.model, 160) || 'unknown model';
    const input = boundedNumber(row.prompt_tokens, 0, 1_000_000_000);
    const output = boundedNumber(row.completion_tokens, 0, 1_000_000_000);
    const cost = boundedNumber(row.cost_usd, 0, 1_000_000);
    const latency = boundedNumber(row.latency_ms, 0, 3_600_000);
    const timestamp = safeDate(row.ts);
    totals.inputTokens += input;
    totals.outputTokens += output;
    totals.costUsd += cost;
    totals.requests += 1;
    if (latency > 0) {
      totals.latencyTotal += latency;
      totals.latencyCount += 1;
    }
    const key = `${provider}\u0000${model}`;
    const bucket = totals.byModel.get(key) ?? {
      provider,
      model,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      lastUsedAt: null,
    };
    bucket.requests += 1;
    bucket.inputTokens += input;
    bucket.outputTokens += output;
    bucket.costUsd += cost;
    if (!bucket.lastUsedAt || String(timestamp).localeCompare(bucket.lastUsedAt) > 0) {
      bucket.lastUsedAt = timestamp;
    }
    totals.byModel.set(key, bucket);
  }
  return totals;
}

function normalizeProjects(projectRows, terminals, plugins) {
  const projects = new Map();
  if (Array.isArray(projectRows)) {
    for (const row of projectRows) {
      if (!row || typeof row !== 'object') continue;
      const id = safeText(row.id, 128);
      if (!id) continue;
      projects.set(id, {
        id,
        name: safeText(row.name, 120) || 'Untitled project',
        description: safeText(row.description, 360),
        updatedAt: safeDate(row.updated_at),
        terminals: [],
        pluginIds: new Set(),
        models: new Set(),
        agentSlugs: new Set(),
      });
    }
  }
  for (const terminal of terminals) {
    const id = terminal.projectId || '__unassigned__';
    const project = projects.get(id) ?? {
      id,
      name: terminal.projectName || 'Unassigned project',
      description: '',
      updatedAt: terminal.updatedAt,
      terminals: [],
      pluginIds: new Set(),
      models: new Set(),
      agentSlugs: new Set(),
    };
    project.terminals.push(terminal);
    if (terminal.model) project.models.add(terminal.model);
    if (terminal.agentSlug) project.agentSlugs.add(terminal.agentSlug);
    for (const pluginId of terminal.pluginIds) project.pluginIds.add(pluginId);
    if (String(terminal.updatedAt).localeCompare(String(project.updatedAt)) > 0) {
      project.updatedAt = terminal.updatedAt;
    }
    projects.set(id, project);
  }
  for (const plugin of plugins) {
    for (const projectId of plugin.enabledProjectIds) {
      const project = projects.get(projectId);
      if (project) project.pluginIds.add(plugin.pluginId);
    }
  }
  return [...projects.values()]
    .map((project) => ({
      ...project,
      pluginIds: [...project.pluginIds],
      models: [...project.models],
      agentSlugs: [...project.agentSlugs],
      runningTerminalCount: project.terminals.filter((terminal) =>
        ['running', 'active', 'queued'].includes(terminal.status),
      ).length,
    }))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function resolveSubscription(subscription, error = null) {
  if (error || !subscription) {
    return {
      plan: 'Not confirmed',
      status: 'unavailable',
      detail: 'No server-confirmed subscription is available.',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }
  const plan = safeText(subscription.plan, 80) || 'Unknown plan';
  const status = safeText(subscription.status, 40).toLowerCase() || 'unknown';
  const currentPeriodEnd = safeDate(subscription.current_period_end);
  return {
    plan: plan.charAt(0).toUpperCase() + plan.slice(1),
    status,
    detail: `${status.replaceAll('_', ' ')}${
      subscription.cancel_at_period_end ? ' · cancels at period end' : ''
    }${currentPeriodEnd ? ` · through ${new Date(currentPeriodEnd).toLocaleDateString()}` : ''}`,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}

function formatNumber(value) {
  return Math.round(boundedNumber(value, 0, Number.MAX_SAFE_INTEGER)).toLocaleString();
}

function relativeTime(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Not reported';
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 5_000) return 'Just now';
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1000)} sec ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`;
  return new Date(timestamp).toLocaleString();
}

function durationSince(value, endedAt = null, now = Date.now()) {
  const start = Date.parse(value);
  if (!Number.isFinite(start)) return 'Unknown';
  const end = Number.isFinite(Date.parse(endedAt)) ? Date.parse(endedAt) : now;
  const elapsed = Math.max(0, end - start);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function filterTerminals(terminals, filters) {
  const query = safeText(filters?.query, 240).toLowerCase();
  const status = safeText(filters?.status, 24).toLowerCase();
  const deviceId = safeText(filters?.deviceId, 128);
  const projectId = safeText(filters?.projectId, 128);
  return terminals.filter((terminal) => {
    if (status && status !== 'all' && terminal.status !== status) return false;
    if (deviceId && deviceId !== 'all' && terminal.deviceId !== deviceId) return false;
    const terminalProjectId = terminal.projectId || '__unassigned__';
    if (projectId && projectId !== 'all' && terminalProjectId !== projectId) return false;
    if (!query) return true;
    const haystack = [
      terminal.title,
      terminal.projectName,
      terminal.deviceName,
      terminal.agentSlug,
      terminal.provider,
      terminal.model,
      terminal.commandLabel,
      ...terminal.pluginIds,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}
