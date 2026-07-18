import type { CompiledPromptLayer, JarvisRequestEnvelope } from '@/lib/jarvis/contracts';
import { compileJarvisPrompt } from '@/lib/jarvis/promptCompiler';

export interface JarvisPromptAssemblyResult {
  layers: readonly CompiledPromptLayer[];
  text: string;
  relevantActionIds: readonly string[];
}

/**
 * Compatibility surface for callers already holding the complete immutable
 * request envelope. The protected compiler remains the sole prompt authority.
 */
export function assembleJarvisPromptLayers(
  envelope: Readonly<JarvisRequestEnvelope>,
): Readonly<JarvisPromptAssemblyResult> {
  const compiled = compileJarvisPrompt(envelope);
  return Object.freeze({
    layers: compiled.layers,
    text: compiled.systemText,
    relevantActionIds: Object.freeze([] as string[]),
  });
}
