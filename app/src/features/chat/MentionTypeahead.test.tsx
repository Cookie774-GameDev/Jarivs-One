import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReferenceCatalogEntry } from '@/features/references/referenceCatalog';
import { MentionTypeahead } from './MentionTypeahead';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  });
});

afterAll(() => vi.unstubAllGlobals());

const entries: readonly ReferenceCatalogEntry[] = [
  {
    key: 'agent:agent_builder',
    kind: 'agent',
    entityId: 'agent_builder',
    mention: '@builder',
    label: 'Builder',
    description: 'Builds the selected change',
  },
  {
    key: 'mcp:filesystem',
    kind: 'mcp',
    entityId: 'filesystem',
    mention: '@mcp:filesystem',
    label: 'filesystem',
    description: '2 tools available',
    metadata: 'Connected MCP',
  },
  {
    key: 'plugin:github',
    kind: 'plugin',
    entityId: 'github',
    mention: '@github',
    label: 'GitHub',
    description: 'Repositories and pull requests',
    metadata: 'Developer Tools',
  },
  {
    key: 'artifact:jart_launch-report',
    kind: 'artifact',
    entityId: 'jart_launch-report',
    mention: '@artifact:jart_launch-report',
    label: 'Launch report',
    description: 'Document artifact · Ready',
  },
];

describe('MentionTypeahead', () => {
  it('separates agents, MCPs, plugins, and references with distinct kind icons', () => {
    const { container } = render(
      <MentionTypeahead entries={entries} selectedKey="agent:agent_builder" query="" onSelect={() => {}} />,
    );

    expect(screen.getByRole('group', { name: 'Agents' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'MCPs' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Plugins' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'References' })).toBeTruthy();
    expect(container.querySelector('[data-reference-kind="agent"] svg')).toBeTruthy();
    expect(container.querySelector('[data-reference-kind="mcp"] svg')).toBeTruthy();
    expect(container.querySelector('[data-reference-kind="plugin"] svg')).toBeTruthy();
    expect(container.querySelector('[data-reference-kind="artifact"] svg')).toBeTruthy();
  });

  it('renders mixed safe references and selects the exact opaque artifact entry', () => {
    const onSelect = vi.fn();
    render(
      <MentionTypeahead
        entries={entries}
        selectedKey="artifact:jart_launch-report"
        query=""
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('@builder')).toBeTruthy();
    expect(screen.getByText('@mcp:filesystem')).toBeTruthy();
    expect(screen.getByText('@github')).toBeTruthy();
    expect(screen.getByText('@artifact:jart_launch-report')).toBeTruthy();
    expect(screen.getByText('Launch report')).toBeTruthy();
    expect(screen.queryByText(/path|credential|content/i)).toBeNull();

    fireEvent.click(screen.getByText('@artifact:jart_launch-report'));
    expect(onSelect).toHaveBeenCalledWith(entries.at(-1));
  });

  it('keeps the empty state truthful for a mixed reference query', () => {
    render(<MentionTypeahead entries={[]} selectedKey="" query="missing" onSelect={() => {}} />);

    expect(screen.getByText(/No references match/u).textContent).toContain('@missing');
  });
});
