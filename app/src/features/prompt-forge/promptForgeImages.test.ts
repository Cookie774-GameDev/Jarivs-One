import { describe, expect, it, vi } from 'vitest';
import { IMAGE_ATTACHMENT_MAX_BYTES, type ChatImageAttachment } from '@/lib/ai/vision';
import type { ResolvedPromptForgeModel } from './modelSelection';
import {
  PromptForgeImageError,
  preparePromptForgeImageParts,
  promptForgeImageDisabledReason,
} from './promptForgeImages';

const nativeVisionModel: ResolvedPromptForgeModel = Object.freeze({
  providerId: 'openai',
  modelId: 'gpt-4o',
  label: 'GPT-4o',
  connectionId: 'openai-api',
  connectionMode: 'native-api',
  local: false,
  billingClass: 'provider_billed',
});

const image: ChatImageAttachment = Object.freeze({
  id: 'image-1',
  name: 'diagram.png',
  mimeType: 'image/png',
  data: 'iVBORw0KGgo=',
  size: 8,
});

describe('Prompt Forge image inputs', () => {
  it('converts validated Composer images into frozen provider content parts', () => {
    const original = structuredClone(image);

    const parts = preparePromptForgeImageParts([image], nativeVisionModel);

    expect(parts).toEqual([
      {
        type: 'image',
        data: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        name: 'diagram.png',
      },
    ]);
    expect(image).toEqual(original);
    expect(Object.isFrozen(parts)).toBe(true);
    expect(Object.isFrozen(parts[0])).toBe(true);
    expect(promptForgeImageDisabledReason([image], nativeVisionModel)).toBeNull();
  });

  it('fails closed when the selected transport cannot carry image bytes', () => {
    const externalCli: ResolvedPromptForgeModel = Object.freeze({
      ...nativeVisionModel,
      modelId: 'gpt-5.6-sol',
      connectionId: 'openai-codex',
      connectionMode: 'external-cli',
      billingClass: 'subscription_connection',
    });
    const local: ResolvedPromptForgeModel = Object.freeze({
      ...nativeVisionModel,
      connectionId: 'ollama-local',
      connectionMode: 'local',
      local: true,
      billingClass: 'local_free',
    });
    const implicit: ResolvedPromptForgeModel = Object.freeze({
      ...nativeVisionModel,
      connectionId: null,
      connectionMode: null,
    });
    const blankConnection: ResolvedPromptForgeModel = Object.freeze({
      ...nativeVisionModel,
      connectionId: '',
    });

    expect(() => preparePromptForgeImageParts([image], externalCli)).toThrowError(
      expect.objectContaining({ code: 'image_transport_unsupported' }),
    );
    expect(() => preparePromptForgeImageParts([image], local)).toThrowError(
      expect.objectContaining({ code: 'image_transport_unsupported' }),
    );
    expect(() => preparePromptForgeImageParts([image], implicit)).toThrowError(
      expect.objectContaining({ code: 'image_transport_unsupported' }),
    );
    expect(() => preparePromptForgeImageParts([image], blankConnection)).toThrowError(
      expect.objectContaining({ code: 'image_transport_unsupported' }),
    );
    expect(promptForgeImageDisabledReason([image], externalCli)).toMatch(/native.*provider/i);
    expect(promptForgeImageDisabledReason([image], local)).toMatch(/native.*provider/i);
    expect(promptForgeImageDisabledReason([image], implicit)).toMatch(/native.*provider/i);
  });

  it('rejects malformed bytes, MIME mismatches, oversized data, unsafe metadata, and excess', () => {
    const invalidCases: readonly ChatImageAttachment[] = [
      { ...image, data: 'not base64!' },
      { ...image, data: 'aGVsbG8=', size: 5 },
      { ...image, mimeType: 'image/jpeg' },
      { ...image, mimeType: 'image/svg+xml' },
      { ...image, name: 'unsafe\u202epng' },
      {
        ...image,
        data: 'A'.repeat(Math.ceil((IMAGE_ATTACHMENT_MAX_BYTES + 1) / 3) * 4),
        size: IMAGE_ATTACHMENT_MAX_BYTES + 1,
      },
    ];

    for (const invalid of invalidCases) {
      expect(() => preparePromptForgeImageParts([invalid], nativeVisionModel)).toThrowError(
        PromptForgeImageError,
      );
    }
    expect(
      promptForgeImageDisabledReason([{ ...image, mimeType: 'image/svg+xml' }], nativeVisionModel),
    ).toMatch(/attach it again/i);
    expect(
      promptForgeImageDisabledReason([{ ...image, name: 'unsafe\u202epng' }], nativeVisionModel),
    ).toMatch(/attach it again/i);
    expect(() =>
      preparePromptForgeImageParts(
        Array.from({ length: 7 }, (_, index) => ({
          ...image,
          id: `image-${index}`,
        })),
        nativeVisionModel,
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_image' }));
  });

  it('keeps render-time eligibility constant-time and defers byte scanning to dispatch', () => {
    const charCodeAt = vi.spyOn(String.prototype, 'charCodeAt');
    try {
      expect(promptForgeImageDisabledReason([image], nativeVisionModel)).toBeNull();
      expect(charCodeAt).not.toHaveBeenCalled();
    } finally {
      charCodeAt.mockRestore();
    }
  });
});
