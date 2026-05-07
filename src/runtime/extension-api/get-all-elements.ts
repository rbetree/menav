import type { MeNavApi } from '../types';

const { qsa, dataTypeSelector } = require('../dom/selectors.ts') as typeof import('../dom/selectors');

// 获取所有元素
module.exports = function getAllElements(this: MeNavApi, type: string) {
  return Array.from(qsa(dataTypeSelector(type))).map((el: HTMLElement) => {
    const id = this._getElementId ? this._getElementId(el) : null;
    return {
      id: id,
      type: type,
      element: el,
    };
  });
};
