import { describe, expect, it } from 'vitest';
import {
  inferControlledExtension,
  isPathInsideRoot,
  resolveFileRequest,
  resolveProjectDestination,
} from './filePolicy';

describe('file policy', () => {
  it('uses the required destination precedence', () => {
    expect(resolveProjectDestination({
      explicitDestination: 'C:\\Now',
      activeProjectPath: 'C:\\Active',
      conversationDestination: 'C:\\Earlier',
      jarvisRoot: 'C:\\Jarvis',
    })).toEqual({ path: 'C:\\Now', source: 'current-request' });
    expect(resolveProjectDestination({
      conversationDestination: 'C:\\FarmLife',
      jarvisRoot: 'C:\\Jarvis',
    })).toEqual({ path: 'C:\\FarmLife', source: 'conversation' });
    expect(resolveProjectDestination({ jarvisRoot: 'C:\\Jarvis' })).toEqual({
      path: 'C:\\Jarvis\\Projects', source: 'jarvis-projects',
    });
  });

  it('creates a new Markdown file instead of selecting an unrelated file', () => {
    expect(resolveFileRequest('Create a file called dogs with a list of dog breeds.', {
      activeProjectPath: 'C:\\Users\\viper\\projects\\FarmLife',
    })).toMatchObject({
      operation: 'create',
      fileName: 'dogs.md',
      path: 'C:\\Users\\viper\\projects\\FarmLife\\dogs.md',
    });
  });

  it('infers explicit language types and project React conventions', () => {
    expect(inferControlledExtension('Create a Python script named dogs', 'dogs')).toEqual({
      extension: 'py', needsQuestion: false,
    });
    expect(inferControlledExtension('Create a React component named Dogs', 'Dogs', 'typescript')).toEqual({
      extension: 'tsx', needsQuestion: false,
    });
  });

  it('rejects unsupported explicit extensions and validates Windows root boundaries', () => {
    expect(inferControlledExtension('Create dogs.exe', 'dogs.exe')).toEqual({
      extension: '', needsQuestion: true,
    });
    expect(isPathInsideRoot('C:\\Project\\docs\\dogs.md', 'C:\\Project')).toBe(true);
    expect(isPathInsideRoot('C:\\Project-other\\dogs.md', 'C:\\Project')).toBe(false);
  });
});
