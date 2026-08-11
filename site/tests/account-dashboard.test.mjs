import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  aggregateUsage,
  filterTerminals,
  mergePlugins,
  normalizeDevices,
  normalizePluginSnapshots,
  normalizeProjects,
  normalizeTerminals,
} from '../account/account-model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const accountDir = resolve(here, '../account');

test('account page includes complete auth and dashboard surfaces', async () => {
  const html = await readFile(resolve(accountDir, 'index.html'), 'utf8');
  for (const required of [
    'data-auth-mode="signin"',
    'data-auth-mode="signup"',
    'data-auth-mode="recovery"',
    'id="otp-code"',
    'id="new-password-form"',
    'data-route-panel="overview"',
    'data-route-panel="terminals"',
    'data-route-panel="projects"',
    'data-route-panel="plugins"',
    'data-route-panel="usage"',
    'data-route-panel="billing"',
  ]) {
    assert.match(html, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(html, /encrypted_secret|api[_-]?key\s*value|service_role/i);
});

test('account runtime uses account-scoped tables and realtime', async () => {
  const runtime = (await Promise.all([
    'account.js',
    'account-auth.js',
    'account-data.js',
    'account-sections.js',
    'account-runtime.js',
  ].map((name) => readFile(resolve(accountDir, name), 'utf8')))).join('\n');
  assert.match(runtime, /dashboard_terminal_snapshots/);
  assert.match(runtime, /dashboard_plugin_snapshots/);
  assert.match(runtime, /desktop_presence/);
  assert.match(runtime, /postgres_changes/);
  assert.match(runtime, /signUp/);
  assert.match(runtime, /resetPasswordForEmail/);
  assert.match(runtime, /verifyOtp/);
  assert.match(runtime, /create-customer-portal/);
  assert.doesNotMatch(runtime, /select\([^)]*encrypted_secret/);
});

test('device and terminal normalization remains account-safe and bounded', () => {
  const now = Date.now();
  const devices = normalizeDevices([
    {
      user_id: 'user',
      device_id: 'device-12345678',
      display_name: 'Laptop',
      app_version: '1.0.0',
      is_online: true,
      last_seen_at: new Date(now - 1000).toISOString(),
      active_runtime: 'openai · model',
      provider_usage: {},
      background_task_count: 2,
      updated_at: new Date(now).toISOString(),
    },
  ], now);
  assert.equal(devices[0].isOnline, true);
  const terminals = normalizeTerminals([
    {
      user_id: 'user',
      device_id: 'device-12345678',
      session_id: 'session-1',
      project_id: 'project-1',
      project_name: 'VibeSpace',
      title: 'Builder terminal',
      status: 'running',
      provider: 'openai',
      model: 'model',
      plugin_ids: ['github'],
      output_tail: 'hello\u0000 world',
      output_sequence: 4,
      bytes_seen: 100,
      updated_at: new Date(now).toISOString(),
    },
  ], devices, now);
  assert.equal(terminals[0].deviceName, 'Laptop');
  assert.equal(terminals[0].status, 'running');
  assert.equal(terminals[0].outputTail.includes('\u0000'), false);
});

test('usage, plugins, projects, and terminal filters aggregate correctly', () => {
  const usage = aggregateUsage([
    { provider: 'openai', model: 'a', prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.01, latency_ms: 100, ts: new Date().toISOString() },
    { provider: 'openai', model: 'a', prompt_tokens: 20, completion_tokens: 6, cost_usd: 0.02, latency_ms: 200, ts: new Date().toISOString() },
  ]);
  assert.equal(usage.inputTokens, 30);
  assert.equal(usage.outputTokens, 11);
  assert.equal(usage.byModel.size, 1);

  const snapshots = normalizePluginSnapshots([
    { device_id: 'device-12345678', plugin_id: 'github', label: 'GitHub', kind: 'plugin', state: 'connected', enabled: true, enabled_project_ids: ['p1'], updated_at: new Date().toISOString() },
  ]);
  const plugins = mergePlugins([], snapshots);
  const terminals = [{ key: 'd:s', projectId: 'p1', projectName: 'Project', updatedAt: new Date().toISOString(), status: 'running', model: 'a', agentSlug: 'builder', pluginIds: ['github'], title: 'Builder', deviceId: 'd', deviceName: 'Laptop', provider: 'openai', commandLabel: 'codex' }];
  const projects = normalizeProjects([{ id: 'p1', name: 'Project', description: '', updated_at: new Date().toISOString() }], terminals, plugins);
  assert.equal(projects[0].runningTerminalCount, 1);
  assert.deepEqual(projects[0].pluginIds, ['github']);
  assert.equal(filterTerminals(terminals, { query: 'codex', status: 'all', deviceId: 'all', projectId: 'all' }).length, 1);
});
