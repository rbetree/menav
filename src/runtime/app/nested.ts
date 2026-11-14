import type { NestedStructureNode } from '../types';

const { SELECTORS, byId, qs, qsa } =
  require('../dom/selectors.ts') as typeof import('../dom/selectors');

// 多层级嵌套书签功能
function getCollapsibleNestedContainers(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  const headers = qsa(SELECTORS.nestedCollapsibleHeader, root);
  return Array.from(headers)
    .map((header) => header.parentElement)
    .filter((element: HTMLElement | null): element is HTMLElement => Boolean(element));
}

function isNestedContainerCollapsible(container: HTMLElement | null): container is HTMLElement {
  if (!container) return false;

  if (container.classList.contains('category')) {
    return Boolean(qs(SELECTORS.nestedCategoryHeader, container));
  }

  if (container.classList.contains('group')) {
    return Boolean(qs(SELECTORS.nestedGroupHeader, container));
  }

  return false;
}

function getNestedHeader(container: HTMLElement): HTMLElement | null {
  if (container.classList.contains('category')) {
    return qs<HTMLElement>(SELECTORS.nestedCategoryHeader, container);
  }
  if (container.classList.contains('group')) {
    return qs<HTMLElement>(SELECTORS.nestedGroupHeader, container);
  }
  return null;
}

function getNestedContent(container: HTMLElement): HTMLElement | null {
  if (container.classList.contains('category')) {
    return qs<HTMLElement>(SELECTORS.nestedCategoryContent, container);
  }
  if (container.classList.contains('group')) {
    return qs<HTMLElement>(SELECTORS.nestedGroupContent, container);
  }
  return null;
}

let nestedContentIdSeed = 0;

function ensureNestedContentId(content: HTMLElement): string {
  if (content.id) return content.id;

  let id = '';
  do {
    nestedContentIdSeed += 1;
    id = `menav-nested-content-${nestedContentIdSeed}`;
  } while (byId(id));

  content.id = id;
  return id;
}

// 折叠类仍是状态唯一来源；aria 与 inert 只跟随它同步
function syncCollapsedState(container: HTMLElement, isCollapsed: boolean): void {
  const content = getNestedContent(container);
  if (content) content.inert = isCollapsed;

  const header = getNestedHeader(container);
  const button = header ? qs<HTMLButtonElement>(SELECTORS.nestedToggleButton, header) : null;
  if (!button) return;

  if (content) button.setAttribute('aria-controls', ensureNestedContentId(content));
  button.setAttribute('aria-expanded', String(!isCollapsed));

  const name = String(container.dataset.name || '').trim();
  if (name) button.setAttribute('aria-label', `${isCollapsed ? '展开' : '收起'}${name}`);
}

// 分类总开关按当前页多数项的折叠状态决定下一次动作
function syncCategoryToggleState(): void {
  const activePage = qs(SELECTORS.pageActive);
  if (!activePage) return;

  const containers = getCollapsibleNestedContainers(activePage);
  if (containers.length === 0) return;

  const collapsedCount = containers.filter((element) =>
    element.classList.contains('collapsed')
  ).length;
  updateCategoryToggleIcon(collapsedCount >= containers.length / 2 ? 'up' : 'down');
}

// 更新分类切换按钮图标
function updateCategoryToggleIcon(state: 'up' | 'down'): void {
  const toggleBtn = byId(SELECTORS.categoryToggle);
  if (!toggleBtn) return;

  const icon = qs('i', toggleBtn);
  if (!icon) return;

  if (state === 'up') {
    icon.className = 'fas fa-angle-double-up';
    toggleBtn.setAttribute('aria-label', '收起分类');
    toggleBtn.setAttribute('aria-expanded', 'true');
  } else {
    icon.className = 'fas fa-angle-double-down';
    toggleBtn.setAttribute('aria-label', '展开分类');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }
}

// 切换嵌套元素
function toggleNestedElement(container: HTMLElement | null): void {
  if (!isNestedContainerCollapsible(container)) return;
  const nextCollapsed = !container.classList.contains('collapsed');

  container.classList.toggle('collapsed', nextCollapsed);
  saveToggleState(container, nextCollapsed ? 'collapsed' : 'expanded');
  syncCollapsedState(container, nextCollapsed);

  // 触发自定义事件
  const event = new CustomEvent('nestedToggle', {
    detail: {
      element: container,
      type: container.dataset.type,
      name: container.dataset.name,
      isCollapsed: nextCollapsed,
    },
  });
  document.dispatchEvent(event);

  syncCategoryToggleState();
}

// 保存切换状态
function saveToggleState(element: HTMLElement, state: 'expanded' | 'collapsed'): void {
  const type = element.dataset.type;
  const name = element.dataset.name;
  const level = element.dataset.level || '1';
  const key = `menav-toggle-${type}-${level}-${name}`;
  localStorage.setItem(key, state);
}

// 恢复切换状态
function restoreToggleState(element: HTMLElement | null): void {
  if (!element) return;
  const type = element.dataset.type;
  const name = element.dataset.name;
  const level = element.dataset.level || '1';
  const key = `menav-toggle-${type}-${level}-${name}`;
  const savedState = localStorage.getItem(key);

  if (savedState === 'collapsed') {
    element.classList.add('collapsed');
  }
}

// 初始化嵌套分类
function initializeNestedCategories(): void {
  // 为所有可折叠元素添加切换功能
  qsa(SELECTORS.nestedToggleHeader).forEach((header: HTMLElement) => {
    const container = header.parentElement;
    if (!container) return;

    header.addEventListener('click', function (this: HTMLElement, e: Event) {
      e.stopPropagation();
      toggleNestedElement(this.parentElement);
    });

    // 恢复保存的状态，并据此同步按钮与 inert
    restoreToggleState(container);
    syncCollapsedState(container, container.classList.contains('collapsed'));

    // 按钮点击不再冒泡到 header，避免一次操作触发两次切换
    const toggleButton = qs<HTMLButtonElement>(SELECTORS.nestedToggleButton, header);
    if (toggleButton) {
      toggleButton.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        toggleNestedElement(container);
      });
    }
  });

  syncCategoryToggleState();
}

// 提取嵌套数据
function extractNestedData(element: HTMLElement): NestedStructureNode {
  const data: NestedStructureNode = {
    name: element.dataset.name,
    type: element.dataset.type,
    level: element.dataset.level,
    isCollapsed: element.classList.contains('collapsed'),
  };

  // 提取子元素数据
  const subcategories = qsa(SELECTORS.nestedSubcategories, element);
  if (subcategories.length > 0) {
    data.subcategories = Array.from(subcategories).map((sub) => extractNestedData(sub));
  }

  const groups = qsa(SELECTORS.nestedGroups, element);
  if (groups.length > 0) {
    data.groups = Array.from(groups).map((group) => extractNestedData(group));
  }

  const subgroups = qsa(SELECTORS.nestedSubgroups, element);
  if (subgroups.length > 0) {
    data.subgroups = Array.from(subgroups).map((subgroup) => extractNestedData(subgroup));
  }

  const sites = qsa(SELECTORS.nestedSites, element);
  if (sites.length > 0) {
    data.sites = Array.from(sites).map((site) => ({
      name: site.dataset.name,
      url: site.dataset.url,
      icon: site.dataset.icon,
      description: site.dataset.description,
    }));
  }

  return data;
}

function expandAll(): void {
  const activePage = qs(SELECTORS.pageActive);
  if (!activePage) return;

  getCollapsibleNestedContainers(activePage).forEach((element) => {
    element.classList.remove('collapsed');
    saveToggleState(element, 'expanded');
    syncCollapsedState(element, false);
  });
  updateCategoryToggleIcon('up');
}

function collapseAll(): void {
  const activePage = qs(SELECTORS.pageActive);
  if (!activePage) return;

  getCollapsibleNestedContainers(activePage).forEach((element) => {
    element.classList.add('collapsed');
    saveToggleState(element, 'collapsed');
    syncCollapsedState(element, true);
  });
  updateCategoryToggleIcon('down');
}

function toggleCategories(): void {
  const activePage = qs(SELECTORS.pageActive);
  if (!activePage) return;

  const allElements = getCollapsibleNestedContainers(activePage);
  if (allElements.length === 0) return;

  const collapsedElements = allElements.filter((element) =>
    element.classList.contains('collapsed')
  );

  if (collapsedElements.length >= allElements.length / 2) {
    expandAll();
  } else {
    collapseAll();
  }
}

function toggleCategory(
  categoryName: string,
  subcategoryName: string | null = null,
  groupName: string | null = null,
  subgroupName: string | null = null
): void {
  let selector = `[data-name="${categoryName}"]`;

  if (subcategoryName) selector += ` [data-name="${subcategoryName}"]`;
  if (groupName) selector += ` [data-name="${groupName}"]`;
  if (subgroupName) selector += ` [data-name="${subgroupName}"]`;

  const element = qs(selector);
  if (element) {
    toggleNestedElement(element);
  }
}

function getNestedStructure(): NestedStructureNode[] {
  const categories: NestedStructureNode[] = [];
  qsa(SELECTORS.categoryLevelOne).forEach((cat: HTMLElement) => {
    categories.push(extractNestedData(cat));
  });
  return categories;
}

module.exports = {
  collapseAll,
  expandAll,
  getNestedStructure,
  initializeNestedCategories,
  toggleCategories,
  toggleCategory,
  updateCategoryToggleIcon,
  extractNestedData,
};
