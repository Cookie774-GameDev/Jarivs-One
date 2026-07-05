import type { ProviderId } from '@/types';
import { stepsForPreset } from './stacks/presets';
import type { StackPresetId } from './stacks/types';

export const IMAGE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export interface ChatImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  sourcePath?: string;
  size?: number;
}

type VisionSelection =
  | { mode: 'none' }
  | { mode: 'single'; providerId: ProviderId; modelId: string }
  | { mode: 'hive'; hiveId: Exclude<StackPresetId, 'off'> };

export function imageExtension(pathOrName: string): string {
  const clean = pathOrName.split(/[?#]/)[0] ?? pathOrName;
  const match = clean.match(/\.([A-Za-z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? '';
}

export function imageMimeTypeForPath(pathOrName: string): string | null {
  return IMAGE_MIME_BY_EXTENSION[imageExtension(pathOrName)] ?? null;
}

export function isSupportedImagePath(pathOrName: string): boolean {
  return imageMimeTypeForPath(pathOrName) !== null;
}

export function modelSupportsVision(provider: ProviderId, modelId: string): boolean {
  const model = modelId.toLowerCase();
  switch (provider) {
    case 'google':
      return model.includes('gemini');
    case 'openai':
      return (
        model.includes('gpt-4o') ||
        model.includes('gpt-4.1') ||
        model.includes('gpt-5') ||
        model.includes('vision')
      );
    case 'anthropic':
      return model.includes('claude-3') || model.includes('claude-sonnet') || model.includes('claude-opus') || model.includes('claude-fable');
    case 'openrouter':
      return (
        model.includes('gemini') ||
        model.includes('claude-3') ||
        model.includes('gpt-4o') ||
        model.includes('gpt-4.1') ||
        model.includes('vision')
      );
    default:
      return false;
  }
}

export function selectionSupportsVision(
  selection: VisionSelection,
  customSteps: Parameters<typeof stepsForPreset>[2],
): boolean {
  if (selection.mode === 'single') {
    return modelSupportsVision(selection.providerId, selection.modelId);
  }
  if (selection.mode === 'hive') {
    const steps = stepsForPreset(selection.hiveId as Exclude<StackPresetId, 'off'>, 'general', customSteps);
    return steps.length > 0 && steps.every((step) => modelSupportsVision(step.provider, step.model));
  }
  return false;
}

export function describeVisionRequirement(selection: VisionSelection): string {
  if (selection.mode === 'hive') {
    return 'Hive Balanced cannot use image attachments yet because every pipeline step must support vision.';
  }
  if (selection.mode === 'single') {
    return 'The selected model cannot see images. Choose Gemini, GPT-4o/4.1/5, Claude 3+, or a vision-capable OpenRouter model.';
  }
  return 'Choose a vision-capable model before attaching images.';
}

