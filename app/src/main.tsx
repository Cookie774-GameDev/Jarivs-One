import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted fonts (bundled by Vite). The app previously pulled these from
// fonts.googleapis.com, but the production CSP (style-src 'self') blocks that
// stylesheet in the installed build — every terminal then silently fell back
// to Courier New, which renders bitmap-like ("pixelated") on Windows. Bundling
// locally guarantees the real fonts load in production, offline, with no FOUT.
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
import { App } from './App';
import './styles/globals.css';
import './styles/vibespace-theme.css';
import './styles/monochrome-theme.css';
import './features/workbench/registerCommandActions';
import { applyThemeToDocument, useUIStore } from './stores/ui';
import { startThemeSync } from './features/appearance/themeSync';

startThemeSync((theme) => {
  applyThemeToDocument(theme);
  useUIStore.setState({ theme });
});

// Mark pet-overlay BEFORE first paint so globals.css can suppress body bg.
// Without this, body { @apply bg-background } paints an opaque rectangle
// behind the transparent Pixi canvas in the pet-overlay WebView.
const bootView = new URLSearchParams(window.location.search).get('view');
if (bootView === 'pet-overlay') {
  document.documentElement.dataset.vibespaceView = 'pet-overlay';
  document.documentElement.style.background = 'transparent';
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.backgroundColor = 'transparent';
  document.body.style.backgroundImage = 'none';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}
if (bootView === 'pet-overlay') {
  rootEl.style.background = 'transparent';
  rootEl.style.backgroundColor = 'transparent';
  rootEl.style.margin = '0';
  rootEl.style.padding = '0';
  rootEl.style.overflow = 'hidden';
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
