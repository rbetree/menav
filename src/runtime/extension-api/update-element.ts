import type { MeNavApi } from '../types';

import { menavSanitizeClassList, menavSanitizeUrl } from '../shared.ts';

function valueText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

// 更新 DOM 元素
function updateElement(
  this: MeNavApi,
  type: string,
  id: string,
  newData: Record<string, unknown>
): boolean {
  const element = this._findElement ? this._findElement(type, id) : null;
  if (!element) return false;

  if (type === 'site') {
    // 更新站点卡片
    if (newData.url) {
      const safeUrl = menavSanitizeUrl(newData.url, 'updateElement(site).url');
      element.setAttribute('href', safeUrl);
      // 保留原始 URL 供扩展/调试读取，但点击行为以 href 的安全降级为准
      element.setAttribute('data-url', String(newData.url).trim());
    }
    if (newData.name) {
      const name = valueText(newData.name);
      const titleElement = element.querySelector('h3');
      if (titleElement) titleElement.textContent = name;
      element.setAttribute('data-name', name);
    }
    if (newData.description) {
      const description = valueText(newData.description);
      const descriptionElement = element.querySelector('p');
      if (descriptionElement) descriptionElement.textContent = description;
      element.setAttribute('data-description', description);
    }
    if (newData.icon) {
      const iconElement =
        element.querySelector('i.icon-fallback') ||
        element.querySelector('i.site-icon') ||
        element.querySelector('.site-card-icon i') ||
        element.querySelector('i');

      if (iconElement) {
        const nextIconClass = menavSanitizeClassList(newData.icon, 'updateElement(site).icon');
        const preservedClasses = [];

        if (iconElement.classList.contains('icon-fallback')) {
          preservedClasses.push('icon-fallback');
        }
        if (iconElement.classList.contains('site-icon')) {
          preservedClasses.push('site-icon');
        }

        if (nextIconClass) {
          iconElement.className = nextIconClass;
          preservedClasses.forEach((cls) => iconElement.classList.add(cls));
        }
      }
      element.setAttribute(
        'data-icon',
        menavSanitizeClassList(newData.icon, 'updateElement(site).data-icon')
      );
    }
    if (newData.title) element.title = valueText(newData.title);

    // 触发元素更新事件
    this.events?.emit('elementUpdated', {
      id: id,
      type: 'site',
      data: newData,
    });

    return true;
  } else if (type === 'category') {
    // 更新分类
    if (newData.name) {
      const titleElement = element.querySelector('h2');
      if (titleElement) {
        const iconElement = titleElement.querySelector('i');
        const iconClass = iconElement ? iconElement.className : '';
        const nextIcon = menavSanitizeClassList(
          newData.icon || iconClass,
          'updateElement(category).icon'
        );

        // 用 DOM API 重建标题，避免 innerHTML 注入
        titleElement.textContent = '';
        const nextIconEl = document.createElement('i');
        if (nextIcon) nextIconEl.className = nextIcon;
        titleElement.appendChild(nextIconEl);
        titleElement.appendChild(document.createTextNode(' ' + String(newData.name)));
      }
      element.setAttribute('data-name', valueText(newData.name));
    }
    if (newData.icon) {
      element.setAttribute(
        'data-icon',
        menavSanitizeClassList(newData.icon, 'updateElement(category).data-icon')
      );
    }

    // 触发元素更新事件
    this.events?.emit('elementUpdated', {
      id: id,
      type: 'category',
      data: newData,
    });

    return true;
  } else if (type === 'nav-item') {
    // 更新导航项
    if (newData.name) {
      const textElement = element.querySelector('.nav-text');
      if (textElement) {
        textElement.textContent = valueText(newData.name);
      }
      element.setAttribute('data-name', valueText(newData.name));
    }
    if (newData.icon) {
      const iconElement = element.querySelector('i');
      if (iconElement) {
        iconElement.className = menavSanitizeClassList(
          newData.icon,
          'updateElement(nav-item).icon'
        );
      }
      element.setAttribute(
        'data-icon',
        menavSanitizeClassList(newData.icon, 'updateElement(nav-item).data-icon')
      );
    }

    // 触发元素更新事件
    this.events?.emit('elementUpdated', {
      id: id,
      type: 'nav-item',
      data: newData,
    });

    return true;
  } else if (type === 'social-link') {
    // 更新社交链接
    if (newData.url) {
      const safeUrl = menavSanitizeUrl(newData.url, 'updateElement(social-link).url');
      element.setAttribute('href', safeUrl);
      // 保留原始 URL 供扩展/调试读取，但点击行为以 href 的安全降级为准
      element.setAttribute('data-url', String(newData.url).trim());
    }
    if (newData.name) {
      const textElement = element.querySelector('.nav-text');
      if (textElement) {
        textElement.textContent = valueText(newData.name);
      }
      element.setAttribute('data-name', valueText(newData.name));
    }
    if (newData.icon) {
      const iconElement = element.querySelector('i');
      if (iconElement) {
        iconElement.className = menavSanitizeClassList(
          newData.icon,
          'updateElement(social-link).icon'
        );
      }
      element.setAttribute(
        'data-icon',
        menavSanitizeClassList(newData.icon, 'updateElement(social-link).data-icon')
      );
    }

    // 触发元素更新事件
    this.events?.emit('elementUpdated', {
      id: id,
      type: 'social-link',
      data: newData,
    });

    return true;
  }

  return false;
}

export { updateElement };
