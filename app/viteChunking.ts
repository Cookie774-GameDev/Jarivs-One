export function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    if (id.includes('/src/lib/ai/providers/')) return 'ai-providers';
    return undefined;
  }

  if (id.includes('/gpt-tokenizer/') && id.includes('o200k_base')) {
    return 'gpt-o200k';
  }

  const match = id.match(/node_modules\/(?:\.pnpm\/)?(@[^/]+\/[^/]+|[^/]+)/);
  const packageName = match ? match[1] : null;
  if (!packageName) return undefined;

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
    return 'react';
  }
  if (packageName === 'motion' || packageName === 'framer-motion') return 'motion';
  if (packageName.startsWith('@radix-ui/')) return 'radix';
  if (packageName === 'dexie' || packageName === 'dexie-react-hooks') return 'dexie';
  if (packageName === 'lucide-react') return 'lucide';
  if (packageName === '@supabase/supabase-js' || packageName.startsWith('@supabase/')) {
    return 'supabase';
  }
  if (packageName === 'livekit-client') return 'livekit';
  if (packageName === 'xterm' || packageName.startsWith('xterm-addon-')) return 'xterm';
  if (packageName === 'cmdk') return 'cmdk';
  if (packageName === 'zustand') return 'zustand';
  if (packageName === 'date-fns') return 'date-fns';
  if (
    packageName === 'class-variance-authority' ||
    packageName === 'clsx' ||
    packageName === 'tailwind-merge'
  ) {
    return 'ui-utils';
  }
  return undefined;
}
