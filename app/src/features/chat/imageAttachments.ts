import { describeFsError, readImageFileBase64 } from '@/lib/fs';
import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  imageMimeTypeForPath,
  isSupportedImagePath,
  type ChatImageAttachment,
} from '@/lib/ai/vision';

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function imageId(seed: string): string {
  return `img_${Date.now().toString(36)}_${Math.abs(hash(seed)).toString(36)}`;
}

function hash(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) {
    out = Math.imul(31, out) + value.charCodeAt(i);
  }
  return out;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export async function imageAttachmentFromBrowserFile(file: File): Promise<ChatImageAttachment> {
  const mimeType = file.type || imageMimeTypeForPath(file.name) || '';
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Only PNG, JPG, WEBP, and GIF images are supported.');
  }
  if (file.size > IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error('Image is too large. Use an image under 8 MB.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const comma = dataUrl.indexOf(',');
  const data = comma === -1 ? '' : dataUrl.slice(comma + 1);
  if (!data) throw new Error('Could not read image data.');
  return {
    id: imageId(`${file.name}:${file.size}`),
    name: file.name || 'image',
    mimeType,
    data,
    size: file.size,
  };
}

export async function imageAttachmentFromPath(path: string): Promise<ChatImageAttachment> {
  if (!isSupportedImagePath(path)) {
    throw new Error('Only PNG, JPG, WEBP, and GIF images are supported.');
  }
  const result = await readImageFileBase64(path);
  if (!result.ok) {
    throw new Error(describeFsError(result.error));
  }
  return {
    id: imageId(`${path}:${result.size}`),
    name: path.split(/[/\\]/).pop() ?? path,
    mimeType: result.mimeType,
    data: result.data,
    sourcePath: path,
    size: result.size,
  };
}

export function splitImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => {
    const mimeType = file.type || imageMimeTypeForPath(file.name) || '';
    return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType);
  });
}

