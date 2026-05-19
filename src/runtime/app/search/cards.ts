import type { RuntimeSearchIndexItem } from '../../types';

const { createElement } = require('./dom.ts') as {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
    text?: string
  ) => HTMLElementTagNameMap[K];
};
const { createCardIcon } = require('./icons.ts') as {
  createCardIcon: (options: {
    name: string;
    url: string;
    icon: string;
    faviconUrl?: string;
    forceIconMode?: string;
  }) => HTMLElement;
};

function createCardFromIndexItem(item: RuntimeSearchIndexItem): HTMLElement {
  const card = createElement('a');
  const isRepo = item.style === 'repo';
  const isArticle = item.type === 'article';

  card.href = item.url || '#';
  card.className = ['site-card', isRepo ? 'site-card-repo' : ''].filter(Boolean).join(' ');
  card.dataset.type = isArticle ? 'article' : 'site';
  card.dataset.name = item.title;
  card.dataset.url = item.url || '#';
  card.dataset.icon = item.icon || '';
  if (item.faviconUrl) card.dataset.faviconUrl = item.faviconUrl;
  if (item.forceIconMode) card.dataset.forceIconMode = item.forceIconMode;
  card.dataset.description = item.description || '';
  card.dataset.tooltip = `${item.title} - ${item.description || item.url || ''}`;
  if (item.publishedAt) card.dataset.publishedAt = item.publishedAt;
  if (item.source) card.dataset.source = item.source;
  if (item.external) {
    card.target = '_blank';
    card.rel = 'noopener';
  }

  if (isArticle) {
    const header = createElement('div', 'article-card-header');
    const iconWrap = createCardIcon({
      name: item.title,
      url: item.url,
      icon: item.icon || 'fas fa-pen',
      faviconUrl: item.faviconUrl,
      forceIconMode: item.forceIconMode,
    });
    const titleWrap = createElement('div', 'article-card-title');
    titleWrap.appendChild(createElement('h3', '', item.title));
    header.append(iconWrap, titleWrap);

    const body = createElement('div', 'article-card-body');
    if (item.publishedAt || item.source) {
      const meta = createElement('div', 'site-card-meta');
      if (item.publishedAt)
        meta.appendChild(
          createElement('span', 'site-card-meta-date', item.publishedAt.slice(0, 10))
        );
      if (item.publishedAt && item.source)
        meta.appendChild(createElement('span', 'site-card-meta-sep', '·'));
      if (item.source)
        meta.appendChild(createElement('span', 'site-card-meta-source', item.source));
      body.appendChild(meta);
    }
    body.appendChild(createElement('p', '', item.description));
    card.append(header, body);
    return card;
  }

  if (isRepo) {
    const header = createElement('div', 'repo-header');
    header.appendChild(createElement('i', `${item.icon || 'fas fa-code'} repo-icon`));
    header.appendChild(createElement('div', 'repo-title', item.title));
    card.appendChild(header);
    card.appendChild(createElement('div', 'repo-desc', item.description));

    if (item.language || item.stars || item.forks || item.issues) {
      const stats = createElement('div', 'repo-stats');

      if (item.language) {
        const language = createElement('div', 'stat-item');
        const dot = createElement('span', 'lang-dot');
        dot.style.backgroundColor = item.languageColor || '#909296';
        language.append(dot, document.createTextNode(item.language));
        stats.appendChild(language);
      }

      if (item.stars) {
        const stars = createElement('div', 'stat-item');
        stars.append(createElement('i', 'far fa-star'), document.createTextNode(` ${item.stars}`));
        stats.appendChild(stars);
      }

      if (item.forks) {
        const forks = createElement('div', 'stat-item');
        forks.append(
          createElement('i', 'fas fa-code-branch'),
          document.createTextNode(` ${item.forks}`)
        );
        stats.appendChild(forks);
      }

      if (item.issues) {
        const issues = createElement('div', 'stat-item');
        issues.append(
          createElement('i', 'fas fa-exclamation-circle'),
          document.createTextNode(` ${item.issues}`)
        );
        stats.appendChild(issues);
      }

      card.appendChild(stats);
    }

    return card;
  }

  const iconWrap = createCardIcon({
    name: item.title,
    url: item.url,
    icon: item.icon || 'fas fa-link',
    faviconUrl: item.faviconUrl,
    forceIconMode: item.forceIconMode,
  });
  const content = createElement('div', 'site-card-content');
  content.appendChild(createElement('h3', '', item.title));
  content.appendChild(createElement('p', '', item.description));
  card.append(iconWrap, content);
  return card;
}

module.exports = {
  createCardFromIndexItem,
};
