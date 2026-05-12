import type { MenavConfig, MenavConfigData, MeNavApi } from '../types';

const { menavExtractDomain, menavSanitizeClassList, menavSanitizeUrl } = require('../shared.ts') as typeof import('../shared');
const { SELECTORS, qs, dataTypeAttrSelector } = require('../dom/selectors.ts') as typeof import('../dom/selectors');

type ExtensionElementData = Record<string, unknown> & {
  name?: unknown;
  url?: unknown;
  icon?: unknown;
  description?: unknown;
  faviconUrl?: unknown;
  forceIconMode?: unknown;
  language?: unknown;
  languageColor?: unknown;
  stars?: unknown;
  forks?: unknown;
  issues?: unknown;
};

type LegacyPageConfig = { template?: unknown };

function valueText(value: unknown, fallback = ''): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text || fallback;
}

// 添加新元素
module.exports = function addElement(
  this: MeNavApi,
  type: string,
  parentId: string,
  data: ExtensionElementData
): Element | string | null {
  if (type === 'site') {
    // 查找父级分类
    const parent = qs(dataTypeAttrSelector('category', 'data-name', parentId));
    if (!parent) return null;

    // 添加站点卡片到分类
    const sitesContainer = qs(SELECTORS.sitesContainer, parent);
    if (!sitesContainer) return null;

    // 站点卡片样式：根据“页面模板”决定（friends/articles/projects 等）
    let siteCardStyle = '';
    try {
      const pageEl = parent.closest('.page');
      const pageId = pageEl && pageEl.id ? String(pageEl.id).trim() : '';
      const cfg: MenavConfig | null =
        window.MeNav && typeof window.MeNav.getConfig === 'function'
          ? window.MeNav.getConfig()
          : null;

      let templateName = '';

      const pageTemplates =
        cfg && cfg.data && cfg.data.pageTemplates && typeof cfg.data.pageTemplates === 'object'
          ? cfg.data.pageTemplates
          : null;

      const templateFromMap =
        pageTemplates && pageId && pageTemplates[pageId]
          ? String(pageTemplates[pageId]).trim()
          : '';

      // 兼容旧版：cfg.data[pageId].template
      const legacyPageConfig =
        cfg && cfg.data && pageId && typeof cfg.data[pageId] === 'object'
          ? (cfg.data[pageId] as LegacyPageConfig)
          : null;
      const templateFromLegacy =
        legacyPageConfig && legacyPageConfig.template
          ? String(legacyPageConfig.template).trim()
          : '';

      if (templateFromMap) {
        templateName = templateFromMap;
      } else if (templateFromLegacy) {
        templateName = templateFromLegacy;
      }

      // projects 页面使用代码仓库风格卡片（与 Astro SiteCard 组件保持一致）
      if (templateName === 'projects') siteCardStyle = 'repo';
    } catch (e) {
      siteCardStyle = '';
    }

    // 创建新的站点卡片
    const newSite = document.createElement('a');
    newSite.className = siteCardStyle ? `site-card site-card-${siteCardStyle}` : 'site-card';

    const siteName = valueText(data.name, '未命名站点');
    const siteUrl = valueText(data.url, '#');
    const siteIcon = valueText(data.icon, 'fas fa-link');
    const siteDescription = valueText(data.description, data.url ? menavExtractDomain(data.url) : '');
    const siteFaviconUrl = data && data.faviconUrl ? String(data.faviconUrl).trim() : '';
    const siteForceIconModeRaw =
      data && data.forceIconMode ? String(data.forceIconMode).trim() : '';
    const siteForceIconMode =
      siteForceIconModeRaw === 'manual' || siteForceIconModeRaw === 'favicon'
        ? siteForceIconModeRaw
        : '';

    const safeSiteUrl = menavSanitizeUrl(siteUrl, 'addElement(site).url');
    const safeSiteIcon = menavSanitizeClassList(siteIcon, 'addElement(site).icon');

    newSite.setAttribute('href', safeSiteUrl);
    newSite.title = siteName + (siteDescription ? ' - ' + siteDescription : '');
    newSite.setAttribute(
      'data-tooltip',
      siteName + (siteDescription ? ' - ' + siteDescription : '')
    );
    if (/^https?:\/\//i.test(safeSiteUrl)) {
      newSite.target = '_blank';
      newSite.rel = 'noopener';
    }

    // 设置数据属性
    newSite.setAttribute('data-type', 'site');
    newSite.setAttribute('data-name', siteName);
    // 保留原始 URL（data-url）供扩展/调试读取；href 仍会做安全降级
    newSite.setAttribute('data-url', String(data.url || '').trim());
    newSite.setAttribute('data-icon', safeSiteIcon);
    if (siteFaviconUrl) newSite.setAttribute('data-favicon-url', siteFaviconUrl);
    if (siteForceIconMode) newSite.setAttribute('data-force-icon-mode', siteForceIconMode);
    newSite.setAttribute('data-description', siteDescription);

    // projects repo 风格：与模板中的 repo 结构保持一致（不走 favicon 逻辑）
    if (siteCardStyle === 'repo') {
      const repoHeader = document.createElement('div');
      repoHeader.className = 'repo-header';

      const repoIcon = document.createElement('i');
      repoIcon.className = `${safeSiteIcon || 'fas fa-code'} repo-icon`;
      repoIcon.setAttribute('aria-hidden', 'true');

      const repoTitle = document.createElement('div');
      repoTitle.className = 'repo-title';
      repoTitle.textContent = siteName;

      repoHeader.appendChild(repoIcon);
      repoHeader.appendChild(repoTitle);

      const repoDesc = document.createElement('div');
      repoDesc.className = 'repo-desc';
      repoDesc.textContent = siteDescription;

      newSite.appendChild(repoHeader);
      newSite.appendChild(repoDesc);

      const hasStats = data && (data.language || data.stars || data.forks || data.issues);

      if (hasStats) {
        const repoStats = document.createElement('div');
        repoStats.className = 'repo-stats';

        if (data.language) {
          const languageItem = document.createElement('div');
          languageItem.className = 'stat-item';

          const langDot = document.createElement('span');
          langDot.className = 'lang-dot';
          langDot.style.backgroundColor = valueText(data.languageColor, '#909296');

          languageItem.appendChild(langDot);
          languageItem.appendChild(document.createTextNode(String(data.language)));
          repoStats.appendChild(languageItem);
        }

        if (data.stars) {
          const starsItem = document.createElement('div');
          starsItem.className = 'stat-item';

          const starIcon = document.createElement('i');
          starIcon.className = 'far fa-star';
          starIcon.setAttribute('aria-hidden', 'true');
          starsItem.appendChild(starIcon);
          starsItem.appendChild(document.createTextNode(String(data.stars)));
          repoStats.appendChild(starsItem);
        }

        if (data.forks) {
          const forksItem = document.createElement('div');
          forksItem.className = 'stat-item';

          const forkIcon = document.createElement('i');
          forkIcon.className = 'fas fa-code-branch';
          forkIcon.setAttribute('aria-hidden', 'true');
          forksItem.appendChild(forkIcon);
          forksItem.appendChild(document.createTextNode(String(data.forks)));
          repoStats.appendChild(forksItem);
        }

        if (data.issues) {
          const issuesItem = document.createElement('div');
          issuesItem.className = 'stat-item';

          const issueIcon = document.createElement('i');
          issueIcon.className = 'fas fa-exclamation-circle';
          issueIcon.setAttribute('aria-hidden', 'true');
          issuesItem.appendChild(issueIcon);
          issuesItem.appendChild(document.createTextNode(String(data.issues)));
          repoStats.appendChild(issuesItem);
        }

        newSite.appendChild(repoStats);
      }
    } else {
      // 普通站点卡片：复用现有结构（支持 favicon）
      const siteCardIcon = document.createElement('div');
      siteCardIcon.className = 'site-card-icon';

      const iconEl = document.createElement('i');
      iconEl.className = safeSiteIcon || 'fas fa-link';
      iconEl.setAttribute('aria-hidden', 'true');

      // 添加内容（根据图标模式渲染，避免 innerHTML 注入）
      siteCardIcon.appendChild(iconEl);

      const titleEl = document.createElement('h3');
      titleEl.textContent = siteName;

      const descEl = document.createElement('p');
      descEl.textContent = siteDescription;

      newSite.appendChild(siteCardIcon);
      newSite.appendChild(titleEl);
      newSite.appendChild(descEl);

      // favicon 模式：优先加载 faviconUrl；否则按 url 生成
      try {
        const cfg: MenavConfigData | null =
          window.MeNav && typeof window.MeNav.getConfig === 'function'
            ? window.MeNav.getConfig()?.data || null
            : null;
        const iconsMode =
          cfg && cfg.icons && cfg.icons.mode ? String(cfg.icons.mode).trim() : 'favicon';
        const iconsRegion =
          cfg && cfg.icons && cfg.icons.region ? String(cfg.icons.region).trim() : 'com';

        const forceMode = siteForceIconMode || '';
        const shouldUseFavicon = forceMode ? forceMode === 'favicon' : iconsMode === 'favicon';

        if (shouldUseFavicon) {
          const faviconImg = document.createElement('img');
          faviconImg.className = 'site-icon';
          faviconImg.loading = 'lazy';
          faviconImg.alt = siteName;

          const fallbackToIcon = () => {
            faviconImg.remove();
            iconEl.classList.add('icon-fallback');
          };

          // 超时处理：5秒后如果还没加载成功，显示回退图标
          const timeoutId = setTimeout(() => {
            fallbackToIcon();
          }, 5000);

          faviconImg.onerror = () => {
            clearTimeout(timeoutId);
            fallbackToIcon();
          };
          faviconImg.onload = () => {
            clearTimeout(timeoutId);
            iconEl.remove();
          };

          if (siteFaviconUrl) {
            faviconImg.src = siteFaviconUrl;
          } else {
            const urlToUse = String(data.url || '').trim();
            if (urlToUse) {
              // 根据 icons.region 配置决定优先使用哪个域名
              const urls: string[] = [];
              // drop_404_icon=true：缺失 favicon 时返回空 404，避免占位图导致 onerror 不触发，从而可靠走回退逻辑
              const comUrl = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
                urlToUse
              )}&size=32&drop_404_icon=true`;
              const cnUrl = `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
                urlToUse
              )}&size=32&drop_404_icon=true`;
              if (iconsRegion === 'cn') {
                urls.push(cnUrl, comUrl);
              } else {
                urls.push(comUrl, cnUrl);
              }

              let idx = 0;
              faviconImg.src = urls[idx];

              // 超时处理：3秒后如果还没加载成功，尝试回退 URL 或显示 Font Awesome 图标
              const fallbackTimeoutId = setTimeout(() => {
                idx += 1;
                if (idx < urls.length) {
                  faviconImg.src = urls[idx];
                } else {
                  fallbackToIcon();
                }
              }, 3000);

              const cleanup = () => clearTimeout(fallbackTimeoutId);
              faviconImg.onload = () => {
                clearTimeout(timeoutId);
                cleanup();
                iconEl.remove();
              };
              faviconImg.onerror = () => {
                clearTimeout(timeoutId);
                cleanup();
                idx += 1;
                if (idx < urls.length) {
                  faviconImg.src = urls[idx];
                } else {
                  fallbackToIcon();
                }
              };
            }
          }

          siteCardIcon.insertBefore(faviconImg, iconEl);
        } else {
          iconEl.classList.add('icon-fallback');
        }
      } catch (e) {
        iconEl.classList.add('icon-fallback');
      }
    }

    // 添加到 DOM
    sitesContainer.appendChild(newSite);

    // 移除“暂无网站”提示（如果存在）
    const emptySites = sitesContainer.querySelector('.empty-sites');
    if (emptySites) {
      emptySites.remove();
    }

    // 触发元素添加事件
    this.events?.emit('elementAdded', {
      id: siteName,
      type: 'site',
      parentId: parentId,
      data: data,
    });

    return siteName;
  } else if (type === 'category') {
    // 查找父级页面容器
    const parent = qs(`[data-page="${parentId}"]`);
    if (!parent) return null;

    // 创建新的分类
    const newCategory = document.createElement('section');
    newCategory.className = 'category';
    newCategory.setAttribute('data-type', 'category');
    const categoryName = valueText(data.name, '未命名分类');
    newCategory.setAttribute('data-name', categoryName);
    if (data.icon) {
      newCategory.setAttribute(
        'data-icon',
        menavSanitizeClassList(data.icon, 'addElement(category).data-icon')
      );
    }

    // 设置数据属性
    newCategory.setAttribute('data-level', '1');

    // 添加内容（用 DOM API 构建，避免 innerHTML 注入）
    const titleEl = document.createElement('h2');
    const iconEl = document.createElement('i');
    iconEl.className = menavSanitizeClassList(
      valueText(data.icon, 'fas fa-folder'),
      'addElement(category).icon'
    );
    titleEl.appendChild(iconEl);
    titleEl.appendChild(document.createTextNode(' ' + categoryName));

    const sitesGrid = document.createElement('div');
    sitesGrid.className = 'sites-grid';
    sitesGrid.setAttribute('data-container', 'sites');
    const emptyEl = document.createElement('p');
    emptyEl.className = 'empty-sites';
    emptyEl.textContent = '暂无网站';
    sitesGrid.appendChild(emptyEl);

    newCategory.appendChild(titleEl);
    newCategory.appendChild(sitesGrid);

    // 添加到 DOM
    parent.appendChild(newCategory);

    // 触发元素添加事件
    this.events?.emit('elementAdded', {
      id: categoryName,
      type: 'category',
      data: data,
    });

    return categoryName;
  }

  return null;
};
