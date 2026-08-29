import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { resolveRuntimePlan } from './lib/runtimeProfile';
import axoPreview from './assets/pets/characters/vibespace-axolotl/previews/portrait.png';
import './styles/globals.css';
import './styles/vibespace-theme.css';
import './styles/origami-chat.css';
import './styles/monochrome-theme.css';
import './styles/sakura-theme.css';
import './styles/warm-theme.css';
import './styles/origami-theme.css';

export type PetSurfaceView = 'pet-overlay' | 'pet-mini-panel';

const PetOverlayWindow = React.lazy(() =>
  import('./features/pets/PetOverlayWindow').then((module) => ({
    default: module.PetOverlayWindow,
  })),
);

const PetMiniPanelWindow = React.lazy(() =>
  import('./features/pets/PetMiniPanelWindow').then((module) => ({
    default: module.PetMiniPanelWindow,
  })),
);

function PetBootFallback({ view }: { view: PetSurfaceView }) {
  if (view === 'pet-overlay') {
    return (
      <div
        data-pet-bootstrap-fallback="pet-overlay"
        style={{
          width: 144,
          height: 144,
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
        }}
      >
        <img
          src={axoPreview}
          alt="VibeSpace Pet"
          width={112}
          height={112}
          style={{ width: 112, height: 112, objectFit: 'contain', imageRendering: 'pixelated' }}
        />
      </div>
    );
  }

  return (
    <div
      data-pet-bootstrap-fallback="pet-mini-panel"
      className="flex h-screen w-screen items-center justify-center bg-background text-foreground"
      role="status"
      aria-label="Opening Pet panel"
    >
      <div className="rounded-xl border border-border/70 bg-panel px-4 py-3 text-center shadow-sm">
        <div className="text-sm font-semibold">Pet Panel</div>
        <div className="mt-1 text-xs text-muted-foreground">Opening your workspace…</div>
      </div>
    </div>
  );
}

export function mountPetSurface(rootEl: HTMLElement, view: PetSurfaceView): void {
  const runtimeEffectsEnabled = resolveRuntimePlan().petEnabled;
  const surface =
    view === 'pet-overlay' ? (
      <PetOverlayWindow runtimeEffectsEnabled={runtimeEffectsEnabled} />
    ) : (
      <PetMiniPanelWindow runtimeEffectsEnabled={runtimeEffectsEnabled} />
    );

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <React.Suspense fallback={<PetBootFallback view={view} />}>{surface}</React.Suspense>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
