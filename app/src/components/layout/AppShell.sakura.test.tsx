import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/ui';

vi.mock('./TopBar', () => ({ TopBar: () => <div data-testid="top-bar" /> }));
vi.mock('./NavPane', () => ({ NavPane: () => <div data-testid="nav-pane" /> }));
vi.mock('./Inspector', () => ({ Inspector: () => <div data-testid="inspector" /> }));
vi.mock('./TabStrip', () => ({ TabStrip: () => <div data-testid="tab-strip" /> }));
vi.mock('./ActivityStrip', () => ({ CouncilActivityStrip: () => <div /> }));
vi.mock('@/features/workbench/window', () => ({ isWorkbenchDetachedSearch: () => false }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AppShell } from './AppShell';

describe('AppShell Sakura scenic host', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({ route: 'chat', theme: 'default' });
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('mounts only for resolved Sakura and preserves the exact route DOM object across switching', () => {
    const routeObject = { stable: true };
    function RouteFixture() {
      const object = React.useRef(routeObject);
      return <section data-route-object={object.current === routeObject ? 'stable' : 'replaced'} />;
    }

    const rendered = render(
      <AppShell>
        <RouteFixture />
      </AppShell>,
    );
    const shellFrame = rendered.container.querySelector('[data-sakura-shell-frame]');
    const shellBody = rendered.container.querySelector('[data-sakura-shell-body]');
    const routeElement = rendered.container.querySelector('[data-route-object]');
    const routeSetter = useUIStore.getState().setRoute;
    const navSectionIdentity = useUIStore.getState().navSectionsCollapsed;
    expect(rendered.container.querySelector('[data-sakura-backdrop]')).toBeNull();

    act(() => useUIStore.getState().setTheme('sakura'));
    expect(rendered.container.querySelector('[data-sakura-backdrop]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-sakura-shell-frame]')).toBe(shellFrame);
    expect(rendered.container.querySelector('[data-sakura-shell-body]')).toBe(shellBody);
    expect(rendered.container.querySelector('[data-route-object]')).toBe(routeElement);
    expect(useUIStore.getState().setRoute).toBe(routeSetter);
    expect(useUIStore.getState().navSectionsCollapsed).toBe(navSectionIdentity);

    act(() => useUIStore.getState().setTheme('monochrome'));
    expect(rendered.container.querySelector('[data-sakura-backdrop]')).toBeNull();
    expect(rendered.container.querySelector('[data-sakura-shell-frame]')).toBe(shellFrame);
    expect(rendered.container.querySelector('[data-sakura-shell-body]')).toBe(shellBody);
    expect(rendered.container.querySelector('[data-route-object]')).toBe(routeElement);
    expect(useUIStore.getState().setRoute).toBe(routeSetter);
    expect(useUIStore.getState().navSectionsCollapsed).toBe(navSectionIdentity);
  });

  it('keeps scenic reveal, chrome, and workspace as separate structural boundaries', () => {
    useUIStore.setState({ inspectorOpen: true, theme: 'sakura' });
    const rendered = render(
      <AppShell>
        <section data-route-fixture />
      </AppShell>,
    );

    const shell = rendered.container.querySelector('[data-sakura-shell="true"]');
    const backdrop = shell?.querySelector(':scope > [data-sakura-backdrop]');
    const frame = shell?.querySelector(':scope > [data-sakura-shell-frame="true"]');
    const body = frame?.querySelector('[data-sakura-shell-body="true"]');
    const workspace = body?.querySelector('main[data-sakura-workspace="true"]');

    expect(backdrop).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('class')).toContain('sakura-shell-frame');
    expect(body?.getAttribute('class')).toContain('sakura-shell-body');
    expect(workspace?.querySelector('[data-route-fixture]')).not.toBeNull();
    expect(body?.querySelector('[data-testid="nav-pane"]')).not.toBeNull();
    expect(body?.querySelector('[data-testid="inspector"]')).not.toBeNull();
  });

  it('maps route changes to visual intensity without remounting route content', () => {
    const rendered = render(
      <AppShell>
        <section data-route-fixture />
      </AppShell>,
    );
    act(() => useUIStore.getState().setTheme('sakura'));
    const routeElement = rendered.container.querySelector('[data-route-fixture]');
    expect(
      rendered.container
        .querySelector('[data-sakura-backdrop]')
        ?.getAttribute('data-sakura-intensity'),
    ).toBe('open');

    act(() => useUIStore.setState({ route: 'terminal' }));
    expect(
      rendered.container
        .querySelector('[data-sakura-backdrop]')
        ?.getAttribute('data-sakura-intensity'),
    ).toBe('quiet');
    expect(rendered.container.querySelector('[data-route-fixture]')).toBe(routeElement);
  });

  it('keeps the scenic sibling behind the full-screen Workbench boundary', () => {
    useUIStore.setState({ route: 'workbench', theme: 'sakura' });
    const rendered = render(
      <AppShell>
        <section data-workbench-fixture />
      </AppShell>,
    );

    const shell = rendered.container.querySelector('[data-workbench-fullscreen="true"]');
    const backdrop = shell?.querySelector('[data-sakura-backdrop]');
    const main = shell?.querySelector('main[aria-label="Workbench window"]');
    const frame = shell?.querySelector('[data-sakura-shell-frame="true"]');

    expect(backdrop?.getAttribute('data-sakura-intensity')).toBe('standard');
    expect(backdrop?.getAttribute('class')).toContain('z-0');
    expect(frame?.getAttribute('data-sakura-shell-boundary')).toBe('workbench');
    expect(main?.parentElement?.getAttribute('class')).toContain('z-10');
    expect(main?.querySelector('[data-workbench-fixture]')).not.toBeNull();
  });
});
