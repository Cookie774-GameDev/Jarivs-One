import type { LLMContentPart } from '@/lib/ai/types';
import {
  IMAGE_ATTACHMENT_MAX_BYTES,
  modelSupportsVision,
  type ChatImageAttachment,
} from '@/lib/ai/vision';
import type { ResolvedPromptForgeModel } from './modelSelection';

const MAX_PROMPT_FORGE_IMAGES = 6;
const MAX_ENCODED_IMAGE_BYTES = Math.ceil(IMAGE_ATTACHMENT_MAX_BYTES / 3) * 4;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const UNSAFE_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

export type PromptForgeImageErrorCode =
  | 'invalid_image'
  | 'image_model_unsupported'
  | 'image_transport_unsupported';

export class PromptForgeImageError extends Error {
  constructor(readonly code: PromptForgeImageErrorCode) {
    super(
      code === 'invalid_image'
        ? 'A Prompt Forge image attachment is invalid. Remove it and attach it again.'
        : code === 'image_transport_unsupported'
          ? 'This provider connection cannot send image bytes. Choose a native vision-capable provider model.'
          : 'This Prompt Forge model cannot process images. Choose a vision-capable model.',
    );
    this.name = 'PromptForgeImageError';
  }
}

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim().length > 0 &&
    !UNSAFE_TEXT.test(value)
  );
}

function base64Shape(value: unknown): Readonly<{
  value: string;
  contentLength: number;
  byteLength: number;
}> {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ENCODED_IMAGE_BYTES ||
    value.length % 4 !== 0
  ) {
    throw new PromptForgeImageError('invalid_image');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const contentLength = value.length - padding;
  const byteLength = (value.length / 4) * 3 - padding;
  if (byteLength <= 0 || byteLength > IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new PromptForgeImageError('invalid_image');
  }
  return Object.freeze({ value, contentLength, byteLength });
}

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

function decodedPrefix(shape: ReturnType<typeof base64Shape>): readonly number[] {
  const bytes: number[] = [];
  for (let offset = 0; offset < shape.value.length && bytes.length < 12; offset += 4) {
    const first = base64Value(shape.value.charCodeAt(offset));
    const second = base64Value(shape.value.charCodeAt(offset + 1));
    const third = base64Value(shape.value.charCodeAt(offset + 2));
    const fourth = base64Value(shape.value.charCodeAt(offset + 3));
    bytes.push((first << 2) | (second >> 4));
    if (third >= 0) bytes.push(((second & 15) << 4) | (third >> 2));
    if (fourth >= 0) bytes.push(((third & 3) << 6) | fourth);
  }
  return bytes;
}

function validateBase64Bytes(shape: ReturnType<typeof base64Shape>, mimeType: string): void {
  for (let index = 0; index < shape.value.length; index += 1) {
    const code = shape.value.charCodeAt(index);
    if (index < shape.contentLength ? base64Value(code) < 0 : code !== 61) {
      throw new PromptForgeImageError('invalid_image');
    }
  }
  const bytes = decodedPrefix(shape);
  const signatureMatches =
    mimeType === 'image/png'
      ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (byte, index) => bytes[index] === byte,
        )
      : mimeType === 'image/jpeg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : mimeType === 'image/gif'
          ? ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))
          : mimeType === 'image/webp'
            ? String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
              String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
            : false;
  if (!signatureMatches) {
    throw new PromptForgeImageError('invalid_image');
  }
}

function imageShape(image: ChatImageAttachment): ReturnType<typeof base64Shape> {
  if (
    !image ||
    typeof image !== 'object' ||
    !safeText(image.id, 256) ||
    !safeText(image.name, 500) ||
    !SUPPORTED_IMAGE_MIME_TYPES.has(image.mimeType)
  ) {
    throw new PromptForgeImageError('invalid_image');
  }
  const shape = base64Shape(image.data);
  if (
    image.size !== undefined &&
    (!Number.isSafeInteger(image.size) || image.size <= 0 || image.size !== shape.byteLength)
  ) {
    throw new PromptForgeImageError('invalid_image');
  }
  return shape;
}

function validateImage(image: ChatImageAttachment): Readonly<LLMContentPart> {
  const shape = imageShape(image);
  validateBase64Bytes(shape, image.mimeType);
  return Object.freeze({
    type: 'image' as const,
    data: image.data,
    mimeType: image.mimeType,
    name: image.name,
  });
}

function validatePromptForgeImageEligibility(
  images: readonly ChatImageAttachment[],
  model: ResolvedPromptForgeModel,
): void {
  if (!Array.isArray(images) || images.length > MAX_PROMPT_FORGE_IMAGES) {
    throw new PromptForgeImageError('invalid_image');
  }
  if (images.length === 0) return;
  if (
    model.connectionMode !== 'native-api' ||
    model.connectionId === null ||
    model.connectionId.trim().length === 0
  ) {
    throw new PromptForgeImageError('image_transport_unsupported');
  }
  if (!modelSupportsVision(model.providerId, model.modelId)) {
    throw new PromptForgeImageError('image_model_unsupported');
  }
  for (const image of images) imageShape(image);
}

export function preparePromptForgeImageParts(
  images: readonly ChatImageAttachment[],
  model: ResolvedPromptForgeModel,
): readonly LLMContentPart[] {
  validatePromptForgeImageEligibility(images, model);
  if (images.length === 0) return Object.freeze([]);
  return Object.freeze(images.map(validateImage));
}

export function promptForgeImageDisabledReason(
  images: readonly ChatImageAttachment[],
  model: ResolvedPromptForgeModel,
): string | null {
  try {
    validatePromptForgeImageEligibility(images, model);
    return null;
  } catch (error) {
    return error instanceof PromptForgeImageError
      ? error.message
      : 'Remove the invalid image attachment and attach it again.';
  }
}
