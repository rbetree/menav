/** @param {unknown} input */
function normalizeUrlKey(input) {
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

/** @param {unknown} node @param {unknown[]} output */
function collectSitesRecursively(node, output) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node.subcategories)) {
    node.subcategories.forEach((child) => collectSitesRecursively(child, output));
  }

  if (Array.isArray(node.groups)) {
    node.groups.forEach((child) => collectSitesRecursively(child, output));
  }

  if (Array.isArray(node.subgroups)) {
    node.subgroups.forEach((child) => collectSitesRecursively(child, output));
  }

  if (Array.isArray(node.sites)) {
    node.sites.forEach((site) => {
      if (site && typeof site === 'object') output.push(site);
    });
  }
}

module.exports = {
  normalizeUrlKey,
  collectSitesRecursively,
};
