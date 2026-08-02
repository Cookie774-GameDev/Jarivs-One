/**
 * Focused MonoChrome closure regressions for the authenticated
 * route:benchmarks surface.
 *
 * The MonoChrome browser invariant (tests/visual/monochrome/styleMetrics.ts)
 * requires zero visible shadows and zero gradients under
 * html[data-theme='monochrome']. The benchmarks route kept exactly one of
 * each: the filters-row Switch thumb elevation, and the severity-pill
 * gradient used by the "from snapshot" header chip plus the table and drawer
 * license pills. These tests pin the narrow component-local gates that
 * flatten both owners without touching Default/VibeSpace/Jarvis presentation
 * or benchmark behavior.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fetchedAt = Date.parse('2026-07-11T12:00:00Z');
  const rows = [
    {
      model: 'Fixture Model A',
      provider: 'OpenAI',
      arena_score: 1500,
      ci_low: 1480,
      ci_high: 1520,
      open_source: false,
      cost_per_1m_input_usd: 5,
      cost_per_1m_output_usd: 30,
      context_window: 400000,
      votes: 12000,
      source: 'snapshot',
      fetched_at: fetchedAt,
    },
    {
      model: 'Fixture Model B',
      provider: 'Anthropic',
      arena_score: 1470,
      ci_low: 1455,
      ci_high: 1485,
      open_source: true,
      license: 'MIT',
      cost_per_1m_input_usd: 1,
      cost_per_1m_output_usd: 5,
      context_window: 200000,
      votes: 9000,
      source: 'snapshot',
      fetched_at: fetchedAt,
    },
    {
      model: 'Fixture Model C',
      provider: 'Meta',
      arena_score: 1420,
      ci_low: 1400,
      ci_high: 1440,
      open_source: true,
      license: 'CC-BY-NC',
      context_window: 128000,
      votes: 4000,
      source: 'snapshot',
      fetched_at: fetchedAt,
    },
  ];
  return { rows };
});

vi.mock('./benchmarkData', () => ({
  fetchBenchmarks: vi.fn(async () => ({
    rows: mocks.rows,
    fromSnapshot: true,
    reason: 'network blocked',
  })),
  isSupportedProvider: () => false,
}));

vi.mock('@/stores/auth', () => {
  const setDefaultProvider = vi.fn();
  const useAuthStore = Object.assign(
    (selector: (state: { setDefaultProvider: typeof setDefaultProvider }) => unknown) =>
      selector({ setDefaultProvider }),
    { getState: () => ({ setDefaultProvider }) },
  );
  return { useAuthStore };
});

import { BenchmarksPage } from './BenchmarksPage';

const MONO_PILL_GATES = [
  '[html[data-theme=monochrome]_&]:bg-none',
  '[html[data-theme=monochrome]_&]:bg-border-mid',
];
const MONO_SWITCH_THUMB_GATE = '[html[data-theme=monochrome]_&_span]:shadow-none';

async function renderLoadedPage() {
  const view = render(<BenchmarksPage />);
  await screen.findByText('from snapshot');
  return view;
}

describe('BenchmarksPage MonoChrome appearance', () => {
  afterEach(cleanup);

  it('gates every rendered severity-pill gradient under the benchmarks route', async () => {
    const { container } = await renderLoadedPage();
    const route = container.querySelector<HTMLElement>('[data-monochrome-route="benchmarks"]');
    expect(route).not.toBeNull();

    const pills = Array.from(route!.querySelectorAll<HTMLElement>('.sev-pill'));
    // Header "from snapshot" chip plus one license pill per fixture row.
    expect(pills.length).toBe(4);
    for (const pill of pills) {
      for (const gate of MONO_PILL_GATES) {
        expect(pill.className).toContain(gate);
      }
      expect(pill.className).toMatch(/(?:^|\s)sev-pill(?:\s|$)/u);
      expect(pill.className).toMatch(/(?:^|\s)(?:low|med|high|info)(?:\s|$)/u);
    }
  });

  it('gates the filters-row Switch thumb shadow without removing the control', async () => {
    await renderLoadedPage();
    const toggle = screen.getByRole('switch');
    expect(toggle.className).toContain(MONO_SWITCH_THUMB_GATE);
    expect(screen.getByText('Open source only')).toBeTruthy();
  });

  it('links the visible open-source label to the usable filter switch', async () => {
    await renderLoadedPage();

    const toggle = screen.getByRole('switch', { name: 'Open source only' });
    const labelId = toggle.getAttribute('aria-labelledby');
    expect(labelId).not.toBeNull();
    expect(document.getElementById(labelId!)?.textContent?.trim()).toBe('Open source only');

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('preserves ordinary-theme presentation, copy, and benchmark functionality', async () => {
    const { container } = await renderLoadedPage();
    const route = container.querySelector<HTMLElement>('[data-monochrome-route="benchmarks"]');
    expect(route).not.toBeNull();
    expect(route!.className).toContain('bg-paper-soft');

    expect(screen.getByRole('heading', { name: 'Benchmarks' })).toBeTruthy();
    expect(screen.getByText('Free public leaderboards. BYOK to run any of them.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByText(/Live fetch failed \(network blocked\)/u)).toBeTruthy();

    const chip = screen.getByText('from snapshot');
    expect(chip.className).toContain('sev-pill');
    expect(chip.className).toContain('med');

    const table = container.querySelector('[data-monochrome-surface="benchmarks-table"]');
    expect(table).not.toBeNull();
    for (const model of ['Fixture Model A', 'Fixture Model B', 'Fixture Model C']) {
      expect(table!.textContent).toContain(model);
    }

    const chart = container.querySelector('[data-monochrome-surface="benchmarks-chart"]');
    expect(chart).not.toBeNull();
    const chartSvg = chart!.querySelector('svg[role="img"]');
    expect(chartSvg?.getAttribute('aria-label')).toBe('Bar chart of top 3 models by arena score');
  });
});
