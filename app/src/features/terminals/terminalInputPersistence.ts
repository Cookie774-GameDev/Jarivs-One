import { sanitizePersistedDraft } from './terminalContentSanitizer';

export interface PersistedInputUpdate {
  draft: string;
  submittedText: string | null;
  flushNow: boolean;
}

export interface PersistedInputTracker {
  push(data: string): PersistedInputUpdate;
  replaceDraft(draft: string): void;
  currentDraft(): string;
  reset(): void;
}

type ParserState =
  | 'normal'
  | 'escape'
  | 'csi'
  | 'osc'
  | 'osc-escape'
  | 'dcs'
  | 'dcs-escape'
  | 'ss3';

function removeLastCodePoint(value: string): string {
  const codePoints = Array.from(value);
  codePoints.pop();
  return codePoints.join('');
}

function isPrintable(value: string): boolean {
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint >= 0x20 && codePoint !== 0x7f && !(codePoint >= 0x80 && codePoint <= 0x9f);
}

export function createPersistedInputTracker(
  initialDraft = '',
): PersistedInputTracker {
  let draft = sanitizePersistedDraft(initialDraft);
  let state: ParserState = 'normal';
  let csi = '';
  let bracketedPaste = false;

  const finishCsi = () => {
    if (csi === '200~') bracketedPaste = true;
    if (csi === '201~') bracketedPaste = false;
    csi = '';
    state = 'normal';
  };

  return {
    push(data) {
      let submittedText: string | null = null;
      let flushNow = false;

      for (const char of data) {
        if (state === 'escape') {
          if (char === '[') {
            state = 'csi';
            csi = '';
          } else if (char === ']') {
            state = 'osc';
          } else if (char === 'P') {
            state = 'dcs';
          } else if (char === 'O') {
            state = 'ss3';
          } else {
            state = 'normal';
          }
          continue;
        }

        if (state === 'csi') {
          csi += char;
          const codePoint = char.codePointAt(0) ?? 0;
          if (codePoint >= 0x40 && codePoint <= 0x7e) {
            finishCsi();
          } else if (csi.length > 64) {
            csi = '';
            state = 'normal';
          }
          continue;
        }

        if (state === 'osc') {
          if (char === '\x07') state = 'normal';
          else if (char === '\x1b') state = 'osc-escape';
          continue;
        }
        if (state === 'osc-escape') {
          state = char === '\\' ? 'normal' : char === '\x1b' ? 'osc-escape' : 'osc';
          continue;
        }

        if (state === 'dcs') {
          if (char === '\x1b') state = 'dcs-escape';
          continue;
        }
        if (state === 'dcs-escape') {
          state = char === '\\' ? 'normal' : char === '\x1b' ? 'dcs-escape' : 'dcs';
          continue;
        }

        if (state === 'ss3') {
          state = 'normal';
          continue;
        }

        if (char === '\x1b') {
          state = 'escape';
          continue;
        }

        if (bracketedPaste) {
          if (isPrintable(char)) draft += char;
          continue;
        }

        if (char === '\r' || char === '\n') {
          if (submittedText == null) {
            const submitted = sanitizePersistedDraft(draft);
            submittedText = submitted || null;
          }
          draft = '';
          flushNow = true;
          continue;
        }

        if (char === '\x03') {
          draft = '';
          flushNow = true;
          continue;
        }

        if (char === '\x7f' || char === '\x08') {
          draft = removeLastCodePoint(draft);
          continue;
        }

        if (isPrintable(char)) draft += char;
      }

      draft = sanitizePersistedDraft(draft);
      return { draft, submittedText, flushNow };
    },

    replaceDraft(nextDraft) {
      draft = sanitizePersistedDraft(nextDraft);
      state = 'normal';
      csi = '';
      bracketedPaste = false;
    },

    currentDraft() {
      return draft;
    },

    reset() {
      draft = '';
      state = 'normal';
      csi = '';
      bracketedPaste = false;
    },
  };
}
