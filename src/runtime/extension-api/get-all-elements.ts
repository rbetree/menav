import type { MeNavApi } from '../types';

import { qsa, dataTypeSelector } from '../dom/selectors.ts';

// 获取所有元素
function getAllElements(this: MeNavApi, type: string) {
  return Array.from(qsa(dataTypeSelector(type))).map((el: HTMLElement) => {
    const id = this._getElementId ? this._getElementId(el) : null;
    return {
      id: id,
      type: type,
      element: el,
    };
  });
}

export { getAllElements };
