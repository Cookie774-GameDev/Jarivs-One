import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  validateContextPackageImport,
  type ContextPackageArchiveManifest,
  type ContextPackageEntryReader,
} from './contextPackageImport';

const markdown = new TextEncoder().encode('# Guide\n![Pixel](../assets/pixel.png)');
const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture(): {
  manifest: ContextPackageArchiveManifest;
  read: ContextPackageEntryReader;
  files: Map<string, Uint8Array>;
} {
  const files = new Map([
    ['notes/guide.md', markdown],
    ['assets/pixel.png', png],
  ]);
  const manifest: ContextPackageArchiveManifest = {
    schemaVersion: 1,
    kind: 'context_package_archive',
    entries: [
      {
        path: 'notes/guide.md',
        kind: 'document',
        mediaType: 'text/markdown',
        compressedSize: 30,
        decompressedSize: markdown.byteLength,
        checksumSha256: sha256(markdown),
      },
      {
        path: 'assets/pixel.png',
        kind: 'asset',
        mediaType: 'image/png',
        compressedSize: 10,
        decompressedSize: png.byteLength,
        checksumSha256: sha256(png),
      },
    ],
    links: [{ sourcePath: 'notes/guide.md', target: '../assets/pixel.png' }],
  };
  return {
    manifest,
    files,
    read: async function* (path) {
      const bytes = files.get(path);
      if (!bytes) throw new Error('missing fixture');
      yield bytes.slice(0, Math.max(1, Math.floor(bytes.length / 2)));
      yield bytes.slice(Math.max(1, Math.floor(bytes.length / 2)));
    },
  };
}

describe('Context package import boundary', () => {
  it('validates a closed manifest, streamed checksums, links, and magic-backed asset types', async () => {
    const { manifest, read } = fixture();
    const result = await validateContextPackageImport(manifest, read);

    expect(result).toMatchObject({
      schemaVersion: 1,
      kind: 'context_package',
      executable: false,
      fileCount: 2,
      totalDecompressedSize: markdown.byteLength + png.byteLength,
      documents: [
        {
          path: 'notes/guide.md',
          markdown: '# Guide\n![Pixel](../assets/pixel.png)',
          renderPlan: { executable: false },
        },
      ],
      assets: [{ path: 'assets/pixel.png', mediaType: 'image/png', byteSize: png.byteLength }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.documents)).toBe(true);
    expect(Object.isFrozen(result.assets)).toBe(true);
  });

  it.each([
    '../escape.md',
    '/absolute.md',
    'C:/device.md',
    '\\\\server\\share.md',
    'notes\\windows.md',
    'notes/%2e%2e/escape.md',
    'notes//empty.md',
  ])('rejects traversal and non-portable archive path %s before reading', async (path) => {
    const { manifest } = fixture();
    manifest.entries[0] = { ...manifest.entries[0]!, path };
    let read = false;
    await expect(
      validateContextPackageImport(manifest, async function* () {
        read = true;
        yield markdown;
      }),
    ).rejects.toThrow(/path/i);
    expect(read).toBe(false);
  });

  it('rejects duplicate paths, unknown schema fields, and excessive file counts', async () => {
    const { manifest, read } = fixture();
    await expect(
      validateContextPackageImport(
        { ...manifest, entries: [...manifest.entries, { ...manifest.entries[0]! }] },
        read,
      ),
    ).rejects.toThrow(/duplicate path/i);
    await expect(
      validateContextPackageImport({ ...manifest, executable: true } as never, read),
    ).rejects.toThrow(/manifest fields/i);
    await expect(
      validateContextPackageImport(
        { ...manifest, entries: Array.from({ length: 1_001 }, () => manifest.entries[0]!) },
        read,
      ),
    ).rejects.toThrow(/file count/i);

    const getter = vi.fn(() => manifest.entries[0]);
    const hostileEntries = [...manifest.entries];
    Object.defineProperty(hostileEntries, 'extra', { enumerable: true, get: getter });
    await expect(
      validateContextPackageImport({ ...manifest, entries: hostileEntries }, read),
    ).rejects.toThrow(/manifest boundary/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it('preflights decompression limits and compression ratios before reading', async () => {
    const { manifest } = fixture();
    let reads = 0;
    const read: ContextPackageEntryReader = async function* () {
      reads += 1;
      yield markdown;
    };
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          entries: [
            {
              ...manifest.entries[0]!,
              compressedSize: 1,
              decompressedSize: 17 * 1024 * 1024,
            },
          ],
          links: [],
        },
        read,
      ),
    ).rejects.toThrow(/decompressed size/i);
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          entries: [
            {
              ...manifest.entries[0]!,
              compressedSize: 1,
              decompressedSize: 2 * 1024 * 1024,
            },
          ],
          links: [],
        },
        read,
      ),
    ).rejects.toThrow(/compression ratio/i);
    expect(reads).toBe(0);
  });

  it('rejects streamed size/checksum mismatches and executable or spoofed asset types', async () => {
    const { manifest, read, files } = fixture();
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          entries: [
            { ...manifest.entries[0]!, decompressedSize: markdown.byteLength - 1 },
            manifest.entries[1]!,
          ],
        },
        read,
      ),
    ).rejects.toThrow(/streamed size/i);
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          entries: [{ ...manifest.entries[0]!, checksumSha256: '0'.repeat(64) }],
          links: [],
        },
        read,
      ),
    ).rejects.toThrow(/checksum/i);

    files.set('assets/pixel.png', new TextEncoder().encode('<script>bad!'));
    await expect(validateContextPackageImport(manifest, read)).rejects.toThrow(/asset signature/i);
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          entries: [manifest.entries[0]!, { ...manifest.entries[1]!, mediaType: 'image/svg+xml' }],
        },
        read,
      ),
    ).rejects.toThrow(/asset type/i);
  });

  it('requires declared links to exactly match safe document links and resolve inside the package', async () => {
    const { manifest, read } = fixture();
    await expect(validateContextPackageImport({ ...manifest, links: [] }, read)).rejects.toThrow(
      /link manifest/i,
    );
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          links: [{ sourcePath: 'notes/guide.md', target: '../../outside.png' }],
        },
        read,
      ),
    ).rejects.toThrow(/link target/i);
    await expect(
      validateContextPackageImport(
        {
          ...manifest,
          links: [{ sourcePath: 'notes/guide.md', target: '../assets/missing.png' }],
        },
        read,
      ),
    ).rejects.toThrow(/missing link target/i);

    const unsafe = new TextEncoder().encode('[Run](javascript:alert(1))');
    const unsafeManifest: ContextPackageArchiveManifest = {
      ...manifest,
      entries: [
        {
          ...manifest.entries[0]!,
          compressedSize: unsafe.byteLength,
          decompressedSize: unsafe.byteLength,
          checksumSha256: sha256(unsafe),
        },
      ],
      links: [],
    };
    await expect(
      validateContextPackageImport(unsafeManifest, async function* () {
        yield unsafe;
      }),
    ).rejects.toThrow(/link target/i);

    for (const source of [
      '# A\n[[Missing Note]]',
      '# A\n![[Missing Embed]]',
      '[Credentials](https://user:password@example.com/private)',
    ]) {
      const bytes = new TextEncoder().encode(source);
      await expect(
        validateContextPackageImport(
          {
            ...manifest,
            entries: [
              {
                ...manifest.entries[0]!,
                compressedSize: bytes.byteLength,
                decompressedSize: bytes.byteLength,
                checksumSha256: sha256(bytes),
              },
            ],
            links: [],
          },
          async function* () {
            yield bytes;
          },
        ),
      ).rejects.toThrow(/link target|link manifest/i);
    }
  });

  it('accepts declared wiki links and embeds only when they resolve uniquely inside the package', async () => {
    const source = new TextEncoder().encode('[[Target Note]]\n![[Target Note#Details]]');
    const target = new TextEncoder().encode('# Target Note\n## Details');
    const files = new Map([
      ['notes/source.md', source],
      ['notes/Target Note.md', target],
    ]);
    const entries = [...files].map(([path, bytes]) => ({
      path,
      kind: 'document' as const,
      mediaType: 'text/markdown',
      compressedSize: bytes.byteLength,
      decompressedSize: bytes.byteLength,
      checksumSha256: sha256(bytes),
    }));
    const result = await validateContextPackageImport(
      {
        schemaVersion: 1,
        kind: 'context_package_archive',
        entries,
        links: [
          { sourcePath: 'notes/source.md', target: '[[Target Note]]' },
          { sourcePath: 'notes/source.md', target: '![[Target Note#Details]]' },
        ],
      },
      async function* (path) {
        yield files.get(path)!;
      },
    );
    expect(result.fileCount).toBe(2);
    expect(result.documents.map(({ path }) => path)).toEqual([
      'notes/source.md',
      'notes/Target Note.md',
    ]);
  });

  it('stops streaming as soon as source references exceed manifest cardinality', async () => {
    const first = new TextEncoder().encode('![A](asset.png)');
    const second = new TextEncoder().encode('![B](asset.png)');
    const files = new Map([
      ['a.md', first],
      ['b.md', second],
      ['asset.png', png],
    ]);
    const reads: string[] = [];
    await expect(
      validateContextPackageImport(
        {
          schemaVersion: 1,
          kind: 'context_package_archive',
          entries: [
            ...['a.md', 'b.md'].map((path) => ({
              path,
              kind: 'document' as const,
              mediaType: 'text/markdown',
              compressedSize: files.get(path)!.byteLength,
              decompressedSize: files.get(path)!.byteLength,
              checksumSha256: sha256(files.get(path)!),
            })),
            {
              path: 'asset.png',
              kind: 'asset',
              mediaType: 'image/png',
              compressedSize: png.byteLength,
              decompressedSize: png.byteLength,
              checksumSha256: sha256(png),
            },
          ],
          links: [{ sourcePath: 'a.md', target: 'asset.png' }],
        },
        async function* (path) {
          reads.push(path);
          yield files.get(path)!;
        },
      ),
    ).rejects.toThrow(/link manifest/i);
    expect(reads).toEqual(['a.md', 'b.md']);
  });
});
