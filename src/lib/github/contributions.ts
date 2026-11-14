import { htmlToText, sanitizeHtmlFragment, type HtmlSanitizePolicy } from '../security/html.ts';

const GITHUB_CONTRIBUTIONS_HTML_POLICY: HtmlSanitizePolicy = {
  allowedTags: new Set([
    'a',
    'caption',
    'div',
    'g',
    'h2',
    'p',
    'rect',
    'span',
    'svg',
    'table',
    'tbody',
    'td',
    'text',
    'th',
    'thead',
    'tool-tip',
    'tr',
  ]),
  globalAttributes: new Set([
    'class',
    'height',
    'hidden',
    'id',
    'role',
    'tabindex',
    'title',
    'width',
  ]),
  tagAttributes: {
    a: new Set(['href']),
    g: new Set(['transform']),
    rect: new Set(['height', 'rx', 'ry', 'width', 'x', 'y']),
    svg: new Set(['height', 'preserveaspectratio', 'viewbox', 'width']),
    table: new Set(['summary']),
    td: new Set(['colspan', 'headers', 'rowspan']),
    text: new Set(['dx', 'dy', 'x', 'y']),
    th: new Set(['colspan', 'headers', 'rowspan', 'scope']),
  },
  uriAttributes: new Set(['href']),
};

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

  const inner = sanitizeHtmlFragment(
    outerHtml.slice(openEnd + 1, closeStart),
    GITHUB_CONTRIBUTIONS_HTML_POLICY
  );

  return inner.trim() ? inner : null;
}

function sanitizeContributionsHtml(html: unknown): string {
  return sanitizeHtmlFragment(String(html || ''), GITHUB_CONTRIBUTIONS_HTML_POLICY);
}

type PreparedHeatmapHtml = {
  html: string;
  summary: string;
};

// 清洗后仍出现这些标记说明输入结构异常：宁可隐藏可视化，也不把焦点元素或链接放回页面。
const UNSAFE_AFTER_CLEAN_PATTERN =
  /<\s*\/?\s*(?:a|area|button|embed|iframe|input|object|select|textarea)\b|\btabindex\s*=|role\s*=\s*["']?(?:grid|gridcell)\b|aria-(?:selected|readonly|describedby)\s*=/i;

const TRACKING_ATTRIBUTE_PATTERN =
  /\s(?:tabindex|role|aria-[a-z-]+|data-hydro-click(?:-hmac)?)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;

function removeElementBlocks(html: string, tagName: string): string {
  return html.replace(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, 'gi'), '');
}

// 消毒后的 HTML 中属性值里的 > 已转义，标签内不会再出现裸 >，可安全按标签逐个处理。
function stripInteractivityAttributes(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => tag.replace(TRACKING_ATTRIBUTE_PATTERN, ''));
}

function extractHeatmapSummary(html: string): string {
  const match = html.match(
    /<h2\b[^>]*\bid=["']js-contribution-activity-description["'][^>]*>([\s\S]*?)<\/h2\s*>/i
  );
  return match ? htmlToText(match[1]) : '';
}

function prepareHeatmapHtml(input: unknown): PreparedHeatmapHtml {
  const source = String(input || '');
  if (!source.trim()) return { html: '', summary: '' };

  const summary = extractHeatmapSummary(source);

  let html = removeElementBlocks(source, 'a');
  html = removeElementBlocks(html, 'tool-tip');
  html = html.replace(/<\/?tool-tip\b[^>]*>/gi, '');
  html = stripInteractivityAttributes(html);

  if (UNSAFE_AFTER_CLEAN_PATTERN.test(html)) {
    return { html: '', summary };
  }

  const trimmed = html.trim();
  if (!htmlToText(trimmed)) {
    return { html: '', summary };
  }

  return { html: trimmed, summary };
}

export { extractYearlyContributionsInnerHtml, sanitizeContributionsHtml, prepareHeatmapHtml };
export type { PreparedHeatmapHtml };
