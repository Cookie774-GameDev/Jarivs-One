function renderProjects() {
  nodes.projectGrid.replaceChildren();
  if (!dashboardState.projects.length) {
    nodes.projectGrid.append(emptyState('No projects found', 'Projects appear after cloud sync or when a live terminal reports a project.'));
    return;
  }
  for (const project of dashboardState.projects) {
    const fragment = nodes.projectTemplate.content.cloneNode(true);
    const status = fragment.querySelector('[data-field="status"]');
    status.textContent = project.runningTerminalCount ? 'Active' : 'Idle';
    status.classList.toggle('running', project.runningTerminalCount > 0);
    fragment.querySelector('[data-field="updated"]').textContent = relativeTime(project.updatedAt);
    fragment.querySelector('[data-field="name"]').textContent = project.name;
    fragment.querySelector('[data-field="description"]').textContent = project.description || 'No project description was reported.';
    fragment.querySelector('[data-field="terminals"]').textContent = String(project.terminals.length);
    fragment.querySelector('[data-field="agents"]').textContent = String(project.agentSlugs.length);
    fragment.querySelector('[data-field="plugins"]').textContent = String(project.pluginIds.length);
    const models = fragment.querySelector('[data-field="models"]');
    const values = project.models.length ? project.models : ['No active model reported'];
    for (const value of values.slice(0, 8)) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = value;
      models.append(chip);
    }
    nodes.projectGrid.append(fragment);
  }
}

function renderPlugins() {
  nodes.pluginGrid.replaceChildren();
  if (!dashboardState.plugins.length) {
    nodes.pluginGrid.append(emptyState('No plugin connections found', 'Connect a plugin in the VibeSpace desktop app to see its safe connection status here.'));
    return;
  }
  for (const plugin of dashboardState.plugins) {
    const fragment = nodes.pluginTemplate.content.cloneNode(true);
    fragment.querySelector('[data-field="mark"]').textContent = plugin.label.charAt(0).toUpperCase();
    fragment.querySelector('[data-field="name"]').textContent = plugin.label;
    fragment.querySelector('[data-field="kind"]').textContent = plugin.kind;
    const state = fragment.querySelector('[data-field="state"]');
    state.textContent = plugin.state.replaceAll('_', ' ');
    state.classList.add(plugin.state);
    fragment.querySelector('[data-field="account"]').textContent = plugin.accountLabel || 'Account label not shared';
    fragment.querySelector('[data-field="projects"]').textContent = plugin.enabledProjectIds.length
      ? `${plugin.enabledProjectIds.length} enabled`
      : plugin.enabled
        ? 'All/default'
        : 'Disabled';
    fragment.querySelector('[data-field="updated"]').textContent = relativeTime(plugin.updatedAt);
    nodes.pluginGrid.append(fragment);
  }
}

function renderUsage() {
  const usage = dashboardState.usage;
  nodes.usageInputTokens.textContent = formatNumber(usage.inputTokens);
  nodes.usageOutputTokens.textContent = formatNumber(usage.outputTokens);
  nodes.usageCost.textContent = `$${usage.costUsd.toFixed(4)}`;
  nodes.usageLatency.textContent = usage.latencyCount
    ? `${Math.round(usage.latencyTotal / usage.latencyCount).toLocaleString()} ms`
    : 'Unavailable';
  nodes.usageTableBody.replaceChildren();
  const buckets = [...usage.byModel.values()].sort((left, right) => right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens));
  if (!buckets.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'No recent model usage was recorded.';
    row.append(cell);
    nodes.usageTableBody.append(row);
  } else {
    for (const bucket of buckets.slice(0, 100)) {
      const row = document.createElement('tr');
      const modelCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = bucket.model;
      const small = document.createElement('small');
      small.textContent = bucket.provider;
      modelCell.append(strong, small);
      const values = [
        bucket.requests.toLocaleString(),
        formatNumber(bucket.inputTokens),
        formatNumber(bucket.outputTokens),
        `$${bucket.costUsd.toFixed(4)}`,
        relativeTime(bucket.lastUsedAt),
      ];
      row.append(modelCell, ...values.map((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        return cell;
      }));
      nodes.usageTableBody.append(row);
    }
  }
  renderCompanyUsage();
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function renderCompanyUsage() {
  nodes.companyUsage.replaceChildren();
  const message = dashboardState.companyUsage.message || {};
  const call = dashboardState.companyUsage.call || {};
  const voice = dashboardState.companyUsage.voice || {};
  const cards = [
    {
      label: 'Shared credits',
      value: (() => {
        const used = firstFinite(message.credits_used, message.used);
        const included = firstFinite(message.credits_included, message.limit);
        return used !== null && included !== null ? `${formatNumber(used)} / ${formatNumber(included)}` : 'Unavailable';
      })(),
      detail: 'Server-confirmed plan credits',
    },
    {
      label: 'AI messages',
      value: (() => {
        const used = firstFinite(message.message?.used, message.messages_used, message.used);
        return used !== null ? formatNumber(used) : 'Unavailable';
      })(),
      detail: 'Company-routed message usage',
    },
    {
      label: 'Calls',
      value: (() => {
        const used = firstFinite(call.used_minutes, call.minutes_used, call.used);
        return used !== null ? `${formatNumber(used)} min` : 'Unavailable';
      })(),
      detail: 'Server-confirmed calling usage',
    },
    {
      label: 'Voice',
      value: (() => {
        const used = firstFinite(voice.used_seconds, voice.seconds_used, voice.used);
        return used !== null ? `${formatNumber(used)} sec` : 'Unavailable';
      })(),
      detail: 'Cloud voice usage',
    },
  ];
  for (const card of cards) {
    const article = document.createElement('article');
    const small = document.createElement('small');
    small.textContent = card.label;
    const strong = document.createElement('strong');
    strong.textContent = card.value;
    const span = document.createElement('span');
    span.textContent = card.detail;
    article.append(small, strong, span);
    nodes.companyUsage.append(article);
  }
}

function renderBilling() {
  const subscription = dashboardState.subscription;
  nodes.billingPlanName.textContent = subscription.plan;
  nodes.billingPlanStatus.textContent = subscription.detail;
  nodes.billingStatus.textContent = subscription.status.replaceAll('_', ' ');
  nodes.billingPeriod.textContent = subscription.currentPeriodEnd
    ? `Through ${new Date(subscription.currentPeriodEnd).toLocaleString()}`
    : 'Unavailable';
  nodes.billingCancel.textContent = subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'No cancellation reported';
  const message = dashboardState.companyUsage.message || {};
  const used = firstFinite(message.credits_used, message.used);
  const included = firstFinite(message.credits_included, message.limit);
  nodes.billingCredits.textContent = used !== null && included !== null
    ? `${formatNumber(used)} / ${formatNumber(included)}`
    : 'Unavailable';
  nodes.manageBillingButton.disabled = subscription.status === 'unavailable';
}

async function openBillingPortal() {
  if (!vibeSupabase) return;
  setMessage(nodes.billingMessage, 'Opening Stripe billing management…');
  nodes.manageBillingButton.disabled = true;
  try {
    const { data, error } = await vibeSupabase.functions.invoke('create-customer-portal', { body: {} });
    if (error) throw error;
    const url = new URL(data?.url);
    if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') {
      throw new Error('Untrusted portal URL.');
    }
    window.location.assign(url.href);
  } catch (error) {
    setMessage(
      nodes.billingMessage,
      friendlyAuthError(error, 'Billing management is temporarily unavailable. Try again from the desktop app.'),
    );
    nodes.manageBillingButton.disabled = false;
  }
}
