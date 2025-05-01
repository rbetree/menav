const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 书签文件夹路径 - 使用相对路径
const BOOKMARKS_DIR = 'bookmarks';
// 输出配置文件路径 - 使用相对路径
const OUTPUT_FILE = 'bookmarks.user.yml';
// 默认书签配置文件路径 - 使用相对路径
const DEFAULT_BOOKMARKS_FILE = 'bookmarks.yml';

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
      console.log('Creating bookmarks directory');
      fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
      return null;
    }

    // 获取目录中的所有HTML文件
    const files = fs.readdirSync(BOOKMARKS_DIR)
      .filter(file => file.toLowerCase().endsWith('.html'));

    if (files.length === 0) {
      console.log('No bookmark HTML files found');
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
    console.log(`Found latest bookmark file: ${latestFile}`);
    
    return path.join(BOOKMARKS_DIR, latestFile);
  } catch (error) {
    console.error('Error finding bookmark file:', error);
    return null;
  }
}

// 解析书签HTML内容
function parseBookmarks(htmlContent) {
  // 简单的正则表达式匹配方法解析书签文件
  // 注意：这是一个简化实现，可能不适用于所有浏览器的书签格式
  const folderRegex = /<DT><H3[^>]*>(.*?)<\/H3>/g;
  const bookmarkRegex = /<DT><A HREF="([^"]+)"[^>]*>(.*?)<\/A>/g;
  
  // 储存解析结果
  const bookmarks = {
    categories: []
  };
  
  // 提取文件夹
  let match;
  let folderMatches = [];
  while ((match = folderRegex.exec(htmlContent)) !== null) {
    folderMatches.push({
      index: match.index,
      name: match[1].trim(),
      end: match.index + match[0].length
    });
  }
  
  // 对每个文件夹，提取其中的书签
  for (let i = 0; i < folderMatches.length; i++) {
    const folder = folderMatches[i];
    const nextFolder = folderMatches[i + 1];
    
    // 确定当前文件夹的内容范围
    const folderContent = nextFolder 
      ? htmlContent.substring(folder.end, nextFolder.index)
      : htmlContent.substring(folder.end);
    
    // 从文件夹内容中提取书签
    const sites = [];
    let bookmarkMatch;
    bookmarkRegex.lastIndex = 0; // 重置regex索引
    
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
        description: name
      });
    }
    
    // 只添加包含书签的文件夹
    if (sites.length > 0) {
      bookmarks.categories.push({
        name: folder.name,
        icon: 'fas fa-folder', // 默认使用文件夹图标
        sites: sites
      });
    }
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
    
    // 添加注释
    const yamlWithComment = 
`# 自动生成的书签配置文件 - 用户自定义版本
# 由bookmark-processor.js生成于 ${new Date().toISOString()}
# 若要更新，请将新的书签HTML文件放入bookmarks/目录
# 注意：此文件会覆盖bookmarks.yml中的同名配置

${yamlString}`;
    
    return yamlWithComment;
  } catch (error) {
    console.error('Error generating YAML:', error);
    return null;
  }
}

// 更新现有config.yml中的导航，添加书签页面
function updateConfigWithBookmarks() {
  const configFile = 'config.yml';
  const userConfigFile = 'config.user.yml';
  
  // 优先使用用户配置文件，如果存在
  const targetConfigFile = fs.existsSync(userConfigFile) ? userConfigFile : configFile;
  
  try {
    const configContent = fs.readFileSync(targetConfigFile, 'utf8');
    const config = yaml.load(configContent);
    
    // 检查导航中是否已有书签页面
    const hasBookmarksNav = config.navigation.some(nav => nav.id === 'bookmarks');
    
    if (!hasBookmarksNav) {
      // 添加书签页面到导航
      config.navigation.push({
        name: '书签',
        icon: 'fas fa-bookmark',
        id: 'bookmarks',
        active: false
      });
      
      // 更新配置文件
      const updatedYaml = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"'
      });
      
      fs.writeFileSync(targetConfigFile, updatedYaml, 'utf8');
      console.log(`Updated ${targetConfigFile} with bookmarks navigation`);
    }
  } catch (error) {
    console.error('Error updating config with bookmarks navigation:', error);
  }
}

// 主函数
async function main() {
  console.log('Starting bookmark processing...');
  console.log(`Current working directory: ${process.cwd()}`);
  console.log(`Output file will be: ${OUTPUT_FILE} (absolute: ${path.resolve(OUTPUT_FILE)})`);
  
  // 获取最新的书签文件
  const bookmarkFile = getLatestBookmarkFile();
  if (!bookmarkFile) {
    console.log('No bookmark file to process.');
    return;
  }
  
  try {
    // 读取文件内容
    console.log(`Reading bookmark file: ${bookmarkFile}`);
    const htmlContent = fs.readFileSync(bookmarkFile, 'utf8');
    
    // 解析书签
    const bookmarks = parseBookmarks(htmlContent);
    console.log(`Found ${bookmarks.categories.length} categories with bookmarks`);
    if (bookmarks.categories.length === 0) {
      console.error('ERROR: No bookmark categories found in the HTML file. Processing aborted.');
      return;
    }
    console.log('Categories found:');
    bookmarks.categories.forEach(cat => {
      console.log(`- ${cat.name}: ${cat.sites.length} sites`);
    });
    
    // 生成YAML
    const yaml = generateBookmarksYaml(bookmarks);
    if (!yaml) {
      console.error('ERROR: Failed to generate YAML from bookmarks. Processing aborted.');
      return;
    }
    
    // 显示将要写入的YAML前几行
    console.log('Generated YAML preview (first 5 lines):');
    console.log(yaml.split('\n').slice(0, 5).join('\n') + '\n...');
    
    try {
      // 确保目标目录存在
      const outputDir = path.dirname(OUTPUT_FILE);
      if (!fs.existsSync(outputDir) && outputDir !== '.') {
        console.log(`Creating output directory: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // 保存YAML文件
      console.log(`Writing to: ${OUTPUT_FILE}`);
      fs.writeFileSync(OUTPUT_FILE, yaml, 'utf8');
      
      // 验证文件是否确实被创建
      if (fs.existsSync(OUTPUT_FILE)) {
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`Successfully saved bookmarks configuration to ${OUTPUT_FILE}`);
        console.log(`Verified file exists: ${OUTPUT_FILE}`);
        console.log(`File size: ${stats.size} bytes`);
        console.log(`File permissions: ${stats.mode.toString(8)}`);
        
        // 列出当前目录内容以确认
        console.log('Current directory contains:');
        fs.readdirSync('.').forEach(file => {
          console.log(`- ${file}`);
        });
      } else {
        console.error(`ERROR: File was not created: ${OUTPUT_FILE}`);
        process.exit(1);
      }
      
      // 更新导航
      updateConfigWithBookmarks();
    } catch (writeError) {
      console.error(`ERROR writing file ${OUTPUT_FILE}:`, writeError);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error processing bookmark file:', error);
    process.exit(1);
  }
}

// 执行主函数
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 