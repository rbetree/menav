import type { MeNavApi } from '../types';

// 删除元素
function removeElement(this: MeNavApi, type: string, id: string): boolean {
  const element = this._findElement ? this._findElement(type, id) : null;
  if (!element) return false;

  // 获取父级容器（如果是站点卡片）
  let parentId = null;
  if (type === 'site') {
    const categoryElement = element.closest('[data-type="category"]');
    if (categoryElement) {
      parentId = categoryElement.getAttribute('data-name');
    }
  }

  // 删除元素
  element.remove();

  // 触发元素删除事件
  this.events?.emit('elementRemoved', {
    id: id,
    type: type,
    parentId: parentId,
  });

  return true;
}

export { removeElement };
