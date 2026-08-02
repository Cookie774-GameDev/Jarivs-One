import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/App.tsx', 'utf8');
const workspaceStart = source.indexOf('function WorkspaceRoot()');
const workspaceEnd = source.indexOf('/**\n * App root:', workspaceStart);
const workspace = source.slice(workspaceStart, workspaceEnd);

describe('WorkspaceRoot lazy boundaries', () => {
  it.each(['WhatsNewHost', 'CelebrationHost', 'AmbientHome'])(
    'keeps the directly mounted lazy %s overlay inside a local Suspense boundary',
    (component) => {
      expect(workspace).toMatch(
        new RegExp(
          String.raw`<React\.Suspense fallback=\{null\}>\s*<${component}\s*/>\s*</React\.Suspense>`,
          'u',
        ),
      );
    },
  );
});
