function extractYearlyContributionsInnerHtml(html: string): string | null {
  const source = String(html || '');
  if (!source) return null;

  const marker = 'js-yearly-contributions';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  const openTagStart = source.lastIndexOf('<div', markerIndex);
  if (openTagStart < 0) return null;

  let depth = 0;
  let cursor = openTagStart;
  let endIndex = -1;

  while (cursor < source.length) {
    const nextOpen = source.indexOf('<div', cursor);
    const nextClose = source.indexOf('</div', cursor);

    if (nextOpen === -1 && nextClose === -1) break;

    const isOpen = nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose);
    const tagIndex = isOpen ? nextOpen : nextClose;
    const tagEnd = source.indexOf('>', tagIndex);
    if (tagEnd === -1) break;

    if (isOpen) {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        endIndex = tagEnd + 1;
        break;
      }
    }

    cursor = tagEnd + 1;
  }

  if (endIndex === -1) return null;

  const outerHtml = source.slice(openTagStart, endIndex);
  if (!outerHtml.includes(marker)) return null;

  const openEnd = outerHtml.indexOf('>');
  const closeStart = outerHtml.lastIndexOf('</div');
  if (openEnd === -1 || closeStart === -1 || closeStart <= openEnd) return null;

  let inner = outerHtml.slice(openEnd + 1, closeStart);
  inner = inner.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  return inner.trim() ? inner : null;
}

export { extractYearlyContributionsInnerHtml };
