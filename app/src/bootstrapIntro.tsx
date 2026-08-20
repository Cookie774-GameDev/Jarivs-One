import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColdStartIntroView } from './features/cold-start-intro';

/** Dedicated intro window: no App, fonts, or theme CSS. */
export function mountColdStartIntro(rootEl: HTMLElement): void {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ColdStartIntroView />
    </React.StrictMode>,
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  mountColdStartIntro(rootEl);
}
