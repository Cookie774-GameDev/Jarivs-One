import { describe, expect, it } from 'vitest';
import {
  inferControlledExtension,
  isPathInsideRoot,
  resolveFileRequest,
  resolveProjectDestination,
} from './filePolicy';

describe('file policy', () => {
  it('uses the required destination precedence', () => {
    expect(
      resolveProjectDestination({
        explicitDestination: 'C:\\Now',
        activeProjectPath: 'C:\\Active',
        conversationDestination: 'C:\\Earlier',
        jarvisRoot: 'C:\\Jarvis',
      }),
    ).toEqual({ path: 'C:\\Now', source: 'current-request' });
    expect(
      resolveProjectDestination({
        conversationDestination: 'C:\\FarmLife',
        jarvisRoot: 'C:\\Jarvis',
      }),
    ).toEqual({ path: 'C:\\FarmLife', source: 'conversation' });
    expect(resolveProjectDestination({ jarvisRoot: 'C:\\Jarvis' })).toEqual({
      path: 'C:\\Jarvis\\Projects',
      source: 'jarvis-projects',
    });
  });

  it('creates a new Markdown file instead of selecting an unrelated file', () => {
    expect(
      resolveFileRequest('Create a file called dogs with a list of dog breeds.', {
        activeProjectPath: 'C:\\Users\\viper\\projects\\FarmLife',
      }),
    ).toMatchObject({
      operation: 'create',
      fileName: 'dogs.md',
      path: 'C:\\Users\\viper\\projects\\FarmLife\\dogs.md',
    });
  });

  it('infers explicit language types and project React conventions', () => {
    expect(inferControlledExtension('Create a Python script named dogs', 'dogs')).toEqual({
      extension: 'py',
      needsQuestion: false,
    });
    expect(
      inferControlledExtension('Create a React component named Dogs', 'Dogs', 'typescript'),
    ).toEqual({
      extension: 'tsx',
      needsQuestion: false,
    });
  });

  it('rejects unsupported explicit extensions and validates Windows root boundaries', () => {
    expect(inferControlledExtension('Create dogs.exe', 'dogs.exe')).toEqual({
      extension: '',
      needsQuestion: true,
    });
    expect(isPathInsideRoot('C:\\Project\\docs\\dogs.md', 'C:\\Project')).toBe(true);
    expect(isPathInsideRoot('C:\\Project-other\\dogs.md', 'C:\\Project')).toBe(false);
  });

  it('normalizes dot segments and mixed separators before enforcing drive, UNC, and POSIX roots', () => {
    expect(isPathInsideRoot('C:\\Project\\docs\\..\\dogs.md', 'c:/project/.')).toBe(true);
    expect(isPathInsideRoot('C:\\Project\\..\\private\\dogs.md', 'C:\\Project')).toBe(false);
    expect(isPathInsideRoot('D:\\Project\\dogs.md', 'C:\\Project')).toBe(false);
    expect(
      isPathInsideRoot('\\\\server\\share\\project\\docs\\file.md', '//server/share/project'),
    ).toBe(true);
    expect(
      isPathInsideRoot(
        '\\\\server\\share\\project\\..\\private\\file.md',
        '//server/share/project',
      ),
    ).toBe(false);
    expect(isPathInsideRoot('/workspace/project/docs/../file.md', '/workspace/project')).toBe(true);
    expect(isPathInsideRoot('/workspace/Project/file.md', '/workspace/project')).toBe(false);
  });

  it('rejects relative, control-character, and root-escaping paths', () => {
    expect(isPathInsideRoot('project/file.md', 'project')).toBe(false);
    expect(isPathInsideRoot('C:', 'C:\\')).toBe(false);
    expect(isPathInsideRoot('C:\\Project\\file.md', 'C:')).toBe(false);
    expect(isPathInsideRoot('\\workspace\\file.md', '/workspace')).toBe(false);
    expect(isPathInsideRoot('/workspace\\file.md', '/workspace')).toBe(false);
    expect(isPathInsideRoot('C:\\Project\\file.md\n', 'C:\\Project')).toBe(false);
    expect(isPathInsideRoot('/../../etc/passwd', '/workspace')).toBe(false);
  });
});
