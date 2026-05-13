type SiteNode = {
  subcategories?: unknown[];
  groups?: unknown[];
  subgroups?: unknown[];
  sites?: unknown[];
};

function normalizeUrlKey(input: unknown): string {
  if (!input) return '';

  try {
    const url = new URL(String(input));
    const origin = url.origin;
    let pathname = url.pathname || '/';
    if (pathname !== '/' && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    return `${origin}${pathname}`;
  } catch {
    return String(input).trim();
  }
}

function collectSitesRecursively(node: unknown, output: unknown[]): void {
  if (!node || typeof node !== 'object') return;

  const typedNode = node as SiteNode;

  if (Array.isArray(typedNode.subcategories)) {
    typedNode.subcategories.forEach((child: unknown) => collectSitesRecursively(child, output));
  }

  if (Array.isArray(typedNode.groups)) {
    typedNode.groups.forEach((child: unknown) => collectSitesRecursively(child, output));
  }

  if (Array.isArray(typedNode.subgroups)) {
    typedNode.subgroups.forEach((child: unknown) => collectSitesRecursively(child, output));
  }

  if (Array.isArray(typedNode.sites)) {
    typedNode.sites.forEach((site: unknown) => {
      if (site && typeof site === 'object') output.push(site);
    });
  }
}

export { collectSitesRecursively, normalizeUrlKey };
