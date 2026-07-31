import React from 'react';
import { MonochromeFixtureController, RuntimeProfileHandshakeGate } from './App';
import {
  parseMonochromeFixtureRequest,
  resolveRuntimePlan,
  resolveRuntimeProfileHandshakeExpectation,
} from './lib/runtimeProfile';
import type { DevelopmentSurface } from './developmentSurface';

const DevMonochromeWorkbench = React.lazy(() =>
  import('./features/appearance/MonochromeWorkbench').then(({ MonochromeWorkbench }) => ({
    default: MonochromeWorkbench,
  })),
);

const DevSakuraStyleBoard = React.lazy(() =>
  import('./features/appearance/sakura/SakuraStyleBoardFixture').then(
    ({ SakuraStyleBoardFixture }) => ({
      default: SakuraStyleBoardFixture,
    }),
  ),
);

function EvidenceBoundary({ children }: { children: React.ReactNode }) {
  const plan = resolveRuntimePlan();
  const expectation = resolveRuntimeProfileHandshakeExpectation(plan);
  const request = parseMonochromeFixtureRequest(
    plan,
    new URLSearchParams(window.location.search),
    window.location.pathname,
  );

  return (
    <RuntimeProfileHandshakeGate plan={plan} expectation={expectation}>
      <MonochromeFixtureController plan={plan} request={request}>
        {children}
      </MonochromeFixtureController>
    </RuntimeProfileHandshakeGate>
  );
}

export default function DevelopmentEntry({
  surface: requestedSurface,
}: {
  surface: DevelopmentSurface;
}) {
  const sakuraStyleBoardRequested = requestedSurface === 'sakura';
  const entry = (
    <React.Suspense fallback={null}>
      {sakuraStyleBoardRequested ? <DevSakuraStyleBoard /> : <DevMonochromeWorkbench />}
    </React.Suspense>
  );

  if (sakuraStyleBoardRequested) return entry;

  return import.meta.env.VITE_VIBESPACE_RUNTIME_PROFILE === undefined ? (
    entry
  ) : (
    <EvidenceBoundary>{entry}</EvidenceBoundary>
  );
}
