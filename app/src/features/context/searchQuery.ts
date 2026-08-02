import type { DeepReadonly } from './contracts';

export interface ContextSearchSpanV1 {
  start: number;
  end: number;
}

export interface ContextSearchTermNodeV1 {
  kind: 'term';
  value: string;
  exact: boolean;
  span: ContextSearchSpanV1;
}

export interface ContextSearchRangeV1 {
  start: string;
  end: string;
  inclusiveStart: true;
  inclusiveEnd: true;
}

export interface ContextSearchFieldNodeV1 {
  kind: 'field';
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'range';
  value: string | ContextSearchRangeV1;
  exact: boolean;
  span: ContextSearchSpanV1;
}

export interface ContextSearchBooleanNodeV1 {
  kind: 'and' | 'or';
  operands: ContextSearchNodeV1[];
  span: ContextSearchSpanV1;
}

export interface ContextSearchNotNodeV1 {
  kind: 'not';
  operand: ContextSearchNodeV1;
  span: ContextSearchSpanV1;
}

export type ContextSearchNodeV1 =
  | ContextSearchTermNodeV1
  | ContextSearchFieldNodeV1
  | ContextSearchBooleanNodeV1
  | ContextSearchNotNodeV1;

export interface ContextSearchQueryV1 {
  version: 1;
  query: string;
  ast: ContextSearchNodeV1;
}

export interface ContextSearchParseErrorV1 {
  message: string;
  offset: number;
  length: number;
  line: 1;
  column: number;
}

export type ContextSearchQueryParseResult =
  | Readonly<{ ok: true; value: DeepReadonly<ContextSearchQueryV1> }>
  | Readonly<{
      ok: false;
      reason:
        | 'query_input_invalid'
        | 'query_input_too_large'
        | 'query_syntax_invalid'
        | 'query_field_invalid'
        | 'query_value_invalid';
      error?: ContextSearchParseErrorV1;
    }>;

type TokenKind =
  | 'word'
  | 'phrase'
  | 'and'
  | 'or'
  | 'not'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'colon'
  | 'minus'
  | 'comparison'
  | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

type FailureReason =
  | 'query_input_too_large'
  | 'query_syntax_invalid'
  | 'query_field_invalid'
  | 'query_value_invalid';

class QueryParseFailure {
  readonly reason: FailureReason;
  readonly error: ContextSearchParseErrorV1;

  constructor(reason: FailureReason, message: string, offset: number, length: number) {
    this.reason = reason;
    this.error = {
      message,
      offset,
      length: Math.max(1, length),
      line: 1,
      column: offset + 1,
    };
  }
}

const MAX_QUERY_CHARACTERS = 4_096;
const MAX_TOKENS = 256;
const MAX_AST_NODES = 256;
const MAX_DEPTH = 32;
const MAX_VALUE_CHARACTERS = 1_000;
const PROHIBITED_WHITESPACE_OR_CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;
const UNSUPPORTED_METACHARACTERS = /[`|&{};]/u;
const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/u;
const UNSAFE_NAMES = new Set(
  [...Object.getOwnPropertyNames(Object.prototype), '__proto__'].map((name) =>
    name.toLocaleLowerCase('en-US'),
  ),
);
const EXACT_FIELDS = new Set([
  'tag',
  'path',
  'type',
  'kind',
  'task',
  'linked_to',
  'backlinks_to',
  'source',
  'github.repo',
  'github.branch',
  'repo',
  'branch',
  'language',
  'symbol',
  'name',
  'imports',
  'freshness',
  'changed_after',
  'changed_before',
  'updated_after',
  'updated_before',
]);
const DATE_FIELDS = new Set(['changed_after', 'changed_before', 'updated_after', 'updated_before']);
const COMPARISON_OPERATORS: Readonly<Record<string, ContextSearchFieldNodeV1['operator']>> = {
  '=': 'eq',
  '!=': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
};

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreeze(entry))) as DeepReadonly<T>;
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = deepFreeze(entry);
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

function failure(reason: FailureReason, message: string, offset: number, length: number): never {
  throw new QueryParseFailure(reason, message, offset, length);
}

function punctuation(character: string): boolean {
  return ['(', ')', '[', ']', ':', '<', '>', '!', '='].includes(character);
}

function lex(query: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  const push = (token: Token): void => {
    tokens.push(token);
    if (tokens.length > MAX_TOKENS) {
      failure(
        'query_input_too_large',
        'Search query contains too many tokens.',
        token.start,
        token.end - token.start,
      );
    }
  };

  while (offset < query.length) {
    const character = query[offset]!;
    if (character === ' ') {
      offset += 1;
      continue;
    }
    if (character === '"') {
      const start = offset;
      offset += 1;
      let value = '';
      let closed = false;
      while (offset < query.length) {
        const current = query[offset]!;
        if (current === '"') {
          offset += 1;
          closed = true;
          break;
        }
        if (current === '\\') {
          const escaped = query[offset + 1];
          if (escaped !== '"' && escaped !== '\\') {
            failure(
              'query_syntax_invalid',
              'Quoted phrases allow only escaped quotes and backslashes.',
              offset,
              Math.min(2, query.length - offset),
            );
          }
          value += escaped;
          offset += 2;
          continue;
        }
        value += current;
        offset += 1;
      }
      if (!closed) {
        failure('query_syntax_invalid', 'Unterminated quoted phrase.', start, query.length - start);
      }
      if (value.length === 0 || value.length > MAX_VALUE_CHARACTERS) {
        failure(
          value.length > MAX_VALUE_CHARACTERS ? 'query_input_too_large' : 'query_value_invalid',
          value.length > MAX_VALUE_CHARACTERS
            ? 'Quoted phrase is too long.'
            : 'Quoted phrase cannot be empty.',
          start,
          offset - start,
        );
      }
      push({ kind: 'phrase', value, start, end: offset });
      continue;
    }

    const singleKinds: Readonly<Record<string, TokenKind>> = {
      '(': 'lparen',
      ')': 'rparen',
      '[': 'lbracket',
      ']': 'rbracket',
      ':': 'colon',
    };
    const singleKind = singleKinds[character];
    if (singleKind) {
      push({ kind: singleKind, value: character, start: offset, end: offset + 1 });
      offset += 1;
      continue;
    }
    if (character === '-') {
      push({ kind: 'minus', value: character, start: offset, end: offset + 1 });
      offset += 1;
      continue;
    }
    if (character === '<' || character === '>' || character === '=' || character === '!') {
      const start = offset;
      let value = character;
      offset += 1;
      if (query[offset] === '=') {
        value += '=';
        offset += 1;
      } else if (character === '!') {
        failure('query_syntax_invalid', 'Expected "=" after "!".', start, 1);
      }
      push({ kind: 'comparison', value, start, end: offset });
      continue;
    }

    const start = offset;
    while (
      offset < query.length &&
      query[offset] !== ' ' &&
      !punctuation(query[offset]!) &&
      !(offset === start && query[offset] === '-')
    ) {
      offset += 1;
    }
    const value = query.slice(start, offset);
    if (!value) {
      failure('query_syntax_invalid', `Unexpected character "${character}".`, start, 1);
    }
    if (value.length > MAX_VALUE_CHARACTERS) {
      failure('query_input_too_large', 'Search token is too long.', start, value.length);
    }
    const keyword = value.toLocaleUpperCase('en-US');
    const kind: TokenKind =
      keyword === 'AND' ? 'and' : keyword === 'OR' ? 'or' : keyword === 'NOT' ? 'not' : 'word';
    push({ kind, value, start, end: offset });
  }
  tokens.push({ kind: 'eof', value: '', start: query.length, end: query.length });
  return tokens;
}

function validField(field: string): boolean {
  if (!FIELD_NAME.test(field)) return false;
  if (EXACT_FIELDS.has(field)) return true;
  if (!field.startsWith('property.')) return false;
  const propertyName = field.slice('property.'.length);
  return (
    PROPERTY_NAME.test(propertyName) && !UNSAFE_NAMES.has(propertyName.toLocaleLowerCase('en-US'))
  );
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp)) return false;
  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function span(start: number, end: number): ContextSearchSpanV1 {
  return { start, end };
}

class Parser {
  readonly tokens: readonly Token[];
  private index = 0;
  private nodes = 0;
  private depth = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  parse(): ContextSearchNodeV1 {
    const ast = this.parseOr();
    const token = this.peek();
    if (token.kind !== 'eof') {
      failure(
        'query_syntax_invalid',
        token.kind === 'rparen'
          ? 'Unexpected closing parenthesis.'
          : `Unexpected token "${token.value}".`,
        token.start,
        token.end - token.start,
      );
    }
    return ast;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
  }

  private take(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private enter(token: Token): void {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      failure(
        'query_input_too_large',
        'Search query nesting is too deep.',
        token.start,
        token.end - token.start,
      );
    }
  }

  private leave(): void {
    this.depth -= 1;
  }

  private node<T extends ContextSearchNodeV1>(value: T): T {
    this.nodes += 1;
    if (this.nodes > MAX_AST_NODES) {
      failure(
        'query_input_too_large',
        'Search query contains too many expressions.',
        value.span.start,
        value.span.end - value.span.start,
      );
    }
    return value;
  }

  private boolean(kind: 'and' | 'or', operands: ContextSearchNodeV1[]): ContextSearchNodeV1 {
    if (operands.length === 1) return operands[0]!;
    return this.node({
      kind,
      operands,
      span: span(operands[0]!.span.start, operands[operands.length - 1]!.span.end),
    });
  }

  private startsExpression(token: Token): boolean {
    return ['word', 'phrase', 'lparen', 'not', 'minus'].includes(token.kind);
  }

  private parseOr(): ContextSearchNodeV1 {
    const operands = [this.parseAnd()];
    while (this.peek().kind === 'or') {
      this.take();
      if (!this.startsExpression(this.peek())) {
        const token = this.peek();
        failure(
          'query_syntax_invalid',
          'Expected an expression after OR.',
          token.start,
          token.end - token.start,
        );
      }
      operands.push(this.parseAnd());
    }
    return this.boolean('or', operands);
  }

  private parseAnd(): ContextSearchNodeV1 {
    const operands = [this.parseUnary()];
    while (true) {
      if (this.peek().kind === 'and') {
        this.take();
        if (!this.startsExpression(this.peek())) {
          const token = this.peek();
          failure(
            'query_syntax_invalid',
            'Expected an expression after AND.',
            token.start,
            token.end - token.start,
          );
        }
        operands.push(this.parseUnary());
        continue;
      }
      if (this.startsExpression(this.peek())) {
        operands.push(this.parseUnary());
        continue;
      }
      break;
    }
    return this.boolean('and', operands);
  }

  private parseUnary(): ContextSearchNodeV1 {
    const token = this.peek();
    if (token.kind === 'not' || token.kind === 'minus') {
      this.take();
      if (!this.startsExpression(this.peek())) {
        failure(
          'query_syntax_invalid',
          'Expected an expression after negation.',
          token.start,
          token.end - token.start,
        );
      }
      const operand = this.parseUnary();
      return this.node({
        kind: 'not',
        operand,
        span: span(token.start, operand.span.end),
      });
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ContextSearchNodeV1 {
    const token = this.peek();
    if (token.kind === 'lparen') {
      this.take();
      this.enter(token);
      try {
        if (this.peek().kind === 'rparen') {
          failure('query_syntax_invalid', 'Parentheses cannot be empty.', token.start, 2);
        }
        const expression = this.parseOr();
        const close = this.peek();
        if (close.kind !== 'rparen') {
          failure(
            'query_syntax_invalid',
            'Expected closing parenthesis.',
            close.start,
            close.end - close.start,
          );
        }
        this.take();
        expression.span = span(token.start, close.end);
        return expression;
      } finally {
        this.leave();
      }
    }
    if (token.kind === 'phrase') {
      this.take();
      return this.node({
        kind: 'term',
        value: token.value,
        exact: true,
        span: span(token.start, token.end),
      });
    }
    if (token.kind !== 'word') {
      failure(
        'query_syntax_invalid',
        token.kind === 'eof'
          ? 'Search query cannot end here.'
          : `Unexpected token "${token.value}".`,
        token.start,
        token.end - token.start,
      );
    }
    if (this.peek(1).kind === 'colon' || this.peek(1).kind === 'comparison') {
      return this.parseField();
    }
    this.take();
    if (/^\/.*\/[A-Za-z]*$/u.test(token.value) || /[{};]/u.test(token.value)) {
      failure(
        'query_syntax_invalid',
        'Regex and executable expressions require a separate permitted search mode.',
        token.start,
        token.end - token.start,
      );
    }
    return this.node({
      kind: 'term',
      value: token.value,
      exact: false,
      span: span(token.start, token.end),
    });
  }

  private parseField(): ContextSearchNodeV1 {
    const fieldToken = this.take();
    const field = fieldToken.value;
    if (!validField(field)) {
      failure(
        'query_field_invalid',
        `Unknown search field "${field}".`,
        fieldToken.start,
        fieldToken.end - fieldToken.start,
      );
    }
    let operator: ContextSearchFieldNodeV1['operator'] = 'eq';
    if (this.peek().kind === 'colon') {
      this.take();
      if (this.peek().kind === 'comparison') {
        operator = COMPARISON_OPERATORS[this.take().value]!;
      }
    } else {
      operator = COMPARISON_OPERATORS[this.take().value]!;
    }
    if (operator === 'eq' && this.peek().kind === 'lparen') {
      return this.parseScopedFieldGroup(fieldToken, field);
    }
    if (operator === 'eq' && this.peek().kind === 'lbracket') {
      return this.parseRange(fieldToken, field);
    }
    const valueToken = this.takeFieldValue(field);
    if (DATE_FIELDS.has(field) && !validDate(valueToken.value)) {
      failure(
        'query_value_invalid',
        `Field "${field}" requires a valid calendar date.`,
        valueToken.start,
        valueToken.end - valueToken.start,
      );
    }
    return this.node({
      kind: 'field',
      field,
      operator,
      value: valueToken.value,
      exact: valueToken.kind === 'phrase',
      span: span(fieldToken.start, valueToken.end),
    });
  }

  private takeFieldValue(field: string): Token {
    const token = this.peek();
    if (token.kind !== 'word' && token.kind !== 'phrase') {
      failure(
        'query_value_invalid',
        `Field "${field}" requires a value.`,
        token.start,
        token.end - token.start,
      );
    }
    this.take();
    if (
      token.value.length === 0 ||
      /^\/.*\/[A-Za-z]*$/u.test(token.value) ||
      /[{};]/u.test(token.value)
    ) {
      failure(
        'query_value_invalid',
        `Field "${field}" contains an unsupported value.`,
        token.start,
        token.end - token.start,
      );
    }
    return token;
  }

  private parseRange(fieldToken: Token, field: string): ContextSearchNodeV1 {
    this.take();
    const start = this.takeFieldValue(field);
    const separator = this.peek();
    if (separator.kind !== 'word' || separator.value.toLocaleUpperCase('en-US') !== 'TO') {
      failure(
        'query_syntax_invalid',
        'Date ranges require TO between their bounds.',
        separator.start,
        separator.end - separator.start,
      );
    }
    this.take();
    const end = this.takeFieldValue(field);
    const close = this.peek();
    if (close.kind !== 'rbracket') {
      failure(
        'query_syntax_invalid',
        'Expected closing range bracket.',
        close.start,
        close.end - close.start,
      );
    }
    this.take();
    if (!validDate(start.value)) {
      failure(
        'query_value_invalid',
        'Range start must be a valid calendar date.',
        start.start,
        start.end - start.start,
      );
    }
    if (!validDate(end.value)) {
      failure(
        'query_value_invalid',
        'Range end must be a valid calendar date.',
        end.start,
        end.end - end.start,
      );
    }
    if (start.value > end.value) {
      failure(
        'query_value_invalid',
        'Range start must not be after range end.',
        start.start,
        end.end - start.start,
      );
    }
    return this.node({
      kind: 'field',
      field,
      operator: 'range',
      value: {
        start: start.value,
        end: end.value,
        inclusiveStart: true,
        inclusiveEnd: true,
      },
      exact: true,
      span: span(fieldToken.start, close.end),
    });
  }

  private parseScopedFieldGroup(fieldToken: Token, field: string): ContextSearchNodeV1 {
    const open = this.take();
    this.enter(open);
    try {
      if (this.peek().kind === 'rparen') {
        failure('query_syntax_invalid', 'Field alternatives cannot be empty.', open.start, 2);
      }
      const expression = this.parseScopedOr(field);
      const close = this.peek();
      if (close.kind !== 'rparen') {
        failure(
          'query_syntax_invalid',
          'Expected closing parenthesis.',
          close.start,
          close.end - close.start,
        );
      }
      this.take();
      expression.span = span(fieldToken.start, close.end);
      return expression;
    } finally {
      this.leave();
    }
  }

  private parseScopedOr(field: string): ContextSearchNodeV1 {
    const operands = [this.parseScopedAnd(field)];
    while (this.peek().kind === 'or') {
      const operator = this.take();
      if (!this.startsScopedExpression(this.peek())) {
        const token = this.peek();
        failure(
          'query_syntax_invalid',
          'Expected a field value after OR.',
          token.kind === 'eof' ? operator.start : token.start,
          token.kind === 'eof' ? operator.end - operator.start : token.end - token.start,
        );
      }
      operands.push(this.parseScopedAnd(field));
    }
    return this.boolean('or', operands);
  }

  private startsScopedExpression(token: Token): boolean {
    return ['word', 'phrase', 'not', 'minus', 'lparen'].includes(token.kind);
  }

  private parseScopedAnd(field: string): ContextSearchNodeV1 {
    const operands = [this.parseScopedUnary(field)];
    while (true) {
      if (this.peek().kind === 'and') {
        const operator = this.take();
        if (!this.startsScopedExpression(this.peek())) {
          const token = this.peek();
          failure(
            'query_syntax_invalid',
            'Expected a field value after AND.',
            token.kind === 'eof' ? operator.start : token.start,
            token.kind === 'eof' ? operator.end - operator.start : token.end - token.start,
          );
        }
        operands.push(this.parseScopedUnary(field));
        continue;
      }
      if (this.startsScopedExpression(this.peek())) {
        operands.push(this.parseScopedUnary(field));
        continue;
      }
      break;
    }
    return this.boolean('and', operands);
  }

  private parseScopedUnary(field: string): ContextSearchNodeV1 {
    const token = this.peek();
    if (token.kind === 'not' || token.kind === 'minus') {
      this.take();
      if (!this.startsScopedExpression(this.peek())) {
        failure(
          'query_syntax_invalid',
          'Expected a field value after negation.',
          token.start,
          token.end - token.start,
        );
      }
      const operand = this.parseScopedUnary(field);
      return this.node({
        kind: 'not',
        operand,
        span: span(token.start, operand.span.end),
      });
    }
    if (token.kind === 'lparen') {
      this.take();
      this.enter(token);
      try {
        if (this.peek().kind === 'rparen') {
          failure(
            'query_syntax_invalid',
            'Field alternative parentheses cannot be empty.',
            token.start,
            2,
          );
        }
        const expression = this.parseScopedOr(field);
        const close = this.peek();
        if (close.kind !== 'rparen') {
          failure(
            'query_syntax_invalid',
            'Expected closing parenthesis.',
            close.start,
            close.end - close.start,
          );
        }
        this.take();
        expression.span = span(token.start, close.end);
        return expression;
      } finally {
        this.leave();
      }
    }
    const value = this.takeFieldValue(field);
    return this.node({
      kind: 'field',
      field,
      operator: 'eq',
      value: value.value,
      exact: value.kind === 'phrase',
      span: span(value.start, value.end),
    });
  }
}

export function parseContextSearchQuery(value: unknown): ContextSearchQueryParseResult {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    return Object.freeze({ ok: false, reason: 'query_input_invalid' });
  }
  if (value.length > MAX_QUERY_CHARACTERS) {
    return Object.freeze({ ok: false, reason: 'query_input_too_large' });
  }
  if (PROHIBITED_WHITESPACE_OR_CONTROL.test(value)) {
    return Object.freeze({ ok: false, reason: 'query_input_invalid' });
  }
  const unsupported = UNSUPPORTED_METACHARACTERS.exec(value);
  const commandSubstitutionOffset = value.indexOf('$(');
  const unsupportedOffset =
    unsupported && commandSubstitutionOffset >= 0
      ? Math.min(unsupported.index, commandSubstitutionOffset)
      : unsupported
        ? unsupported.index
        : commandSubstitutionOffset;
  if (unsupportedOffset >= 0) {
    return Object.freeze({
      ok: false,
      reason: 'query_syntax_invalid',
      error: Object.freeze({
        message: 'Unsupported executable or metacharacter syntax.',
        offset: unsupportedOffset,
        length: value.startsWith('$(', unsupportedOffset) ? 2 : 1,
        line: 1 as const,
        column: unsupportedOffset + 1,
      }),
    });
  }
  try {
    const ast = new Parser(lex(value)).parse();
    return Object.freeze({
      ok: true,
      value: deepFreeze({
        version: 1 as const,
        query: value,
        ast,
      }),
    });
  } catch (error) {
    if (error instanceof QueryParseFailure) {
      return Object.freeze({
        ok: false,
        reason: error.reason,
        error: Object.freeze(error.error),
      });
    }
    return Object.freeze({ ok: false, reason: 'query_syntax_invalid' });
  }
}
