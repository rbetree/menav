function normalizeText(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).trim();
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

module.exports = {
  createElement,
  normalizeText,
};

