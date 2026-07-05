import { describe, expect, it } from 'vitest';
import { splitImageFiles } from './imageAttachments';

describe('image attachments', () => {
  it('keeps only image types supported by provider adapters', () => {
    const files = [
      new File(['png'], 'a.png', { type: 'image/png' }),
      new File(['svg'], 'a.svg', { type: 'image/svg+xml' }),
      new File(['bmp'], 'a.bmp', { type: 'image/bmp' }),
      new File(['jpg'], 'a.jpg', { type: 'image/jpeg' }),
    ];

    expect(splitImageFiles(files).map((file) => file.name)).toEqual(['a.png', 'a.jpg']);
  });
});

