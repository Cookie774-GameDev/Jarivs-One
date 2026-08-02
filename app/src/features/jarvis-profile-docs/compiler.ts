import { deterministicHash } from './hash';
import type {
  CompiledPrompt,
  CompiledPromptBlock,
  InstructionBoundary,
  PromptBlockInput,
  PromptBlockType,
  PromptCompilerInput,
} from './types';
import { validateSoulDocument } from './validation';

const ORDER: ReadonlyArray<{
  key: keyof PromptCompilerInput;
  type: PromptBlockType;
}> = [
  { key: 'canonicalResponseSecurity', type: 'canonical_response_security' },
  { key: 'verifiedCapabilities', type: 'verified_capabilities' },
  { key: 'soul', type: 'soul' },
  { key: 'activeProfile', type: 'active_profile' },
  { key: 'user', type: 'user' },
  { key: 'memory', type: 'memory' },
  { key: 'requestConversation', type: 'request_conversation' },
  { key: 'context', type: 'context' },
  { key: 'recall', type: 'recall' },
  { key: 'skills', type: 'skills' },
  { key: 'tools', type: 'tools' },
  { key: 'platformFormatting', type: 'platform_formatting' },
];

const BOUNDED_INSTRUCTION_TYPES = new Set<PromptBlockType>([
  'verified_capabilities',
  'soul',
  'active_profile',
  'request_conversation',
  'skills',
  'platform_formatting',
]);
const INSTRUCTION_TRUST = new Set(['protected', 'verified', 'owner', 'trusted']);

function assertMetadata(block: PromptBlockInput, expectedType: PromptBlockType): void {
  if (block.type !== expectedType) {
    throw new Error(`Prompt block type mismatch: expected ${expectedType}`);
  }
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/iu.test(block.source)) {
    throw new Error(`Invalid prompt block source for ${expectedType}`);
  }
  if (!block.freshness.asOf || Number.isNaN(Date.parse(block.freshness.asOf))) {
    throw new Error(`Invalid prompt block freshness for ${expectedType}`);
  }
}

function boundaryFor(block: PromptBlockInput): InstructionBoundary {
  if (block.type === 'canonical_response_security' && block.trust === 'protected') {
    return 'authoritative';
  }
  if (BOUNDED_INSTRUCTION_TYPES.has(block.type) && INSTRUCTION_TRUST.has(block.trust)) {
    return 'bounded_instruction';
  }
  return 'data_only';
}

function encodeData(content: string): string {
  return JSON.stringify(content)
    .replace(/\[/gu, '\\u005b')
    .replace(/\]/gu, '\\u005d')
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e');
}

function compileBlock(block: PromptBlockInput): CompiledPromptBlock {
  const instructionBoundary = boundaryFor(block);
  const renderedContent =
    instructionBoundary === 'data_only' ? encodeData(block.content) : block.content;
  const rendered = [
    `[JARVIS_BLOCK type=${block.type} source=${block.source} freshness=${block.freshness.status}@${block.freshness.asOf} trust=${block.trust} instruction_boundary=${instructionBoundary}]`,
    renderedContent,
    '[/JARVIS_BLOCK]',
  ].join('\n');
  return {
    ...block,
    freshness: { ...block.freshness },
    instructionBoundary,
    renderedContent,
    rendered,
  };
}

export function compileJarvisPrompt(input: PromptCompilerInput): CompiledPrompt {
  if (input.canonicalResponseSecurity.trust !== 'protected') {
    throw new Error('Canonical response/security block must be protected');
  }
  if (input.verifiedCapabilities.trust !== 'verified') {
    throw new Error('Capabilities block must be verified');
  }
  const soulValidation = validateSoulDocument(input.soul.content);
  if (!soulValidation.valid) {
    throw new Error(`Invalid SOUL block: ${soulValidation.issues.join(',')}`);
  }

  const blocks = ORDER.map(({ key, type }) => {
    const block = input[key];
    assertMetadata(block, type);
    return compileBlock(block);
  });
  const stableBlocks = blocks.slice(0, 4);
  const dynamicBlocks = blocks.slice(4);
  const stableRendered = stableBlocks.map((block) => block.rendered).join('\n\n');
  const dynamicRendered = dynamicBlocks.map((block) => block.rendered).join('\n\n');
  return {
    blocks,
    stablePrefix: {
      blocks: stableBlocks,
      hashInput: stableRendered,
      hash: deterministicHash(stableRendered),
      rendered: stableRendered,
    },
    dynamic: {
      blocks: dynamicBlocks,
      rendered: dynamicRendered,
    },
    rendered: `${stableRendered}\n\n${dynamicRendered}`,
  };
}
