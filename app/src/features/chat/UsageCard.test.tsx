import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageCard } from './UsageCard';
import type { UsageSnapshot } from '@/lib/usage/usageTypes';

const snapshot: UsageSnapshot = {
  connectionId: 'openai-codex', providerId: 'openai', providerName: 'Codex CLI',
  mode: 'external-cli', authSource: 'codex-cli-session', capturedAt: 1,
  currentChat: {
    inputTokens: { value: 8, unit: 'tokens', provenance: 'response-metadata' },
    outputTokens: { value: 3, unit: 'tokens', provenance: 'response-metadata' },
    totalTokens: { value: 11, unit: 'tokens', provenance: 'local-exact' },
    costUsd: { unit: 'usd', provenance: 'unavailable', reason: 'Not reported.' },
    requests: { value: 1, unit: 'requests', provenance: 'local-exact' },
  },
  providerPeriod: { unit: 'tokens', provenance: 'unavailable', reason: 'Not requested.' },
  quota: { unit: 'percent', provenance: 'unavailable', reason: 'No approved quota surface.' },
};

describe('UsageCard', () => {
  it('renders exact provenance and unavailable quota without a zero', () => {
    render(<UsageCard snapshots={[snapshot]} scope="connection" />);
    expect(screen.getByText('Codex CLI')).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText(/No approved quota surface/)).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });
});
