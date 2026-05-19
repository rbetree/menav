const { createElement, normalizeText } = require('./dom.ts') as {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
    text?: string
  ) => HTMLElementTagNameMap[K];
  normalizeText: (value: unknown) => string;
};
const { getRuntimeConfig } =
  require('../../runtime-config.ts') as typeof import('../../runtime-config');

type IconRenderOptions = {
  name: string;
  url: string;
  icon: string;
  faviconUrl?: string;
  forceIconMode?: string;
};

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function buildFaviconV2Url(url: string, domain: string): string {
  return `https://${domain}/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=32&drop_404_icon=true`;
}

function getIconConfig(): { mode: string; region: string } {
  try {
    const config = getRuntimeConfig();
    const icons = config && config.icons && typeof config.icons === 'object' ? config.icons : null;
    return {
      mode: icons && icons.mode === 'manual' ? 'manual' : 'favicon',
      region: icons && icons.region === 'cn' ? 'cn' : 'com',
    };
  } catch (error) {
    return { mode: 'favicon', region: 'com' };
  }
}

function createCardIcon(options: IconRenderOptions): HTMLElement {
  const iconWrap = createElement('div', 'site-card-icon');
  iconWrap.setAttribute('aria-hidden', 'true');

  const { mode, region } = getIconConfig();
  const forceIconMode = normalizeText(options.forceIconMode);
  const shouldUseFavicon = forceIconMode ? forceIconMode === 'favicon' : mode === 'favicon';
  const canUseGeneratedFavicon = shouldUseFavicon && isHttpUrl(options.url);
  const primaryDomain = region === 'cn' ? 't3.gstatic.cn' : 't3.gstatic.com';
  const fallbackDomain = region === 'cn' ? 't3.gstatic.com' : 't3.gstatic.cn';
  const src =
    normalizeText(options.faviconUrl) ||
    (canUseGeneratedFavicon ? buildFaviconV2Url(options.url, primaryDomain) : '');

  if (!src) {
    iconWrap.appendChild(createElement('i', `${options.icon || 'fas fa-link'} site-icon`));
    return iconWrap;
  }

  const container = createElement('div', 'icon-container');
  const placeholder = createElement('i', 'fas fa-circle-notch fa-spin icon-placeholder');
  const img = createElement('img', 'favicon-icon') as HTMLImageElement;
  const fallback = createElement('i', `${options.icon || 'fas fa-link'} icon-fallback`);

  placeholder.setAttribute('aria-hidden', 'true');
  fallback.setAttribute('aria-hidden', 'true');
  img.src = src;
  img.alt = `${options.name} favicon`;
  img.loading = 'lazy';

  img.addEventListener('load', () => {
    img.classList.add('loaded');
    placeholder.classList.add('hidden');
  });

  img.addEventListener('error', () => {
    if (canUseGeneratedFavicon && !img.dataset.faviconFallbackTried) {
      img.dataset.faviconFallbackTried = '1';
      img.src = buildFaviconV2Url(options.url, fallbackDomain);
      return;
    }
    img.classList.add('error');
    placeholder.classList.add('hidden');
    fallback.classList.add('visible');
  });

  container.append(placeholder, img, fallback);
  iconWrap.appendChild(container);
  return iconWrap;
}

module.exports = {
  buildFaviconV2Url,
  createCardIcon,
  getIconConfig,
};
