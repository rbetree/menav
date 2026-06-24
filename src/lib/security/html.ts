function escapeHtml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) {
    return '';
  }

  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type HtmlAttribute = {
  name: string;
  value: string;
};

type HtmlTagToken = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: HtmlAttribute[];
  endIndex: number;
};

type HtmlSanitizePolicy = {
  allowedTags: Set<string>;
  globalAttributes?: Set<string>;
  tagAttributes?: Record<string, Set<string>>;
  uriAttributes?: Set<string>;
};

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const HTML_VOID_TAGS = new Set([
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
  'param',
  'source',
  'track',
  'wbr',
]);

const HTML_RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

function isHtmlWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f';
}

function isHtmlNameStart(char: string): boolean {
  return /[A-Za-z]/.test(char);
}

function isHtmlNameChar(char: string): boolean {
  return /[A-Za-z0-9:_-]/.test(char);
}

function findHtmlTagEnd(source: string, startIndex: number): number {
  let quote = '';
  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '>') return index;
  }

  return -1;
}

function skipHtmlWhitespace(source: string, startIndex: number): number {
  let index = startIndex;
  while (index < source.length && isHtmlWhitespace(source[index])) index += 1;
  return index;
}

function readHtmlName(source: string, startIndex: number): { name: string; endIndex: number } {
  if (!isHtmlNameStart(source[startIndex] || '')) return { name: '', endIndex: startIndex };

  let index = startIndex + 1;
  while (index < source.length && isHtmlNameChar(source[index])) index += 1;
  return { name: source.slice(startIndex, index).toLowerCase(), endIndex: index };
}

function readHtmlTagToken(source: string, startIndex: number): HtmlTagToken | null {
  if (source[startIndex] !== '<') return null;

  const endIndex = findHtmlTagEnd(source, startIndex);
  if (endIndex < 0) return null;

  let cursor = startIndex + 1;
  let closing = false;
  let selfClosing = false;

  if (source[cursor] === '/') {
    closing = true;
    cursor += 1;
  }

  cursor = skipHtmlWhitespace(source, cursor);
  const tagName = readHtmlName(source, cursor);
  if (!tagName.name) return null;

  cursor = tagName.endIndex;
  const attrs: HtmlAttribute[] = [];

  while (!closing && cursor < endIndex) {
    cursor = skipHtmlWhitespace(source, cursor);
    if (cursor >= endIndex) break;

    if (source[cursor] === '/') {
      selfClosing = true;
      cursor += 1;
      continue;
    }

    const attrName = readHtmlName(source, cursor);
    if (!attrName.name) {
      cursor += 1;
      continue;
    }

    cursor = skipHtmlWhitespace(source, attrName.endIndex);
    let value = '';

    if (source[cursor] === '=') {
      cursor = skipHtmlWhitespace(source, cursor + 1);
      const quote = source[cursor];

      if (quote === '"' || quote === "'") {
        const valueStart = cursor + 1;
        const valueEnd = source.indexOf(quote, valueStart);
        const safeValueEnd = valueEnd >= 0 && valueEnd <= endIndex ? valueEnd : endIndex;
        value = source.slice(valueStart, safeValueEnd);
        cursor = safeValueEnd + 1;
      } else {
        const valueStart = cursor;
        while (cursor < endIndex && !isHtmlWhitespace(source[cursor]) && source[cursor] !== '/') {
          cursor += 1;
        }
        value = source.slice(valueStart, cursor);
      }
    }

    attrs.push({ name: attrName.name, value });
  }

  return {
    name: tagName.name,
    closing,
    selfClosing,
    attrs,
    endIndex,
  };
}

function findRawTextClose(source: string, tagName: string, startIndex: number): number {
  const lowered = source.toLowerCase();
  const closeNeedle = `</${tagName}`;
  let closeStart = lowered.indexOf(closeNeedle, startIndex);

  while (closeStart >= 0) {
    const closeEnd = findHtmlTagEnd(source, closeStart);
    if (closeEnd >= 0) return closeEnd + 1;
    closeStart = lowered.indexOf(closeNeedle, closeStart + closeNeedle.length);
  }

  return source.length;
}

function decodeHtmlEntity(entity: string): string | null {
  if (!entity) return null;

  if (entity[0] === '#') {
    const isHex = entity[1] === 'x' || entity[1] === 'X';
    const numberText = isHex ? entity.slice(2) : entity.slice(1);
    if (!numberText) return null;

    const radix = isHex ? 16 : 10;
    const codePoint = Number.parseInt(numberText, radix);
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return null;

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return null;
    }
  }

  return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? null;
}

function decodeHtmlEntities(input: unknown): string {
  const source = String(input || '');
  let output = '';
  let index = 0;

  while (index < source.length) {
    if (source[index] !== '&') {
      output += source[index];
      index += 1;
      continue;
    }

    const semicolonIndex = source.indexOf(';', index + 1);
    if (semicolonIndex < 0 || semicolonIndex - index > 32) {
      output += source[index];
      index += 1;
      continue;
    }

    const decoded = decodeHtmlEntity(source.slice(index + 1, semicolonIndex));
    if (decoded === null) {
      output += source[index];
      index += 1;
      continue;
    }

    output += decoded;
    index = semicolonIndex + 1;
  }

  return output;
}

function collapseWhitespace(input: string): string {
  let output = '';
  let pendingSpace = false;

  for (const char of input) {
    if (/\s/.test(char)) {
      pendingSpace = output.length > 0;
      continue;
    }

    if (pendingSpace) output += ' ';
    output += char;
    pendingSpace = false;
  }

  return output.trim();
}

function htmlToText(input: unknown): string {
  const source = String(input || '');
  let output = '';
  let index = 0;
  let mutedTag = '';

  while (index < source.length) {
    if (source[index] !== '<') {
      if (!mutedTag) output += source[index];
      index += 1;
      continue;
    }

    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index + 4);
      index = commentEnd >= 0 ? commentEnd + 3 : source.length;
      continue;
    }

    const token = readHtmlTagToken(source, index);
    if (!token) {
      if (!mutedTag) output += source[index];
      index += 1;
      continue;
    }

    if (HTML_RAW_TEXT_TAGS.has(token.name)) {
      if (token.closing && mutedTag === token.name) mutedTag = '';
      if (!token.closing && !token.selfClosing) mutedTag = token.name;
    } else if (!mutedTag) {
      output += ' ';
    }

    index = token.endIndex + 1;
  }

  return collapseWhitespace(decodeHtmlEntities(output));
}

function isSafeUriAttribute(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function isAllowedAttribute(
  tagName: string,
  attrName: string,
  policy: HtmlSanitizePolicy
): boolean {
  if (attrName.startsWith('on')) return false;
  if (attrName.startsWith('data-') || attrName.startsWith('aria-')) return true;
  if (policy.globalAttributes?.has(attrName)) return true;
  return Boolean(policy.tagAttributes?.[tagName]?.has(attrName));
}

function sanitizeHtmlAttribute(
  tagName: string,
  attr: HtmlAttribute,
  policy: HtmlSanitizePolicy
): string {
  const name = attr.name.toLowerCase();
  if (!isAllowedAttribute(tagName, name, policy)) return '';
  if (policy.uriAttributes?.has(name) && !isSafeUriAttribute(attr.value)) return '';

  const outputName =
    name === 'viewbox' ? 'viewBox' : name === 'preserveaspectratio' ? 'preserveAspectRatio' : name;
  return ` ${outputName}="${escapeHtml(decodeHtmlEntities(attr.value))}"`;
}

function sanitizeHtmlFragment(input: unknown, policy: HtmlSanitizePolicy): string {
  const source = String(input || '');
  const output: string[] = [];
  const stack: string[] = [];
  let index = 0;

  while (index < source.length) {
    if (source[index] !== '<') {
      output.push(escapeHtml(source[index]));
      index += 1;
      continue;
    }

    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index + 4);
      index = commentEnd >= 0 ? commentEnd + 3 : source.length;
      continue;
    }

    const token = readHtmlTagToken(source, index);
    if (!token) {
      output.push('&lt;');
      index += 1;
      continue;
    }

    if (!policy.allowedTags.has(token.name)) {
      index =
        HTML_RAW_TEXT_TAGS.has(token.name) && !token.closing
          ? findRawTextClose(source, token.name, token.endIndex + 1)
          : token.endIndex + 1;
      continue;
    }

    if (token.closing) {
      const stackIndex = stack.lastIndexOf(token.name);
      if (stackIndex >= 0) {
        for (let cursor = stack.length - 1; cursor >= stackIndex; cursor -= 1) {
          const tagName = stack.pop();
          if (tagName) output.push(`</${tagName}>`);
        }
      }
      index = token.endIndex + 1;
      continue;
    }

    const safeAttrs = token.attrs
      .map((attr) => sanitizeHtmlAttribute(token.name, attr, policy))
      .join('');
    const isVoid = HTML_VOID_TAGS.has(token.name);

    output.push(`<${token.name}${safeAttrs}>`);
    if (!token.selfClosing && !isVoid) stack.push(token.name);

    index = token.endIndex + 1;
  }

  while (stack.length > 0) {
    const tagName = stack.pop();
    if (tagName) output.push(`</${tagName}>`);
  }

  return output.join('');
}

export { escapeHtml, decodeHtmlEntities, htmlToText, sanitizeHtmlFragment };
export type { HtmlSanitizePolicy };
