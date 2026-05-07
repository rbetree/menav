const { SELECTORS, qs } = require('../../dom/selectors.ts') as typeof import('../../dom/selectors');

module.exports = function highlightSearchTerm(card: HTMLElement | null, searchTerm: string): void {
  if (!card || !searchTerm) return;

  const escapeRegExp = (string: string): string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    // 兼容 projects repo 卡片：title/desc 不一定是 h3/p
    const titleElement = qs(SELECTORS.siteTitle, card) || qs(SELECTORS.repoTitle, card);
    const descriptionElement =
      qs(SELECTORS.siteDescription, card) || qs(SELECTORS.repoDescription, card);

    const hasPinyinMatch =
      typeof PinyinMatch !== 'undefined' && PinyinMatch && typeof PinyinMatch.match === 'function';

    const applyRangeHighlight = (element: HTMLElement, start: number, end: number): void => {
      const text = element.textContent || '';
      const safeStart = Math.max(0, Math.min(text.length, start));
      const safeEnd = Math.max(safeStart, Math.min(text.length - 1, end));

      const fragment = document.createDocumentFragment();
      fragment.appendChild(document.createTextNode(text.slice(0, safeStart)));

      const span = document.createElement('span');
      span.className = 'highlight';
      span.textContent = text.slice(safeStart, safeEnd + 1);
      fragment.appendChild(span);

      fragment.appendChild(document.createTextNode(text.slice(safeEnd + 1)));

      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      element.appendChild(fragment);
    };

    const highlightInElement = (element: HTMLElement | null): void => {
      if (!element) return;

      const rawText = element.textContent || '';
      const lowerText = rawText.toLowerCase();
      if (!rawText) return;

      if (lowerText.includes(searchTerm)) {
        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(rawText)) !== null) {
          if (match.index > lastIndex) {
            fragment.appendChild(
              document.createTextNode(rawText.substring(lastIndex, match.index))
            );
          }

          const span = document.createElement('span');
          span.className = 'highlight';
          span.textContent = match[0];
          fragment.appendChild(span);

          lastIndex = match.index + match[0].length;

          // 防止无限循环
          if (regex.lastIndex === 0) break;
        }

        if (lastIndex < rawText.length) {
          fragment.appendChild(document.createTextNode(rawText.substring(lastIndex)));
        }

        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        element.appendChild(fragment);
        return;
      }

      if (hasPinyinMatch) {
        const arr = PinyinMatch.match(rawText, searchTerm);
        if (Array.isArray(arr) && arr.length >= 2) {
          const [start, end] = arr;
          applyRangeHighlight(element, Number(start), Number(end));
        }
      }
    };

    highlightInElement(titleElement);
    highlightInElement(descriptionElement);
  } catch (error) {
    console.error('Error highlighting search term');
  }
};
