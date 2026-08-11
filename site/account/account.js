import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm';
window.vibeCreateClient = createClient;
for (const source of [
  '/account/account-model.js',
  '/account/account-core.js',
  '/account/account-auth.js',
  '/account/account-data.js',
  '/account/account-terminals.js',
  '/account/account-sections.js',
  '/account/account-runtime.js',
]) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${source}`));
    document.head.append(script);
  });
}
