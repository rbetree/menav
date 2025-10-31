const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 书签文件夹路径 - 使用相对路径
const BOOKMARKS_DIR = 'bookmarks';
// 模块化配置目录
const CONFIG_USER_DIR = 'config/user';
// 模块化页面配置目录
const CONFIG_USER_PAGES_DIR = path.join(CONFIG_USER_DIR, 'pages');
// 模块化输出配置文件路径
const MODULAR_OUTPUT_FILE = path.join(CONFIG_USER_PAGES_DIR, 'bookmarks.yml');
// 模块化默认书签配置文件路径
const MODULAR_DEFAULT_BOOKMARKS_FILE = 'config/_default/pages/bookmarks.yml';

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
      return null;
    }

    // 获取目录中的所有HTML文件
    const files = fs.readdirSync(BOOKMARKS_DIR)
      .filter(file => file.toLowerCase().endsWith('.html'));

    if (files.length === 0) {
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
    
    return path.join(BOOKMARKS_DIR, latestFile);
  } catch (error) {
    console.error('Error finding bookmark file:', error);
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
  
  // 递归解析嵌套文件夹
  function parseNestedFolder(htmlContent, parentPath = [], level = 1) {
    const folders = [];
    let match;
    
    // 使用正则表达式匹配文件夹
    folderRegex.lastIndex = 0;
    
    while ((match = folderRegex.exec(htmlContent)) !== null) {
      const folderName = match[2].trim();
      const folderStart = match.index;
      const folderEnd = match.index + match[0].length;
      
      // 查找文件夹的结束位置
      let folderContentEnd = htmlContent.length;
      let depth = 1;
      let pos = folderEnd;
      
      while (pos < htmlContent.length && depth > 0) {
        const dlStart = htmlContent.substring(pos).match(/<DL><p>/gi);
        const dlEnd = htmlContent.substring(pos).match(/<\/DL><p>/gi);
        
        if (dlStart && dlStart.index < (dlEnd ? dlEnd.index : htmlContent.length)) {
          depth++;
          pos += dlStart.index + dlStart[0].length;
        } else if (dlEnd) {
          depth--;
          pos += dlEnd.index + dlEnd[0].length;
        } else {
          break;
        }
      }
      
      folderContentEnd = pos;
      const folderContent = htmlContent.substring(folderEnd, folderContentEnd);
      
      // 解析文件夹内容
      const folder = {
        name: folderName,
        icon: 'fas fa-folder',
        path: [...parentPath, folderName]
      };
      
      // 检查是否包含子文件夹
      const hasSubfolders = folderRegex.test(folderContent);
      folderRegex.lastIndex = 0;
      
      if (hasSubfolders && level < 4) {
        // 递归解析子文件夹
        const subfolders = parseNestedFolder(folderContent, folder.path, level + 1);
        
        // 根据层级深度决定数据结构
        if (level === 1) {
          folder.subcategories = subfolders;
        } else if (level === 2) {
          folder.groups = subfolders;
        } else if (level === 3) {
          // 层级3直接解析书签
          folder.sites = parseSitesInFolder(folderContent);
        }
      } else {
        // 解析书签
        folder.sites = parseSitesInFolder(folderContent);
      }
      
      // 只添加包含内容的文件夹
      const hasContent = folder.sites && folder.sites.length > 0 ||
                        folder.subcategories && folder.subcategories.length > 0 ||
                        folder.groups && folder.groups.length > 0;
      
      if (hasContent) {
        folders.push(folder);
      }
    }
    
    return folders;
  }
  
  // 解析文件夹中的书签
  function parseSitesInFolder(folderContent) {
    const sites = [];
    let bookmarkMatch;
    bookmarkRegex.lastIndex = 0;
    
    while ((bookmarkMatch = bookmarkRegex.exec(folderContent)) !== null) {
      const url = bookmarkMatch[1];
      const name = bookmarkMatch[2].trim();
      
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
    
    return sites;
  }
  
  // 开始解析
  bookmarks.categories = parseNestedFolder(htmlContent);
  
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
    
    // 添加注释
    const yamlWithComment = 
`# 自动生成的书签配置文件
# 由bookmark-processor.js生成于 ${new Date().toISOString()}
# 若要更新，请将新的书签HTML文件放入bookmarks/目录
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
  // 模块化配置文件
  const modularUserNavFile = path.join(CONFIG_USER_DIR, 'navigation.yml');
  const modularDefaultNavFile = 'config/_default/navigation.yml';
  
  let navigationUpdated = false;
  
  // 按优先级顺序尝试更新导航配置
  
  // 1. 首选: 模块化用户导航配置
  if (fs.existsSync(modularUserNavFile)) {
    navigationUpdated = updateNavigationFile(modularUserNavFile);
  }
  // 2. 其次: 模块化默认导航配置
  else if (fs.existsSync(modularDefaultNavFile)) {
    // 如果用户导航文件不存在，我们需要先创建它，然后基于默认文件更新
    try {
      // 读取默认导航文件
      const defaultNavContent = fs.readFileSync(modularDefaultNavFile, 'utf8');
      const defaultNav = yaml.load(defaultNavContent);
      
      // 确保目录存在
      if (!fs.existsSync(CONFIG_USER_DIR)) {
        fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
      }
      
      // 写入用户导航文件
      fs.writeFileSync(modularUserNavFile, defaultNavContent, 'utf8');
      
      // 更新新创建的文件
      navigationUpdated = updateNavigationFile(modularUserNavFile);
    } catch (error) {
      console.error(`Error creating user navigation file:`, error);
    }
  }
}

// 更新单个导航配置文件
function updateNavigationFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const navConfig = yaml.load(content);
    
    // 检查是否已有书签页面
    const hasBookmarksNav = Array.isArray(navConfig) && 
      navConfig.some(nav => nav.id === 'bookmarks');
    
    if (!hasBookmarksNav) {
      // 添加书签导航项
      if (!Array.isArray(navConfig)) {
        console.log(`Warning: Navigation config in ${filePath} is not an array, cannot update`);
        return false;
      }
      
      navConfig.push({
        name: '书签',
        icon: 'fas fa-bookmark',
        id: 'bookmarks',
        active: false
      });
      
      // 更新文件
      const updatedYaml = yaml.dump(navConfig, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"'
      });
      
      fs.writeFileSync(filePath, updatedYaml, 'utf8');
      return true;
    }
    
    return false; // 无需更新
  } catch (error) {
    console.error(`Error updating navigation file ${filePath}:`, error);
    return false;
  }
}

// 主函数
async function main() {
  // 获取最新的书签文件
  const bookmarkFile = getLatestBookmarkFile();
  if (!bookmarkFile) {
    return;
  }
  
  try {
    // 读取文件内容
    const htmlContent = fs.readFileSync(bookmarkFile, 'utf8');
    
    // 解析书签
    const bookmarks = parseBookmarks(htmlContent);
    if (bookmarks.categories.length === 0) {
      console.error('ERROR: No bookmark categories found in the HTML file. Processing aborted.');
      return;
    }
    
    // 生成YAML
    const yaml = generateBookmarksYaml(bookmarks);
    if (!yaml) {
      console.error('ERROR: Failed to generate YAML from bookmarks. Processing aborted.');
      return;
    }
    
    try {
      // 确保目标目录存在
      if (!fs.existsSync(CONFIG_USER_PAGES_DIR)) {
        fs.mkdirSync(CONFIG_USER_PAGES_DIR, { recursive: true });
      }
      
      // 保存YAML到模块化位置
      fs.writeFileSync(MODULAR_OUTPUT_FILE, yaml, 'utf8');
      
      // 验证文件是否确实被创建
      if (!fs.existsSync(MODULAR_OUTPUT_FILE)) {
        console.error(`ERROR: File was not created: ${MODULAR_OUTPUT_FILE}`);
        process.exit(1);
      }
      
      // 更新导航
      updateNavigationWithBookmarks();
    } catch (writeError) {
      console.error(`ERROR writing file:`, writeError);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error processing bookmark file:', error);
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