import { parseContextNoteSyntax } from './noteSyntax';

export type ContextNoteRenderBlock =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'code'; text: string; language?: string }>;

export interface ContextNoteRenderLink {
  label: string;
  target: string;
  image: boolean;
  external: boolean;
}

export interface ContextNoteRenderEmbed {
  targetTitle: string;
  heading?: string;
  blockId?: string;
  alias?: string;
}

export interface ContextNoteRenderPlan {
  schemaVersion: 1;
  executable: false;
  rawHtml: 'text_only';
  svg: 'text_only';
  importedExtensions: 'text_only';
  blocks: readonly ContextNoteRenderBlock[];
  links: readonly Readonly<ContextNoteRenderLink>[];
  embeds: readonly Readonly<ContextNoteRenderEmbed>[];
}

const MAX_RENDER_CHARACTERS = 32_768;
const MAX_RENDER_BLOCKS = 1_024;
const MAX_ACTIVE_REFERENCES = 1_000;
const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})([ \t]*)([A-Za-z0-9_+.-]{0,64})[ \t]*$/u;

function fail(detail: string): never {
  throw new Error(`Invalid Context note rendering: ${detail}.`);
}

function safeInternalEmbedTarget(target: string): boolean {
  const value = target.trim();
  return (
    value.length > 0 &&
    value.length <= 240 &&
    !CONTROL_CHARACTERS.test(value) &&
    !value.startsWith('//') &&
    !value.startsWith('\\') &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  );
}

function maskInertReferenceRegions(markdown: string): string {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
  ]);
  const htmlStack: string[] = [];
  let pendingHtmlTag:
    | Readonly<{ name: string; closing: boolean; quote: '"' | "'" | null }>
    | undefined;
  let htmlComment = false;
  let directiveLength = 0;
  let importedExtensionRegion = false;
  let expressionDepth = 0;
  let fence: Readonly<{ character: '`' | '~'; length: number }> | undefined;

  return lines
    .map((line) => {
      if (fence) {
        const marker = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line)?.[1];
        if (marker?.[0] === fence.character && marker.length >= fence.length) {
          fence = undefined;
        }
        return ' '.repeat(line.length);
      }
      const openingFence = FENCE_OPEN.exec(line)?.[1];
      if (openingFence) {
        fence = {
          character: openingFence[0] as '`' | '~',
          length: openingFence.length,
        };
        return ' '.repeat(line.length);
      }

      if (directiveLength > 0) {
        const closing = /^ {0,3}(:{3,})[ \t]*$/u.exec(line)?.[1];
        if (closing && closing.length >= directiveLength) directiveLength = 0;
        return ' '.repeat(line.length);
      }

      const commentStart = line.indexOf('<!--');
      if (commentStart >= 0) {
        if (!line.slice(commentStart + 4).includes('-->')) htmlComment = true;
        return ' '.repeat(line.length);
      }

      const directive = /^ {0,3}(:{3,})(?:[A-Za-z][A-Za-z0-9_-]*)?(?:[ \t].*)?$/u.exec(line)?.[1];
      if (directive) {
        directiveLength = directive.length;
        return ' '.repeat(line.length);
      }

      if (importedExtensionRegion) return ' '.repeat(line.length);
      if (/^\s*(?:import|export)\b/u.test(line)) {
        importedExtensionRegion = true;
        return ' '.repeat(line.length);
      }

      const depthBefore = expressionDepth;
      for (const character of line) {
        if (character === '{') expressionDepth += 1;
        else if (character === '}' && expressionDepth > 0) expressionDepth -= 1;
      }

      let inert =
        depthBefore > 0 ||
        expressionDepth > 0 ||
        line.includes('{') ||
        line.includes('}') ||
        htmlStack.length > 0 ||
        pendingHtmlTag !== undefined ||
        htmlComment;
      let cursor = 0;

      while (cursor < line.length) {
        if (htmlComment) {
          inert = true;
          const end = line.indexOf('-->', cursor);
          if (end < 0) break;
          htmlComment = false;
          cursor = end + 3;
          continue;
        }

        if (pendingHtmlTag) {
          inert = true;
          let quote = pendingHtmlTag.quote;
          let end = -1;
          for (let index = cursor; index < line.length; index += 1) {
            const character = line[index];
            if (quote) {
              if (character === quote) quote = null;
            } else if (character === '"' || character === "'") {
              quote = character;
            } else if (character === '>') {
              end = index;
              break;
            }
          }
          if (end < 0) {
            pendingHtmlTag = { ...pendingHtmlTag, quote };
            break;
          }
          const { name, closing } = pendingHtmlTag;
          const selfClosing = /\/\s*>$/u.test(line.slice(cursor, end + 1));
          pendingHtmlTag = undefined;
          if (closing) {
            const matching = htmlStack.lastIndexOf(name);
            if (matching >= 0) htmlStack.splice(matching);
          } else if (!selfClosing && !voidElements.has(name)) {
            htmlStack.push(name);
          }
          cursor = end + 1;
          continue;
        }

        const commentStart = line.indexOf('<!--', cursor);
        const tagStart = line.indexOf('<', cursor);
        if (commentStart >= 0 && (tagStart < 0 || commentStart === tagStart)) {
          inert = true;
          htmlComment = true;
          cursor = commentStart + 4;
          continue;
        }
        if (tagStart < 0) break;

        if (line.startsWith('</>', tagStart)) {
          inert = true;
          const matching = htmlStack.lastIndexOf('#fragment');
          if (matching >= 0) htmlStack.splice(matching);
          cursor = tagStart + 3;
          continue;
        }
        if (line.startsWith('<>', tagStart)) {
          inert = true;
          htmlStack.push('#fragment');
          cursor = tagStart + 2;
          continue;
        }

        const tagMatch = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)\b/u.exec(line.slice(tagStart));
        if (!tagMatch?.[2]) {
          cursor = tagStart + 1;
          continue;
        }

        inert = true;
        const closing = tagMatch[1] === '/';
        const name = tagMatch[2].toLocaleLowerCase('en-US');
        let quote: '"' | "'" | null = null;
        let end = -1;
        for (let index = tagStart + tagMatch[0].length; index < line.length; index += 1) {
          const character = line[index];
          if (quote) {
            if (character === quote) quote = null;
          } else if (character === '"' || character === "'") {
            quote = character;
          } else if (character === '>') {
            end = index;
            break;
          }
        }
        if (end < 0) {
          pendingHtmlTag = { name, closing, quote };
          break;
        }

        const token = line.slice(tagStart, end + 1);
        const markdownDestination =
          line.lastIndexOf('](', tagStart) > line.lastIndexOf(')', tagStart);
        if (!markdownDestination) {
          if (closing) {
            const matching = htmlStack.lastIndexOf(name);
            if (matching >= 0) htmlStack.splice(matching);
          } else if (!/\/\s*>$/u.test(token) && !voidElements.has(name)) {
            htmlStack.push(name);
          }
        }
        cursor = end + 1;
      }

      return inert ? ' '.repeat(line.length) : line;
    })
    .join('\n');
}

function safeActiveLink(target: string): boolean {
  if (target.startsWith('\\') || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(target)) {
    return false;
  }
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(target)?.[1]?.toLocaleLowerCase('en-US');
  if (scheme !== 'http' && scheme !== 'https') return true;
  try {
    const parsed = new URL(target);
    return parsed.username.length === 0 && parsed.password.length === 0;
  } catch {
    return false;
  }
}

function compileBlocks(markdown: string): readonly ContextNoteRenderBlock[] {
  const blocks: ContextNoteRenderBlock[] = [];
  const textLines: string[] = [];
  let codeLines: string[] | null = null;
  let fence: Readonly<{ character: '`' | '~'; length: number; language?: string }> | null = null;

  const push = (block: ContextNoteRenderBlock) => {
    if (blocks.length >= MAX_RENDER_BLOCKS) fail('too many render blocks');
    blocks.push(Object.freeze(block));
  };
  const flushText = () => {
    if (textLines.length === 0) return;
    push({ kind: 'text', text: textLines.join('\n') });
    textLines.length = 0;
  };
  const flushCode = () => {
    if (!fence || !codeLines) return;
    push({
      kind: 'code',
      text: codeLines.join('\n'),
      ...(fence.language ? { language: fence.language } : {}),
    });
    codeLines = null;
    fence = null;
  };

  for (const line of markdown.replace(/\r\n?/gu, '\n').split('\n')) {
    if (fence) {
      const marker = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line)?.[1];
      const closing = marker?.[0] === fence.character && marker.length >= fence.length;
      if (closing) flushCode();
      else codeLines!.push(line);
      continue;
    }
    const opening = FENCE_OPEN.exec(line);
    if (!opening?.[1]) {
      textLines.push(line);
      continue;
    }
    flushText();
    fence = {
      character: opening[1][0] as '`' | '~',
      length: opening[1].length,
      ...(opening[3] ? { language: opening[3].toLocaleLowerCase('en-US') } : {}),
    };
    codeLines = [];
  }
  if (fence) flushCode();
  flushText();
  return Object.freeze(blocks);
}

export function compileContextNoteRenderPlan(markdown: unknown): Readonly<ContextNoteRenderPlan> {
  if (
    typeof markdown !== 'string' ||
    markdown.length > MAX_RENDER_CHARACTERS ||
    CONTROL_CHARACTERS.test(markdown)
  ) {
    fail('Markdown');
  }
  const syntax = parseContextNoteSyntax(maskInertReferenceRegions(markdown));
  if (!syntax.ok) fail(syntax.reason);

  const links = syntax.value.markdownLinks
    .filter(({ target }) => safeActiveLink(target))
    .slice(0, MAX_ACTIVE_REFERENCES)
    .map((link) =>
      Object.freeze({
        label: link.label,
        target: link.target,
        image: link.image,
        external: link.external,
      }),
    );
  const embeds = syntax.value.wikiLinks
    .filter(({ embed, targetTitle }) => embed && safeInternalEmbedTarget(targetTitle))
    .slice(0, MAX_ACTIVE_REFERENCES)
    .map((embed) =>
      Object.freeze({
        targetTitle: embed.targetTitle,
        ...(embed.heading ? { heading: embed.heading } : {}),
        ...(embed.blockId ? { blockId: embed.blockId } : {}),
        ...(embed.alias ? { alias: embed.alias } : {}),
      }),
    );

  return Object.freeze({
    schemaVersion: 1,
    executable: false,
    rawHtml: 'text_only',
    svg: 'text_only',
    importedExtensions: 'text_only',
    blocks: compileBlocks(markdown),
    links: Object.freeze(links),
    embeds: Object.freeze(embeds),
  });
}
