const fs = require('node:fs') as typeof import('node:fs');
const yaml = require('js-yaml') as {
  load: (source: string) => unknown;
};

type UpsertBookmarksNavResult =
  | { updated: true; reason: 'added_navigation_block' | 'updated_navigation_block' }
  | {
      updated: false;
      reason: 'site_yml_not_object' | 'already_present' | 'navigation_not_array';
    }
  | { updated: false; reason: 'error'; error: unknown };

function upsertBookmarksNavInSiteYml(siteYmlPath: string): UpsertBookmarksNavResult {
  try {
    const raw = fs.readFileSync(siteYmlPath, 'utf8');
    const loaded = yaml.load(raw);

    if (!loaded || typeof loaded !== 'object') {
      return { updated: false, reason: 'site_yml_not_object' };
    }

    const siteConfig = loaded as { navigation?: unknown };
    const navigation = siteConfig.navigation;

    if (
      Array.isArray(navigation) &&
      navigation.some((item) => item && typeof item === 'object' && 'id' in item && item.id === 'bookmarks')
    ) {
      return { updated: false, reason: 'already_present' };
    }

    if (navigation !== undefined && !Array.isArray(navigation)) {
      return { updated: false, reason: 'navigation_not_array' };
    }

    const lines = raw.split(/\r?\n/);
    const navLineIndex = lines.findIndex((line) => /^navigation\s*:/.test(line));

    const itemIndent = '  ';
    const propIndent = `${itemIndent}  `;
    const snippet = [
      `${itemIndent}- name: 书签`,
      `${propIndent}icon: fas fa-bookmark`,
      `${propIndent}id: bookmarks`,
    ];

    if (navLineIndex === -1) {
      const normalized = raw.endsWith('\n') ? raw : `${raw}\n`;
      const spacer = normalized.trim().length === 0 ? '' : '\n';
      fs.writeFileSync(siteYmlPath, `${normalized}${spacer}navigation:\n${snippet.join('\n')}\n`, 'utf8');
      return { updated: true, reason: 'added_navigation_block' };
    }

    let insertAt = lines.length;
    for (let i = navLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      if (/^[A-Za-z0-9_-]+\s*:/.test(line)) {
        insertAt = i;
        break;
      }
    }

    const updatedLines = [...lines];
    if (insertAt > 0 && updatedLines[insertAt - 1].trim() !== '') snippet.unshift('');
    updatedLines.splice(insertAt, 0, ...snippet);

    fs.writeFileSync(siteYmlPath, `${updatedLines.join('\n')}\n`, 'utf8');
    return { updated: true, reason: 'updated_navigation_block' };
  } catch (error) {
    return { updated: false, reason: 'error', error };
  }
}

export { upsertBookmarksNavInSiteYml };
export type { UpsertBookmarksNavResult };
