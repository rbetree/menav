type SlugCountMap = Map<string, number>;
type CategoryWithChildren = {
  name?: unknown;
  slug?: unknown;
  subcategories?: unknown[];
  groups?: unknown[];
  subgroups?: unknown[];
};

const CHILD_CATEGORY_KEYS = ['subcategories', 'groups', 'subgroups'] as const;

export function makeCategorySlugBase(name: unknown): string {
  const raw = typeof name === 'string' ? name : String(name ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return 'category';

  const normalized = trimmed
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'category';
}

export function makeUniqueSlug(base: string, usedSlugs: SlugCountMap): string {
  const current = usedSlugs.get(base) || 0;
  const next = current + 1;
  usedSlugs.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

function getExplicitSlug(slug: unknown): string {
  return typeof slug === 'string' ? slug.trim() : '';
}

function collectExplicitSlugs(categories: unknown, usedSlugs: SlugCountMap): void {
  if (!Array.isArray(categories)) return;

  categories.forEach((category: unknown) => {
    if (!category || typeof category !== 'object') return;

    const typedCategory = category as CategoryWithChildren;
    const explicitSlug = getExplicitSlug(typedCategory.slug);
    // 显式值先占位，自动生成的同名 slug 才能避开任意层级、任意顺序出现的显式值
    if (explicitSlug && !usedSlugs.has(explicitSlug)) usedSlugs.set(explicitSlug, 1);

    CHILD_CATEGORY_KEYS.forEach((key) => collectExplicitSlugs(typedCategory[key], usedSlugs));
  });
}

function assignSlugs(categories: unknown, usedSlugs: SlugCountMap): void {
  if (!Array.isArray(categories)) return;

  categories.forEach((category: unknown) => {
    if (!category || typeof category !== 'object') return;

    const typedCategory = category as CategoryWithChildren;
    const explicitSlug = getExplicitSlug(typedCategory.slug);
    typedCategory.slug = explicitSlug
      ? explicitSlug
      : makeUniqueSlug(makeCategorySlugBase(typedCategory.name), usedSlugs);

    CHILD_CATEGORY_KEYS.forEach((key) => assignSlugs(typedCategory[key], usedSlugs));
  });
}

export function assignCategorySlugs(categories: unknown, usedSlugs: SlugCountMap): void {
  collectExplicitSlugs(categories, usedSlugs);
  assignSlugs(categories, usedSlugs);
}
