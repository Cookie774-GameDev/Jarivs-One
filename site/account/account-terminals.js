function renderOverviewTerminals() {
  nodes.overviewTerminalList.replaceChildren();
  const terminals = dashboardState.terminals.slice(0, 6);
  if (!terminals.length) { nodes.overviewTerminalList.append(emptyState('No live terminal output yet', 'Open the updated desktop app and start a terminal session.')); return; }
  for (const terminal of terminals) {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'compact-terminal-item';
    const pip = document.createElement('span'); pip.className = `status-pip ${terminal.status}`;
    const text = document.createElement('span'); const strong = document.createElement('strong'); strong.textContent = terminal.title;
    const small = document.createElement('small'); small.textContent = `${terminal.projectName} · ${terminal.model || terminal.provider || 'runtime not reported'}`; text.append(strong, small);
    const age = document.createElement('span'); age.textContent = terminal.lastOutputAt ? relativeTime(terminal.lastOutputAt) : terminal.status;
    item.append(pip, text, age); item.addEventListener('click', () => { selectedTerminalKey = terminal.key; selectDashboardRoute('terminals'); }); nodes.overviewTerminalList.append(item);
  }
}
function renderHealth() {
  nodes.healthList.replaceChildren();
  const errorsByLabel = new Set(dashboardState.errors.map(({ label }) => label));
  const checks = [
    { name: 'Realtime terminal data', tone: errorsByLabel.has('terminals') ? 'bad' : dashboardState.terminals.length ? 'good' : 'warn', detail: errorsByLabel.has('terminals') ? 'Terminal snapshot service is unavailable.' : dashboardState.terminals.length ? 'Account-scoped terminal snapshots are loading.' : 'Waiting for an updated desktop publisher.' },
    { name: 'Desktop presence', tone: errorsByLabel.has('devices') ? 'bad' : dashboardState.devices.some((device) => device.isOnline) ? 'good' : 'warn', detail: errorsByLabel.has('devices') ? 'Presence service is unavailable.' : dashboardState.devices.some((device) => device.isOnline) ? 'At least one desktop is online.' : 'No desktop heartbeat is fresh.' },
    { name: 'Usage authority', tone: errorsByLabel.has('usage') ? 'warn' : 'good', detail: errorsByLabel.has('usage') ? 'Local usage history is temporarily unavailable.' : `${dashboardState.usage.requests} recent model request${dashboardState.usage.requests === 1 ? '' : 's'} recorded.` },
    { name: 'Billing authority', tone: dashboardState.subscription.status === 'unavailable' ? 'warn' : 'good', detail: dashboardState.subscription.status === 'unavailable' ? 'No server-confirmed subscription was returned.' : `Subscription status: ${dashboardState.subscription.status.replaceAll('_', ' ')}.` },
  ];
  for (const check of checks) {
    const item = document.createElement('article'); item.className = `health-item ${check.tone}`;
    const strong = document.createElement('strong'); strong.textContent = check.name;
    const span = document.createElement('span'); span.textContent = check.detail;
    item.append(strong, span); nodes.healthList.append(item);
  }
}
function replaceSelectOptions(select, values, firstLabel) {
  const current = select.value; select.replaceChildren();
  const first = document.createElement('option'); first.value = 'all'; first.textContent = firstLabel; select.append(first);
  for (const value of values) { const option = document.createElement('option'); option.value = value.id; option.textContent = value.label; select.append(option); }
  select.value = [...select.options].some((option) => option.value === current) ? current : 'all';
}
function renderTerminalFilters() {
  replaceSelectOptions(nodes.terminalDeviceFilter, dashboardState.devices.map((device) => ({ id: device.deviceId, label: device.displayName })), 'All devices');
  replaceSelectOptions(nodes.terminalProjectFilter, dashboardState.projects.map((project) => ({ id: project.id, label: project.name })), 'All projects');
}
function currentTerminalFilters() { return { query: nodes.terminalSearch.value, status: nodes.terminalStatusFilter.value, deviceId: nodes.terminalDeviceFilter.value, projectId: nodes.terminalProjectFilter.value }; }
function renderTerminalWorkspace() {
  const terminals = filterTerminals(dashboardState.terminals, currentTerminalFilters());
  nodes.terminalGrid.replaceChildren();
  if (!terminals.length) {
    nodes.terminalGrid.append(emptyState(dashboardState.terminals.length ? 'No terminals match these filters' : 'No terminal snapshots yet', dashboardState.terminals.length ? 'Change the search or filters to see another session.' : 'Start a terminal in the updated desktop app. Output appears here automatically.'));
    if (!selectedTerminalKey) renderTerminalDetail(null); return;
  }
  if (!selectedTerminalKey || !dashboardState.terminals.some((terminal) => terminal.key === selectedTerminalKey)) selectedTerminalKey = terminals[0].key;
  for (const terminal of terminals) {
    const fragment = nodes.terminalCardTemplate.content.cloneNode(true); const button = fragment.querySelector('.terminal-card'); button.classList.toggle('selected', terminal.key === selectedTerminalKey);
    const status = fragment.querySelector('[data-field="status"]'); status.textContent = terminal.status; status.classList.add(terminal.status);
    fragment.querySelector('[data-field="title"]').textContent = terminal.title;
    fragment.querySelector('[data-field="project"]').textContent = `${terminal.projectName} · ${terminal.deviceName}`;
    fragment.querySelector('[data-field="model"]').textContent = terminal.model || terminal.provider || 'Runtime not reported';
    fragment.querySelector('[data-field="uptime"]').textContent = terminal.startedAt ? durationSince(terminal.startedAt, terminal.endedAt) : relativeTime(terminal.updatedAt);
    fragment.querySelector('[data-field="output"]').textContent = terminal.outputShared ? terminal.outputTail || 'Waiting for output…' : 'Output sharing is disabled for this terminal.';
    button.addEventListener('click', () => { selectedTerminalKey = terminal.key; renderTerminalWorkspace(); }); nodes.terminalGrid.append(fragment);
  }
  renderTerminalDetail(dashboardState.terminals.find((terminal) => terminal.key === selectedTerminalKey) || null);
}
function terminalFact(label, value) {
  const item = document.createElement('div'); item.className = 'terminal-fact';
  const small = document.createElement('small'); small.textContent = label;
  const strong = document.createElement('strong'); strong.textContent = value || 'Not reported'; item.append(small, strong); return item;
}
function renderTerminalDetail(terminal) {
  nodes.terminalDetail.replaceChildren();
  if (!terminal) {
    const empty = document.createElement('div'); empty.className = 'terminal-empty-state';
    const mark = document.createElement('span'); mark.textContent = '›_'; const heading = document.createElement('h2'); heading.textContent = 'Select a terminal';
    const paragraph = document.createElement('p'); paragraph.textContent = 'Choose a live terminal to inspect its safe output tail, model, uptime, plugins, and project.';
    empty.append(mark, heading, paragraph); nodes.terminalDetail.append(empty); return;
  }
  const inner = document.createElement('div'); inner.className = 'terminal-detail-inner';
  const header = document.createElement('header'); header.className = 'terminal-detail-header';
  const titleWrap = document.createElement('div'); const heading = document.createElement('h2'); heading.textContent = terminal.title;
  const subheading = document.createElement('p'); subheading.textContent = `${terminal.projectName} · ${terminal.deviceName} · ${terminal.sessionId}`; titleWrap.append(heading, subheading);
  const badge = document.createElement('span'); badge.className = 'terminal-live-badge'; badge.textContent = terminal.fresh ? `${terminal.status} · live` : `${terminal.status} · stale`; header.append(titleWrap, badge);
  const facts = document.createElement('div'); facts.className = 'terminal-facts';
  facts.append(terminalFact('Model', [terminal.provider, terminal.model].filter(Boolean).join(' · ')), terminalFact('Reasoning', terminal.reasoningMode), terminalFact('Uptime', terminal.startedAt ? durationSince(terminal.startedAt, terminal.endedAt) : null), terminalFact('Last output', relativeTime(terminal.lastOutputAt || terminal.updatedAt)), terminalFact('Agent', terminal.agentSlug), terminalFact('Command / harness', terminal.commandLabel), terminalFact('Plugins', terminal.pluginIds.length ? terminal.pluginIds.join(', ') : 'None reported'), terminalFact('Bytes seen', formatNumber(terminal.bytesSeen)));
  const outputWrap = document.createElement('div'); outputWrap.className = 'terminal-output-wrap';
  const toolbar = document.createElement('div'); toolbar.className = 'terminal-output-toolbar';
  const label = document.createElement('span'); label.textContent = terminal.outputShared ? 'Safe live output tail' : 'Output sharing disabled';
  const sequence = document.createElement('span'); sequence.textContent = `Sequence ${terminal.outputSequence.toLocaleString()}`; toolbar.append(label, sequence);
  const output = document.createElement('pre'); output.className = 'terminal-output'; output.textContent = terminal.outputShared ? terminal.outputTail || 'The terminal is connected, but no printable output has arrived yet.' : 'This device is reporting terminal metadata only.';
  outputWrap.append(toolbar, output); inner.append(header, facts, outputWrap); nodes.terminalDetail.append(inner); requestAnimationFrame(() => { output.scrollTop = output.scrollHeight; });
}
