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
import { PetMiniPanelWindow } from './features/pets/PetMiniPanelWindow';
import { PetOverlayWindow } from './features/pets/PetOverlayWindow';
import { resolveRuntimePlan } from './lib/runtimeProfile';
import './styles/globals.css';
import './styles/vibespace-theme.css';
import './styles/origami-chat.css';
import './styles/monochrome-theme.css';
import './styles/sakura-theme.css';
import './styles/warm-theme.css';
import './styles/origami-theme.css';

export type PetSurfaceView = 'pet-overlay' | 'pet-mini-panel';

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
      <ErrorBoundary>{surface}</ErrorBoundary>
    </React.StrictMode>,
  );
}
