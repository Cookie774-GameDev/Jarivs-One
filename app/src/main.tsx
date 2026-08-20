const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}

const viewParam = new URLSearchParams(window.location.search).get('view');

if (viewParam === 'cold-start-intro') {
  void import('./bootstrapIntro').then(({ mountColdStartIntro }) => {
    mountColdStartIntro(rootEl);
  });
} else {
  void import('./bootstrapApp').then(({ mountApp }) => {
    mountApp(rootEl);
  });
}
