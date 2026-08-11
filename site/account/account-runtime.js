function realtimeRefresh() {
  window.clearTimeout(realtimeDebounceTimer);
  realtimeDebounceTimer = window.setTimeout(() => void refreshDashboard(), REALTIME_REFRESH_DEBOUNCE_MS);
}

function setRealtimeStatus(status) {
  const normalized = String(status || '').toUpperCase();
  nodes.realtimeDot.classList.remove('connected', 'error');
  if (normalized === 'SUBSCRIBED') {
    nodes.realtimeDot.classList.add('connected');
    nodes.realtimeLabel.textContent = 'Live updates connected';
  } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(normalized)) {
    nodes.realtimeDot.classList.add('error');
    nodes.realtimeLabel.textContent = 'Live socket unavailable · polling active';
  } else {
    nodes.realtimeLabel.textContent = 'Connecting live updates…';
  }
}

function startDashboardRuntime(user) {
  teardownDashboardRuntime();
  refreshTimer = window.setInterval(() => void refreshDashboard(), FALLBACK_REFRESH_MS);
  realtimeChannel = vibeSupabase
    .channel(`vibespace-dashboard:${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'desktop_presence', filter: `user_id=eq.${user.id}` }, realtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_terminal_snapshots', filter: `user_id=eq.${user.id}` }, realtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_plugin_snapshots', filter: `user_id=eq.${user.id}` }, realtimeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` }, realtimeRefresh)
    .subscribe(setRealtimeStatus);
}

function teardownDashboardRuntime() {
  dashboardGeneration += 1;
  dashboardLoading = false;
  refreshQueued = false;
  window.clearInterval(refreshTimer);
  refreshTimer = null;
  window.clearTimeout(realtimeDebounceTimer);
  realtimeDebounceTimer = null;
  if (realtimeChannel && vibeSupabase) void vibeSupabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
  setRealtimeStatus('CLOSED');
}

async function enterDashboard(user) {
  currentUser = user;
  authGeneration += 1;
  clearSecretInputs();
  nodes.authView.hidden = true;
  nodes.dashboardView.hidden = false;
  selectedTerminalKey = null;
  selectDashboardRoute('overview');
  startDashboardRuntime(user);
  await refreshDashboard({ force: true });
}

async function transitionToSession(session) {
  const user = session?.user || null;
  if (!user) {
    showSignedOut();
    return;
  }
  try {
    const { data, error } = await vibeSupabase.auth.getUser();
    if (error || data?.user?.id !== user.id) {
      await vibeSupabase.auth.signOut({ scope: 'local' });
      showSignedOut();
      return;
    }
  } catch {
    showSignedOut();
    return;
  }
  await enterDashboard(user);
}

async function signOut() {
  if (!vibeSupabase) return;
  nodes.signoutButton.disabled = true;
  setGlobalStatus('Signing out…');
  try {
    await vibeSupabase.auth.signOut();
  } finally {
    nodes.signoutButton.disabled = false;
  }
}

async function initialize() {
  nodes.authView.hidden = true;
  nodes.dashboardView.hidden = true;
  setGlobalStatus('Connecting securely to VibeSpace…');
  try {
    const response = await fetch(`${GATEWAY_ORIGIN}/public-config`, {
      headers: { accept: 'application/json' },
      mode: 'cors',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Authentication configuration is unavailable.');
    const config = await response.json();
    const url = new URL(config.supabase_url);
    const key = String(config.supabase_publishable_key || '');
    if (url.protocol !== 'https:' || !key.startsWith('sb_publishable_')) {
      throw new Error('Authentication configuration is invalid.');
    }
    vibeSupabase = createClient(url.href.replace(/\/$/u, ''), key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    });
    vibeSupabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void transitionToSession(session));
    });
    const { data, error } = await vibeSupabase.auth.getSession();
    if (error) throw error;
    await transitionToSession(data.session);
  } catch (error) {
    nodes.authView.hidden = true;
    nodes.dashboardView.hidden = true;
    setGlobalStatus(
      safeText(error?.message, 240) || 'VibeSpace account services are temporarily unavailable.',
      'error',
    );
  }
}

for (const tab of nodes.authTabs) {
  tab.addEventListener('click', () => selectAuthMode(tab.dataset.authMode));
}
for (const button of document.querySelectorAll('[data-reveal]')) {
  button.addEventListener('click', () => {
    const input = document.querySelector(`#${CSS.escape(button.dataset.reveal)}`);
    if (!(input instanceof HTMLInputElement)) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${reveal ? 'Hide' : 'Show'} password`);
  });
}

nodes.credentialsForm.addEventListener('submit', submitCredentials);
nodes.emailCodeButton.addEventListener('click', sendEmailCode);
nodes.codeForm.addEventListener('submit', submitCode);
nodes.resendCodeButton.addEventListener('click', resendCode);
nodes.codeBackButton.addEventListener('click', () => selectAuthMode(authMode, { preserveEmail: true }));
nodes.newPasswordForm.addEventListener('submit', submitNewPassword);
nodes.passwordBackButton.addEventListener('click', async () => {
  recoveryVerified = false;
  pendingVerification = null;
  clearSecretInputs();
  if (vibeSupabase) await vibeSupabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  selectAuthMode('recovery', { preserveEmail: true });
});
for (const button of nodes.dashboardNav) {
  button.addEventListener('click', () => selectDashboardRoute(button.dataset.dashboardRoute));
}
for (const button of document.querySelectorAll('[data-go-route]')) {
  button.addEventListener('click', () => selectDashboardRoute(button.dataset.goRoute));
}
for (const input of [
  nodes.terminalSearch,
  nodes.terminalStatusFilter,
  nodes.terminalDeviceFilter,
  nodes.terminalProjectFilter,
]) {
  input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', renderTerminalWorkspace);
}
nodes.refreshButton.addEventListener('click', () => void refreshDashboard({ force: true }));
nodes.signoutButton.addEventListener('click', () => void signOut());
nodes.manageBillingButton.addEventListener('click', () => void openBillingPortal());

void initialize();
