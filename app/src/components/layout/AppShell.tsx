import * as React from 'react';
import { AnimatePresence, MotionConfig, type Transition } from 'motion/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resolveTheme, useUIStore } from '@/stores/ui';
import { SakuraBackdrop } from '@/features/appearance/sakura';
import { useThemeMotionTransition } from '@/features/appearance/themeMotion';
import { TopBar } from './TopBar';
import { NavPane } from './NavPane';
import { Inspector } from './Inspector';
import { TabStrip } from './TabStrip';
import { CouncilActivityStrip } from './ActivityStrip';
import { isWorkbenchDetachedSearch } from '@/features/workbench/window';
import './sakura-shell.css';

interface AppShellProps {
  children: React.ReactNode;
}

const LEGACY_SHELL_TRANSITION = Object.freeze({
  type: 'spring',
  stiffness: 400,
  damping: 30,
} as const) satisfies Transition;

/**
 * AppShell - the chrome of the entire desktop app.
 *
 * Composition:
 *   TopBar (40px)
 *   +- NavPane (animated 240/56)  | center column                     | Inspector (slides)
 *                                 | TabStrip (32px)                   |
 *                                 | <main>{children}</main>           |
 *                                 | ActivityStrip (32px, council only)|
 *
 * Detached Workbench windows (`?workbench=1`) render children full-bleed
 * without main-app chrome so Workbench owns the entire native window.
 *
 * The shell does not decide which canvas is active - children are slotted
 * by the caller. The shell wires global hotkeys for nav / inspector /
 * palette / voice / settings.
 *
 * `<MotionConfig reducedMotion="user">` propagates the user's
 * prefers-reduced-motion preference to every motion primitive in the tree.
 * Combined with the global CSS rule in globals.css this gives full
 * accessibility coverage.
 */
export function AppShell({ children }: AppShellProps) {
  const inspectorOpen = useUIStore((s) => s.inspectorOpen);
  const chatMode = useUIStore((s) => s.chatMode);
  const route = useUIStore((s) => s.route);
  const theme = useUIStore((s) => s.theme);
  const sakuraActive = resolveTheme(theme) === 'sakura';
  const workbenchFullscreen = route === 'workbench' || isWorkbenchDetachedSearch();
  const themeMotionTransition = useThemeMotionTransition(LEGACY_SHELL_TRANSITION);

  // Workbench owns the entire app chrome (full screen surface).
  if (workbenchFullscreen) {
    return (
      <MotionConfig reducedMotion="user" transition={themeMotionTransition}>
        <TooltipProvider delayDuration={400}>
          <div
            className={
              sakuraActive
                ? 'relative isolate flex h-full w-full flex-col overflow-hidden bg-transparent text-foreground'
                : 'flex h-full w-full flex-col bg-background text-foreground'
            }
            data-monochrome-surface="app-shell"
            data-sakura-shell={sakuraActive ? 'true' : undefined}
            data-workbench-fullscreen="true"
            data-workbench-detached={isWorkbenchDetachedSearch() ? 'true' : 'false'}
          >
            {sakuraActive && <SakuraBackdrop route={route} />}
            <div
              className={
                sakuraActive
                  ? 'sakura-shell-frame relative z-10 flex min-h-0 min-w-0 flex-1 flex-col'
                  : 'contents'
              }
              data-sakura-shell-frame={sakuraActive ? 'true' : undefined}
              data-sakura-shell-boundary={sakuraActive ? 'workbench' : undefined}
            >
              <main
                aria-label="Workbench window"
                className="min-h-0 min-w-0 flex-1 overflow-hidden"
                data-sakura-workspace={sakuraActive ? 'true' : undefined}
              >
                {children}
              </main>
            </div>
          </div>
        </TooltipProvider>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user" transition={themeMotionTransition}>
      <TooltipProvider delayDuration={400}>
        <div
          className={
            sakuraActive
              ? 'relative isolate flex h-full w-full flex-col overflow-hidden bg-transparent text-foreground'
              : 'flex h-full w-full flex-col bg-background text-foreground'
          }
          data-monochrome-surface="app-shell"
          data-sakura-shell={sakuraActive ? 'true' : undefined}
        >
          {sakuraActive && <SakuraBackdrop route={route} />}
          <div
            className={
              sakuraActive
                ? 'sakura-shell-frame relative z-10 flex min-h-0 min-w-0 flex-1 flex-col'
                : 'contents'
            }
            data-sakura-shell-frame={sakuraActive ? 'true' : undefined}
            data-sakura-shell-boundary={sakuraActive ? 'application' : undefined}
          >
            <TopBar />

            <div
              className={
                sakuraActive
                  ? 'sakura-shell-body relative flex min-h-0 min-w-0 flex-1'
                  : 'flex min-h-0 flex-1'
              }
              data-sakura-shell-body={sakuraActive ? 'true' : undefined}
            >
              <NavPane />

              <div className="flex min-w-0 flex-1 flex-col">
                <TabStrip />
                <main
                  aria-label="Workspace"
                  className="min-h-0 min-w-0 flex-1 overflow-auto"
                  data-sakura-workspace={sakuraActive ? 'true' : undefined}
                >
                  {children}
                </main>
                {chatMode === 'council' && <CouncilActivityStrip />}
              </div>

              <AnimatePresence initial={false}>
                {inspectorOpen && <Inspector key="inspector" />}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
