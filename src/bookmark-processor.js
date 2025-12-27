const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 书签文件夹路径 - 使用相对路径
const BOOKMARKS_DIR = 'bookmarks';
// 模块化配置目录
const CONFIG_USER_DIR = 'config/user';
// 模块化默认配置目录
const CONFIG_DEFAULT_DIR = 'config/_default';
// 模块化页面配置目录
const CONFIG_USER_PAGES_DIR = path.join(CONFIG_USER_DIR, 'pages');
// 模块化输出配置文件路径
const MODULAR_OUTPUT_FILE = path.join(CONFIG_USER_PAGES_DIR, 'bookmarks.yml');
// 模块化默认书签配置文件路径
const MODULAR_DEFAULT_BOOKMARKS_FILE = 'config/_default/pages/bookmarks.yml';

const USER_SITE_YML = path.join(CONFIG_USER_DIR, 'site.yml');
const DEFAULT_SITE_YML = path.join(CONFIG_DEFAULT_DIR, 'site.yml');

function ensureUserConfigInitialized() {
  if (fs.existsSync(CONFIG_USER_DIR)) {
    return { initialized: false, source: 'existing' };
  }

  if (fs.existsSync(CONFIG_DEFAULT_DIR)) {
    fs.cpSync(CONFIG_DEFAULT_DIR, CONFIG_USER_DIR, { recursive: true });
    console.log('[INFO] 检测到 config/user 不存在，已从 config/_default 初始化用户配置（完全替换策略需要完整配置）。');
    return { initialized: true, source: '_default' };
  }

  fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
  console.log('[WARN] 未找到默认配置目录 config/_default，已创建空的 config/user 目录；建议补齐 site.yml 与 pages/*.yml。');
  return { initialized: true, source: 'empty' };
}

function ensureUserSiteYmlExists() {
  if (fs.existsSync(USER_SITE_YML)) {
    return true;
  }

  if (fs.existsSync(DEFAULT_SITE_YML)) {
    if (!fs.existsSync(CONFIG_USER_DIR)) {
      fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
    }
    fs.copyFileSync(DEFAULT_SITE_YML, USER_SITE_YML);
    console.log('[INFO] 未找到 config/user/site.yml，已从 config/_default/site.yml 复制一份。');
    return true;
  }

  console.log('[WARN] 未找到可用的 site.yml，无法自动更新导航；请手动在 config/user/site.yml 添加 navigation（含 id: bookmarks）。');
  return false;
}

function upsertBookmarksNavInSiteYml(siteYmlPath) {
  try {
    const raw = fs.readFileSync(siteYmlPath, 'utf8');
    const loaded = yaml.load(raw);

    if (!loaded || typeof loaded !== 'object') {
      return { updated: false, reason: 'site_yml_not_object' };
    }

    const navigation = loaded.navigation;

    if (Array.isArray(navigation) && navigation.some(item => item && item.id === 'bookmarks')) {
      return { updated: false, reason: 'already_present' };
    }

    if (navigation !== undefined && !Array.isArray(navigation)) {
      return { updated: false, reason: 'navigation_not_array' };
    }

    const lines = raw.split(/\r?\n/);
    const navLineIndex = lines.findIndex(line => /^navigation\s*:/.test(line));

    const itemIndent = '  ';
    const propIndent = `${itemIndent}  `;
    const snippet = [
      `${itemIndent}- name: 书签`,
      `${propIndent}icon: fas fa-bookmark`,
      `${propIndent}id: bookmarks`,
    ];

    if (navLineIndex === -1) {
      // 不存在 navigation 段：直接追加一个新的块（尽量不破坏原文件结构）
      const normalized = raw.endsWith('\n') ? raw : `${raw}\n`;
      const spacer = normalized.trim().length === 0 ? '' : '\n';
      const updatedRaw = `${normalized}${spacer}navigation:\n${snippet.join('\n')}\n`;
      fs.writeFileSync(siteYmlPath, updatedRaw, 'utf8');
      return { updated: true, reason: 'added_navigation_block' };
    }

    // 找到 navigation 块末尾（遇到下一个顶层 key 时结束）
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
    // 在块末尾插入，确保块内至少有一个空行分隔更易读
    if (insertAt > 0 && updatedLines[insertAt - 1].trim() !== '') {
      snippet.unshift('');
    }
    updatedLines.splice(insertAt, 0, ...snippet);

    fs.writeFileSync(siteYmlPath, `${updatedLines.join('\n')}\n`, 'utf8');
    return { updated: true, reason: 'updated_navigation_block' };
  } catch (error) {
    return { updated: false, reason: 'error', error };
  }
}

// 图标映射，根据URL关键字匹配合适的图标
const ICON_MAPPING = {
  'github.com': 'fab fa-github',
  'stackoverflow.com': 'fab fa-stack-overflow',
  'youtube.com': 'fab fa-youtube',
  'twitter.com': 'fab fa-twitter',
  'facebook.com': 'fab fa-facebook',
  'instagram.com': 'fab fa-instagram',
  'linkedin.com': 'fab fa-linkedin',
  'reddit.com': 'fab fa-reddit',
  'amazon.com': 'fab fa-amazon',
  'google.com': 'fab fa-google',
  'gmail.com': 'fas fa-envelope',
  'drive.google.com': 'fab fa-google-drive',
  'docs.google.com': 'fas fa-file-alt',
  'medium.com': 'fab fa-medium',
  'dev.to': 'fab fa-dev',
  'gitlab.com': 'fab fa-gitlab',
  'bitbucket.org': 'fab fa-bitbucket',
  'wikipedia.org': 'fab fa-wikipedia-w',
  'discord.com': 'fab fa-discord',
  'slack.com': 'fab fa-slack',
  'apple.com': 'fab fa-apple',
  'microsoft.com': 'fab fa-microsoft',
  'android.com': 'fab fa-android',
  'twitch.tv': 'fab fa-twitch',
  'spotify.com': 'fab fa-spotify',
  'pinterest.com': 'fab fa-pinterest',
  'telegram.org': 'fab fa-telegram',
  'whatsapp.com': 'fab fa-whatsapp',
  'netflix.com': 'fas fa-film',
  'trello.com': 'fab fa-trello',
  'wordpress.com': 'fab fa-wordpress',
  'jira': 'fab fa-jira',
  'atlassian.com': 'fab fa-atlassian',
  'dropbox.com': 'fab fa-dropbox',
  'npm': 'fab fa-npm',
  'docker.com': 'fab fa-docker',
  'python.org': 'fab fa-python',
  'javascript': 'fab fa-js',
  'php.net': 'fab fa-php',
  'java': 'fab fa-java',
  'codepen.io': 'fab fa-codepen',
  'behance.net': 'fab fa-behance',
  'dribbble.com': 'fab fa-dribbble',
  'tumblr.com': 'fab fa-tumblr',
  'vimeo.com': 'fab fa-vimeo',
  'flickr.com': 'fab fa-flickr',
  'github.io': 'fab fa-github',
  'airbnb.com': 'fab fa-airbnb',
  'bitcoin': 'fab fa-bitcoin',
  'paypal.com': 'fab fa-paypal',
  'ethereum': 'fab fa-ethereum',
  'steam': 'fab fa-steam',
};

// 获取最新的书签文件
function getLatestBookmarkFile() {
  try {
    // 确保书签目录存在
    if (!fs.existsSync(BOOKMARKS_DIR)) {
      fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
      console.log('[WARN] 书签目录为空，未找到HTML文件');
      return null;
    }

    // 获取目录中的所有HTML文件
    const files = fs.readdirSync(BOOKMARKS_DIR)
      .filter(file => file.toLowerCase().endsWith('.html'));

    if (files.length === 0) {
      console.log('[WARN] 未找到任何HTML书签文件');
      return null;
    }

    // 获取文件状态，按最后修改时间排序
    const fileStats = files.map(file => ({
      file,
      mtime: fs.statSync(path.join(BOOKMARKS_DIR, file)).mtime
    }));

    // 找出最新的文件
    fileStats.sort((a, b) => b.mtime - a.mtime);
    const latestFile = fileStats[0].file;
    const latestFilePath = path.join(BOOKMARKS_DIR, latestFile);
    
    console.log('[INFO] 选择最新的书签文件:', latestFile);
    
    return latestFilePath;
  } catch (error) {
    console.error('[ERROR] 查找书签文件时出错:', error);
    return null;
  }
}

// 解析书签HTML内容，支持2-4层级嵌套结构
function parseBookmarks(htmlContent) {
  
  // 正则表达式匹配文件夹和书签
  const folderRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/g;
  const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
  
  // 储存解析结果
  const bookmarks = {
    categories: []
  };
  
  // 提取根路径书签（书签栏容器内但不在任何子文件夹内的书签）
  function extractRootBookmarks(htmlContent) {
    // 找到书签栏文件夹标签
    const bookmarkBarMatch = htmlContent.match(/<DT><H3[^>]*PERSONAL_TOOLBAR_FOLDER[^>]*>([^<]+)<\/H3>/i);
    if (!bookmarkBarMatch) {
      return [];
    }
    const bookmarkBarStart = bookmarkBarMatch.index + bookmarkBarMatch[0].length;
    
    // 找到书签栏后面的 <DL><p> 标签
    const remainingAfterBar = htmlContent.substring(bookmarkBarStart);
    const dlMatch = remainingAfterBar.match(/<DL><p>/i);
    if (!dlMatch) {
      return [];
    }
    
    const bookmarkBarContentStart = bookmarkBarStart + dlMatch.index + dlMatch[0].length;
    
    // 找到书签栏内容的结束位置
    let depth = 1;
    let pos = bookmarkBarContentStart;
    let bookmarkBarContentEnd = htmlContent.length;
    
    while (pos < htmlContent.length && depth > 0) {
      const remaining = htmlContent.substring(pos);
      const dlStartIndex = remaining.search(/<DL><p>/i);
      const dlEndIndex = remaining.search(/<\/DL><p>/i);
      
      if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
        depth++;
        pos += dlStartIndex + '<DL><p>'.length;
      } else if (dlEndIndex !== -1) {
        depth--;
        pos += dlEndIndex;
        if (depth === 0) {
          bookmarkBarContentEnd = pos;
        }
        pos += '</DL><p>'.length;
      } else {
        break;
      }
    }
    
    const bookmarkBarContent = htmlContent.substring(bookmarkBarContentStart, bookmarkBarContentEnd);
    
    // 现在提取书签栏内所有子文件夹的范围
    const subfolderRanges = [];
    const folderRegex = /<DT><H3[^>]*>([^<]+)<\/H3>/g;
    let folderMatch;
    
    while ((folderMatch = folderRegex.exec(bookmarkBarContent)) !== null) {
      const folderName = folderMatch[1].trim();
      const folderStart = folderMatch.index + folderMatch[0].length;
      
      // 找到这个文件夹内容的结束位置
      let folderDepth = 0;
      let folderPos = folderStart;
      let folderContentEnd = bookmarkBarContent.length;
      
      // 跳过空白直到找到 <DL><p>
      const afterFolder = bookmarkBarContent.substring(folderPos);
      const folderDLMatch = afterFolder.match(/<DL><p>/i);
      if (folderDLMatch) {
        folderDepth = 1;
        folderPos += folderDLMatch.index + folderDLMatch[0].length;
        
        while (folderPos < bookmarkBarContent.length && folderDepth > 0) {
          const remaining = bookmarkBarContent.substring(folderPos);
          const dlStartIdx = remaining.search(/<DL><p>/i);
          const dlEndIdx = remaining.search(/<\/DL><p>/i);
          
          if (dlStartIdx !== -1 && (dlEndIdx === -1 || dlStartIdx < dlEndIdx)) {
            folderDepth++;
            folderPos += dlStartIdx + '<DL><p>'.length;
          } else if (dlEndIdx !== -1) {
            folderDepth--;
            folderPos += dlEndIdx;
            if (folderDepth === 0) {
              folderContentEnd = folderPos + '</DL><p>'.length;
            }
            folderPos += '</DL><p>'.length;
          } else {
            break;
          }
        }
        
        subfolderRanges.push({
          name: folderName,
          start: folderMatch.index,
          end: folderContentEnd
        });
      }
    }
    
    // 提取不在任何子文件夹范围内的书签
    const rootSites = [];
    const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
    let bookmarkMatch;
    
    while ((bookmarkMatch = bookmarkRegex.exec(bookmarkBarContent)) !== null) {
      const bookmarkPos = bookmarkMatch.index;
      const url = bookmarkMatch[1];
      const name = bookmarkMatch[2].trim();
      
      // 检查这个书签是否在任何子文件夹范围内
      let inFolder = false;
      for (const folder of subfolderRanges) {
        if (bookmarkPos >= folder.start && bookmarkPos < folder.end) {
          inFolder = true;
          break;
        }
      }
      
      if (!inFolder) {
        
        // 基于URL选择适当的图标
        let icon = 'fas fa-link';
        for (const [keyword, iconClass] of Object.entries(ICON_MAPPING)) {
          if (url.includes(keyword)) {
            icon = iconClass;
            break;
          }
        }
        
        rootSites.push({
          name: name,
          url: url,
          icon: icon,
          description: ''
        });
      }
    }
    
    return rootSites;
  }
  
  // 递归解析嵌套文件夹
  function parseNestedFolder(htmlContent, parentPath = [], level = 1) {
    const folders = [];
    
    // 第一步：扫描所有文件夹，记录它们的完整范围
    const folderRanges = [];
    const scanRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/g;
    let scanMatch;
    
    while ((scanMatch = scanRegex.exec(htmlContent)) !== null) {
      const folderName = scanMatch[2].trim();
      const folderStart = scanMatch.index;
      const folderHeaderEnd = scanMatch.index + scanMatch[0].length;
      
      // 找到文件夹内容的结束位置
      let depth = 0;
      let pos = folderHeaderEnd;
      
      // 跳过空白直到找到 <DL><p>
      const afterFolder = htmlContent.substring(pos);
      const folderDLMatch = afterFolder.match(/<DL><p>/i);
      if (folderDLMatch) {
        depth = 1;
        pos += folderDLMatch.index + folderDLMatch[0].length;
        
        while (pos < htmlContent.length && depth > 0) {
          const remaining = htmlContent.substring(pos);
          const dlStartIdx = remaining.search(/<DL><p>/i);
          const dlEndIdx = remaining.search(/<\/DL><p>/i);
          
          if (dlStartIdx !== -1 && (dlEndIdx === -1 || dlStartIdx < dlEndIdx)) {
            depth++;
            pos += dlStartIdx + '<DL><p>'.length;
          } else if (dlEndIdx !== -1) {
            depth--;
            pos += dlEndIdx;
            if (depth === 0) {
              const folderEnd = pos + '</DL><p>'.length;
              folderRanges.push({
                name: folderName,
                start: folderStart,
                headerEnd: folderHeaderEnd,
                end: folderEnd
              });
            }
            pos += '</DL><p>'.length;
          } else {
            break;
          }
        }
      }
    }
    
    // 第二步：只处理当前层级的文件夹（不在其他文件夹内部的）
    for (let i = 0; i < folderRanges.length; i++) {
      const currentFolder = folderRanges[i];
      
      // 检查这个文件夹是否在其他文件夹内部
      let isNested = false;
      for (let j = 0; j < folderRanges.length; j++) {
        if (i === j) continue; // 跳过自己
        
        const otherFolder = folderRanges[j];
        // 如果当前文件夹的起始位置在另一个文件夹的范围内，说明它是嵌套的
        if (currentFolder.start > otherFolder.start && currentFolder.end <= otherFolder.end) {
          isNested = true;
          break;
        }
      }
      
      if (isNested) {
        continue; // 跳过嵌套的文件夹，它们会被递归调用处理
      }
      
      const folderName = currentFolder.name;
      const folderStart = currentFolder.start;
      const folderHeaderEnd = currentFolder.headerEnd;
      const folderEnd = currentFolder.end;
      
      // 提取文件夹内容（保留完整的HTML结构供递归使用）
      // 从headerEnd到end之间包含完整的<DL><p>...</DL><p>结构
      const folderContent = htmlContent.substring(folderHeaderEnd, folderEnd);
      
      // 验证是否有有效的容器结构
      if (!/<DL><p>/i.test(folderContent)) {
        continue;
      }
      
      // 解析文件夹内容
      const folder = {
        name: folderName,
        icon: 'fas fa-folder',
        path: [...parentPath, folderName]
      };
      
      // 检查是否包含子文件夹 - 创建新的正则实例避免干扰主循环
      const testFolderRegex = /<DT><H3([^>]*)>(.*?)<\/H3>/;
      const hasSubfolders = testFolderRegex.test(folderContent);
      
      // 先解析当前层级的书签
      const currentLevelSites = parseSitesInFolder(folderContent, folderName);
      
      if (hasSubfolders && level < 4) {
        // 递归解析子文件夹
        const subfolders = parseNestedFolder(folderContent, folder.path, level + 1);
        
        // 根据层级深度决定数据结构
        if (level === 1) {
          folder.subcategories = subfolders;
        } else if (level === 2) {
          folder.groups = subfolders;
        } else if (level === 3) {
          folder.subgroups = subfolders;
        }
        
        // 添加当前层级的书签（如果有）
        if (currentLevelSites.length > 0) {
          folder.sites = currentLevelSites;
        }
      } else {
        // 解析书签
        folder.sites = currentLevelSites;
      }
      
      // 只添加包含内容的文件夹
      const hasContent = folder.sites && folder.sites.length > 0 ||
                        folder.subcategories && folder.subcategories.length > 0 ||
                        folder.groups && folder.groups.length > 0 ||
                        folder.subgroups && folder.subgroups.length > 0;
      
      if (hasContent) {
        folders.push(folder);
      }
    }
    
    return folders;
  }
  
  // 解析文件夹中的书签（仅当前层级，排除子文件夹内的书签）
  function parseSitesInFolder(folderContent) {
    const sites = [];
    let siteCount = 0;
    
    // 首先找到所有子文件夹的范围
    const subfolderRanges = [];
    const folderRegex = /<DT><H3[^>]*>([^<]+)<\/H3>/g;
    let folderMatch;
    
    while ((folderMatch = folderRegex.exec(folderContent)) !== null) {
      const folderName = folderMatch[1].trim();
      const folderStart = folderMatch.index;
      const folderHeaderEnd = folderMatch.index + folderMatch[0].length;
      
      // 找到这个文件夹内容的结束位置
      let folderDepth = 0;
      let folderPos = folderHeaderEnd;
      let folderContentEnd = folderContent.length;
      
      // 跳过空白直到找到 <DL><p>
      const afterFolder = folderContent.substring(folderPos);
      const folderDLMatch = afterFolder.match(/<DL><p>/i);
      if (folderDLMatch) {
        folderDepth = 1;
        folderPos += folderDLMatch.index + folderDLMatch[0].length;
        
        while (folderPos < folderContent.length && folderDepth > 0) {
          const remaining = folderContent.substring(folderPos);
          const dlStartIdx = remaining.search(/<DL><p>/i);
          const dlEndIdx = remaining.search(/<\/DL><p>/i);
          
          if (dlStartIdx !== -1 && (dlEndIdx === -1 || dlStartIdx < dlEndIdx)) {
            folderDepth++;
            folderPos += dlStartIdx + '<DL><p>'.length;
          } else if (dlEndIdx !== -1) {
            folderDepth--;
            folderPos += dlEndIdx;
            if (folderDepth === 0) {
              folderContentEnd = folderPos + '</DL><p>'.length;
            }
            folderPos += '</DL><p>'.length;
          } else {
            break;
          }
        }
        
        subfolderRanges.push({
          name: folderName,
          start: folderStart,
          end: folderContentEnd
        });
      }
    }
    
    // 现在提取不在任何子文件夹范围内的书签
    const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
    let bookmarkMatch;
    
    while ((bookmarkMatch = bookmarkRegex.exec(folderContent)) !== null) {
      const bookmarkPos = bookmarkMatch.index;
      const url = bookmarkMatch[1];
      const name = bookmarkMatch[2].trim();
      
      // 检查这个书签是否在任何子文件夹范围内
      let inSubfolder = false;
      for (const folder of subfolderRanges) {
        if (bookmarkPos >= folder.start && bookmarkPos < folder.end) {
          inSubfolder = true;
          break;
        }
      }
      
      if (!inSubfolder) {
        
        // 基于URL选择适当的图标
        let icon = 'fas fa-link'; // 默认图标
        for (const [keyword, iconClass] of Object.entries(ICON_MAPPING)) {
          if (url.includes(keyword)) {
            icon = iconClass;
            break;
          }
        }
        
        sites.push({
          name: name,
          url: url,
          icon: icon,
          description: ''
        });
      }
    }
    
    return sites;
  }
  
  // 开始解析
  const rootSites = extractRootBookmarks(htmlContent);
  
  // 找到书签栏文件夹（PERSONAL_TOOLBAR_FOLDER）
  const bookmarkBarMatch = htmlContent.match(/<DT><H3[^>]*PERSONAL_TOOLBAR_FOLDER[^>]*>([^<]+)<\/H3>/i);
  if (!bookmarkBarMatch) {
    console.log('[WARN] 未找到书签栏文件夹（PERSONAL_TOOLBAR_FOLDER），使用备用方案');
    // 备用方案：使用第一个 <DL><p> 标签
    const firstDLMatch = htmlContent.match(/<DL><p>/i);
    if (!firstDLMatch) {
      console.log('[ERROR] 未找到任何书签容器');
      bookmarks.categories = [];
    } else {
      const dlStart = firstDLMatch.index + firstDLMatch[0].length;
      let dlEnd = htmlContent.length;
      let depth = 1;
      let pos = dlStart;
      
      while (pos < htmlContent.length && depth > 0) {
        const remainingContent = htmlContent.substring(pos);
        const dlStartIndex = remainingContent.search(/<DL><p>/i);
        const dlEndIndex = remainingContent.search(/<\/DL><p>/i);
        
        if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
          depth++;
          pos += dlStartIndex + '<DL><p>'.length;
        } else if (dlEndIndex !== -1) {
          depth--;
          pos += dlEndIndex + '</DL><p>'.length;
        } else {
          break;
        }
      }
      
      dlEnd = pos - '</DL><p>'.length;
      const bookmarksBarContent = htmlContent.substring(dlStart, dlEnd);
      bookmarks.categories = parseNestedFolder(bookmarksBarContent);
    }
  } else {
    const bookmarkBarStart = bookmarkBarMatch.index + bookmarkBarMatch[0].length;
    
    // 找到书签栏后面的 <DL><p> 标签
    const remainingAfterBar = htmlContent.substring(bookmarkBarStart);
    const dlMatch = remainingAfterBar.match(/<DL><p>/i);
    if (!dlMatch) {
      console.log('[ERROR] 未找到书签栏的内容容器 <DL><p>');
      bookmarks.categories = [];
    } else {
      const bookmarkBarContentStart = bookmarkBarStart + dlMatch.index + dlMatch[0].length;
      
      // 找到书签栏内容的结束位置
      let depth = 1;
      let pos = bookmarkBarContentStart;
      let bookmarkBarContentEnd = htmlContent.length;
      
      while (pos < htmlContent.length && depth > 0) {
        const remaining = htmlContent.substring(pos);
        const dlStartIndex = remaining.search(/<DL><p>/i);
        const dlEndIndex = remaining.search(/<\/DL><p>/i);
        
        if (dlStartIndex !== -1 && (dlEndIndex === -1 || dlStartIndex < dlEndIndex)) {
          depth++;
          pos += dlStartIndex + '<DL><p>'.length;
        } else if (dlEndIndex !== -1) {
          depth--;
          pos += dlEndIndex;
          if (depth === 0) {
            bookmarkBarContentEnd = pos;
          }
          pos += '</DL><p>'.length;
        } else {
          break;
        }
      }
      
      const bookmarkBarContent = htmlContent.substring(bookmarkBarContentStart, bookmarkBarContentEnd);
      
      // 解析书签栏内的子文件夹作为顶层分类（跳过书签栏本身）
      bookmarks.categories = parseNestedFolder(bookmarkBarContent);
    }
  }
  
  console.log(`[INFO] 解析完成 - 共找到 ${bookmarks.categories.length} 个顶层分类`);
  
  // 如果存在根路径书签，创建"根目录书签"特殊分类并插入到首位
  if (rootSites.length > 0) {
    console.log(`[INFO] 创建"根目录书签"特殊分类，包含 ${rootSites.length} 个书签`);
    const rootCategory = {
      name: '根目录书签',
      icon: 'fas fa-star',
      path: ['根目录书签'],
      sites: rootSites
    };
    
    // 插入到数组首位
    bookmarks.categories.unshift(rootCategory);
    console.log(`[INFO] "根目录书签"已插入到分类列表首位`);
  }
  
  return bookmarks;
}

// 生成YAML配置
function generateBookmarksYaml(bookmarks) {
  try {
    // 创建书签页面配置
    const bookmarksPage = {
      title: '我的书签',
      subtitle: '从浏览器导入的书签收藏',
      categories: bookmarks.categories
    };
    
    // 转换为YAML
    const yamlString = yaml.dump(bookmarksPage, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"'
    });
    
    // 添加注释（可选确定性输出，方便版本管理）
    const deterministic = process.env.MENAV_BOOKMARKS_DETERMINISTIC === '1';
    const timestampLine = deterministic
      ? ''
      : `# 由bookmark-processor.js生成于 ${new Date().toISOString()}\n`;

    const yamlWithComment =
`# 自动生成的书签配置文件
${timestampLine}# 若要更新，请将新的书签HTML文件放入bookmarks/目录
# 此文件使用模块化配置格式，位于config/user/pages/目录下

${yamlString}`;
    
    return yamlWithComment;
  } catch (error) {
    console.error('Error generating YAML:', error);
    return null;
  }
}

// 更新导航以包含书签页面
function updateNavigationWithBookmarks() {
  // 1) 优先更新 site.yml（当前推荐方式）
  if (ensureUserSiteYmlExists()) {
    const result = upsertBookmarksNavInSiteYml(USER_SITE_YML);
    if (result.updated) {
      return { updated: true, target: 'site.yml', reason: result.reason };
    }
    if (result.reason === 'already_present') {
      return { updated: false, target: 'site.yml', reason: 'already_present' };
    }
    if (result.reason === 'error') {
      return { updated: false, target: 'site.yml', reason: 'error', error: result.error };
    }
    return { updated: false, target: 'site.yml', reason: result.reason };
  }
  return { updated: false, target: null, reason: 'no_site_yml' };
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('[INFO] 书签处理脚本启动');
  console.log('[INFO] 时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  console.log('========================================\n');
  
  // 获取最新的书签文件
  console.log('[步骤 1/5] 查找书签文件...');
  const bookmarkFile = getLatestBookmarkFile();
  if (!bookmarkFile) {
    console.log('[WARN] 未找到书签文件，已跳过处理（将HTML书签文件放入 bookmarks/ 后再运行）。');
    return;
  }
  console.log('[SUCCESS] 找到书签文件\n');
  
  try {
    // 读取文件内容
    console.log('[步骤 2/5] 读取书签文件...');
    const htmlContent = fs.readFileSync(bookmarkFile, 'utf8');
    console.log('[SUCCESS] 文件读取成功，大小:', htmlContent.length, '字符\n');
    
    // 解析书签
    console.log('[步骤 3/5] 解析书签结构...');
    const bookmarks = parseBookmarks(htmlContent);
    if (bookmarks.categories.length === 0) {
      console.error('[ERROR] HTML文件中未找到书签分类，处理终止');
      return;
    }
    console.log('[SUCCESS] 解析完成\n');
    
    // 生成YAML
    console.log('[步骤 4/5] 生成YAML配置...');
    const yamlContent = generateBookmarksYaml(bookmarks);
    if (!yamlContent) {
      console.error('[ERROR] YAML生成失败，处理终止');
      return;
    }
    console.log('[SUCCESS] YAML生成成功\n');
    
    // 保存文件
    console.log('[步骤 5/5] 保存配置文件...');
    try {
      // 完全替换策略：若尚未初始化用户配置，则先从默认配置初始化一份完整配置
      ensureUserConfigInitialized();

      // 确保目标目录存在
      if (!fs.existsSync(CONFIG_USER_PAGES_DIR)) {
        fs.mkdirSync(CONFIG_USER_PAGES_DIR, { recursive: true });
      }
      
      // 保存YAML到模块化位置
      fs.writeFileSync(MODULAR_OUTPUT_FILE, yamlContent, 'utf8');
      
      // 验证文件是否确实被创建
      if (!fs.existsSync(MODULAR_OUTPUT_FILE)) {
        console.error(`[ERROR] 文件未能创建: ${MODULAR_OUTPUT_FILE}`);
        process.exit(1);
      }
      
      console.log('[SUCCESS] 文件保存成功');
      console.log('[INFO] 输出文件:', MODULAR_OUTPUT_FILE, '\n');
      
      // 更新导航
      console.log('[附加步骤] 更新导航配置...');
      const navUpdateResult = updateNavigationWithBookmarks();
      if (navUpdateResult.updated) {
        console.log(`[SUCCESS] 导航配置已更新（${navUpdateResult.target}）\n`);
      } else if (navUpdateResult.reason === 'already_present') {
        console.log('[INFO] 导航配置已包含书签入口，无需更新\n');
      } else if (navUpdateResult.reason === 'no_navigation_config') {
        console.log('[WARN] 未找到可更新的导航配置文件；请确认 config/user/site.yml 存在且包含 navigation\n');
      } else if (navUpdateResult.reason === 'error') {
        console.log('[WARN] 导航更新失败，请手动检查配置文件格式（详见错误信息）\n');
        console.error(navUpdateResult.error);
      } else {
        console.log('[INFO] 导航配置无需更新\n');
      }
      
    } catch (writeError) {
      console.error(`[ERROR] 写入文件时出错:`, writeError);
      console.error('[ERROR] 错误堆栈:', writeError.stack);
      process.exit(1);
    }
    
    console.log('========================================');
    console.log('[SUCCESS] 书签处理完成！');
    console.log('========================================');
    
  } catch (error) {
    console.error('[FATAL] 处理书签文件时发生错误:', error);
    console.error('[ERROR] 错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 启动处理
if (require.main === module) {
  main().catch(err => {
    console.error('Unhandled error in bookmark processing:', err);
    process.exit(1);
  });
}

module.exports = {
  ensureUserConfigInitialized,
  ensureUserSiteYmlExists,
  upsertBookmarksNavInSiteYml,
  parseBookmarks,
  generateBookmarksYaml,
  updateNavigationWithBookmarks,
};
