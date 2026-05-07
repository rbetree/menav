type SlugCountMap = Map<string, number>;
type CategoryWithChildren = {
  name?: unknown;
  slug?: string;
  subcategories?: unknown[];
};

function makeCategorySlugBase(name: unknown): string {
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

function makeUniqueSlug(base: string, usedSlugs: SlugCountMap): string {
  const current = usedSlugs.get(base) || 0;
  const next = current + 1;
  usedSlugs.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

function assignCategorySlugs(categories: unknown, usedSlugs: SlugCountMap): void {
  if (!Array.isArray(categories)) return;

  categories.forEach((category: unknown) => {
    if (!category || typeof category !== 'object') return;

    const typedCategory = category as CategoryWithChildren;
    const base = makeCategorySlugBase(typedCategory.name);
    const uniqueSlug = makeUniqueSlug(base, usedSlugs);
    typedCategory.slug = uniqueSlug;

    if (Array.isArray(typedCategory.subcategories)) {
      assignCategorySlugs(typedCategory.subcategories, usedSlugs);
    }
  });
}

module.exports = {
  makeCategorySlugBase,
  makeUniqueSlug,
  assignCategorySlugs,
};
