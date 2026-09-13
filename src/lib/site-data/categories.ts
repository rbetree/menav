import type { CategoryItem } from '../../types/page';

/** YAML 保留字段顺序；D1 快照携带 sort 时，跨分类形态使用同一顺序。 */
export function getCategoryChildren(category: CategoryItem) {
  const children = (['subcategories', 'groups', 'subgroups'] as const).flatMap((kind) =>
    (category[kind] ?? []).map((node) => ({ kind, node }))
  );
  return children.some(({ node }) => typeof node.sort === 'number')
    ? children.sort((a, b) => Number(a.node.sort ?? 0) - Number(b.node.sort ?? 0))
    : children;
}
