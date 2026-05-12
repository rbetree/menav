import type { MeNavApi, RuntimeEvents } from '../types';

const { menavDetectVersion } = require('../shared.ts') as typeof import('../shared');
const { qs, dataTypeAttrSelector } = require('../dom/selectors.ts') as typeof import('../dom/selectors');

const createMenavEvents = require('./events.ts') as () => RuntimeEvents;
const getConfig = require('./get-config.ts');
const updateElement = require('./update-element.ts');
const addElement = require('./add-element.ts');
const removeElement = require('./remove-element.ts');
const getAllElements = require('./get-all-elements.ts');

function getDefaultElementId(element: HTMLElement): string | null {
  const type = element.getAttribute('data-type');
  if (type === 'nav-item') {
    return element.getAttribute('data-id');
  } else if (type === 'social-link') {
    return element.getAttribute('data-url');
  } else {
    // 优先使用 data-id（例如分类 slug），回退 data-name（兼容旧扩展/旧页面）
    return element.getAttribute('data-id') || element.getAttribute('data-name');
  }
}

function findDefaultElement(type: string, id: string): HTMLElement | null {
  let selector: string;
  if (type === 'nav-item') {
    selector = `[data-type="${type}"][data-id="${id}"]`;
  } else if (type === 'social-link') {
    selector = `[data-type="${type}"][data-url="${id}"]`;
  } else if (type === 'site') {
    // 站点：优先用 data-url（更稳定），回退 data-id/data-name
    return (
      qs(dataTypeAttrSelector(type, 'data-url', id)) ||
      qs(dataTypeAttrSelector(type, 'data-id', id)) ||
      qs(dataTypeAttrSelector(type, 'data-name', id))
    );
  } else {
    // 其他：优先 data-id（例如分类 slug），回退 data-name（兼容旧扩展/旧页面）
    return (
      qs(dataTypeAttrSelector(type, 'data-id', id)) ||
      qs(dataTypeAttrSelector(type, 'data-name', id))
    );
  }
  return qs(selector);
}

// 全局 MeNav 对象 - 用于浏览器扩展
const existing: MeNavApi = window.MeNav && typeof window.MeNav === 'object' ? window.MeNav : {};
const events =
  existing.events && typeof existing.events === 'object' ? existing.events : createMenavEvents();

window.MeNav = Object.assign(existing, {
  version: menavDetectVersion(),

  getConfig: getConfig,

  // 获取元素的唯一标识符
  _getElementId: getDefaultElementId,

  // 根据类型和ID查找元素
  _findElement: findDefaultElement,

  // 元素操作
  updateElement: updateElement,
  addElement: addElement,
  removeElement: removeElement,
  getAllElements: getAllElements,

  // 事件系统
  events: events,
});

module.exports = window.MeNav;
