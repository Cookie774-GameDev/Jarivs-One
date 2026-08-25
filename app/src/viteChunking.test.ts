import { describe, expect, it } from 'vitest';
import { manualChunks } from '../viteChunking';

describe('production chunk boundaries', () => {
  it('isolates only the eagerly reachable o200k tokenizer payload', () => {
    expect(manualChunks('C:/workspace/node_modules/gpt-tokenizer/esm/bpeRanks/o200k_base.js')).toBe(
      'gpt-o200k',
    );
    expect(manualChunks('C:/workspace/node_modules/gpt-tokenizer/esm/encoding/o200k_base.js')).toBe(
      'gpt-o200k',
    );
    expect(
      manualChunks('C:/workspace/node_modules/gpt-tokenizer/esm/bpeRanks/cl100k_base.js'),
    ).toBeUndefined();
  });

  it('preserves the existing stable vendor boundaries', () => {
    expect(manualChunks('C:/workspace/node_modules/react/index.js')).toBe('react');
    expect(manualChunks('C:/workspace/node_modules/@radix-ui/react-dialog/dist/index.js')).toBe(
      'radix',
    );
    expect(manualChunks('C:/workspace/src/lib/ai/providers/openai.ts')).toBe('ai-providers');
  });
});
