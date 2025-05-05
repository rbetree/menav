/**
 * MeNav 配置迁移工具
 * 将旧版双文件配置转换为新版模块化配置
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 配置文件路径
const LEGACY_CONFIG_FILE = 'config.yml';
const LEGACY_USER_CONFIG_FILE = 'config.user.yml';
const LEGACY_BOOKMARKS_FILE = 'bookmarks.yml';
const LEGACY_USER_BOOKMARKS_FILE = 'bookmarks.user.yml';

// 模块化配置目录
const CONFIG_USER_DIR = 'config/user';
const CONFIG_USER_PAGES_DIR = path.join(CONFIG_USER_DIR, 'pages');

/**
 * 迁移旧式配置文件到模块化格式
 */
function migrateConfiguration() {
  console.log('\n======== MeNav 配置迁移工具 ========');
  console.log('将旧式双文件配置转换为模块化配置\n');
  
  // 检查是否存在旧式配置文件
  const hasUserConfig = fs.existsSync(LEGACY_USER_CONFIG_FILE);
  const hasDefaultConfig = fs.existsSync(LEGACY_CONFIG_FILE);
  const hasUserBookmarks = fs.existsSync(LEGACY_USER_BOOKMARKS_FILE);
  const hasDefaultBookmarks = fs.existsSync(LEGACY_BOOKMARKS_FILE);
  
  if (!hasUserConfig && !hasDefaultConfig && !hasUserBookmarks && !hasDefaultBookmarks) {
    console.log('未找到任何旧式配置文件，无需迁移。');
    return;
  }
  
  // 确保目标目录存在
  if (!fs.existsSync(CONFIG_USER_DIR)) {
    fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(CONFIG_USER_PAGES_DIR)) {
    fs.mkdirSync(CONFIG_USER_PAGES_DIR, { recursive: true });
  }
  
  // 优先使用用户配置，如果不存在则使用默认配置
  const configFile = hasUserConfig ? LEGACY_USER_CONFIG_FILE : hasDefaultConfig ? LEGACY_CONFIG_FILE : null;
  
  // 迁移主配置文件
  if (configFile) {
    try {
      console.log(`迁移配置文件: ${configFile}`);
      const configContent = fs.readFileSync(configFile, 'utf8');
      const config = yaml.load(configContent);
      
      // 提取站点配置
      if (config.site) {
        const siteConfig = {
          title: config.site.title || '',
          description: config.site.description || '',
          author: config.site.author || '',
          favicon: config.site.favicon || 'favicon.ico'
        };
        
        // 添加字体配置
        if (config.fonts) {
          siteConfig.fonts = config.fonts;
        }
        
        // 添加个人资料配置
        if (config.profile) {
          siteConfig.profile = config.profile;
        }
        
        // 添加社交媒体配置
        if (config.social && config.social.length > 0) {
          siteConfig.social = config.social;
        }
        
        // 写入站点配置
        const siteYaml = yaml.dump(siteConfig, { indent: 2, lineWidth: -1, quotingType: '"' });
        fs.writeFileSync(
          path.join(CONFIG_USER_DIR, 'site.yml'),
          `# 由migrate-config.js从${configFile}迁移\n# 生成于 ${new Date().toISOString()}\n\n${siteYaml}`,
          'utf8'
        );
        console.log('✓ 已创建站点配置文件: site.yml');
      }
      
      // 提取导航配置
      if (config.navigation && config.navigation.length > 0) {
        const navigationYaml = yaml.dump(config.navigation, { indent: 2, lineWidth: -1, quotingType: '"' });
        fs.writeFileSync(
          path.join(CONFIG_USER_DIR, 'navigation.yml'),
          `# 由migrate-config.js从${configFile}迁移\n# 生成于 ${new Date().toISOString()}\n\n${navigationYaml}`,
          'utf8'
        );
        console.log('✓ 已创建导航配置文件: navigation.yml');
      }
      
      // 提取所有页面配置
      const pageIds = config.navigation ? config.navigation.map(nav => nav.id) : [];
      pageIds.forEach(pageId => {
        if (config[pageId]) {
          const pageConfig = { ...config[pageId] };
          
          // 特殊处理首页的categories
          if (pageId === 'home' && !pageConfig.categories && config.categories) {
            pageConfig.categories = config.categories;
          }
          
          const pageYaml = yaml.dump(pageConfig, { indent: 2, lineWidth: -1, quotingType: '"' });
          fs.writeFileSync(
            path.join(CONFIG_USER_PAGES_DIR, `${pageId}.yml`),
            `# 由migrate-config.js从${configFile}迁移\n# 生成于 ${new Date().toISOString()}\n\n${pageYaml}`,
            'utf8'
          );
          console.log(`✓ 已创建页面配置文件: ${pageId}.yml`);
        }
      });
      
      // 如果首页不在pageIds中但存在categories，创建一个home.yml
      if (!pageIds.includes('home') && config.categories) {
        const homeConfig = {
          title: '我的导航',
          subtitle: '个人收藏网址',
          categories: config.categories
        };
        
        const homeYaml = yaml.dump(homeConfig, { indent: 2, lineWidth: -1, quotingType: '"' });
        fs.writeFileSync(
          path.join(CONFIG_USER_PAGES_DIR, 'home.yml'),
          `# 由migrate-config.js从${configFile}迁移\n# 生成于 ${new Date().toISOString()}\n\n${homeYaml}`,
          'utf8'
        );
        console.log('✓ 已创建首页配置文件: home.yml');
      }
    } catch (error) {
      console.error(`迁移配置文件${configFile}时出错:`, error);
    }
  }
  
  // 迁移书签配置文件
  const bookmarksFile = hasUserBookmarks ? LEGACY_USER_BOOKMARKS_FILE : hasDefaultBookmarks ? LEGACY_BOOKMARKS_FILE : null;
  
  if (bookmarksFile) {
    try {
      console.log(`\n迁移书签配置文件: ${bookmarksFile}`);
      
      // 直接复制书签配置文件
      fs.copyFileSync(
        bookmarksFile,
        path.join(CONFIG_USER_PAGES_DIR, 'bookmarks.yml')
      );
      console.log('✓ 已创建书签配置文件: bookmarks.yml');
    } catch (error) {
      console.error(`迁移书签配置文件${bookmarksFile}时出错:`, error);
    }
  }
  
  console.log('\n迁移完成！');
  console.log('您现在可以删除旧的配置文件：');
  if (hasUserConfig) console.log(`- ${LEGACY_USER_CONFIG_FILE}`);
  if (hasDefaultConfig) console.log(`- ${LEGACY_CONFIG_FILE}`);
  if (hasUserBookmarks) console.log(`- ${LEGACY_USER_BOOKMARKS_FILE}`);
  if (hasDefaultBookmarks) console.log(`- ${LEGACY_BOOKMARKS_FILE}`);
  console.log('\n新的模块化配置文件位于：');
  console.log(`- ${CONFIG_USER_DIR}/`);
  console.log(`- ${CONFIG_USER_PAGES_DIR}/`);
}

// 如果直接运行该脚本，则执行迁移
if (require.main === module) {
  migrateConfiguration();
}

module.exports = { migrateConfiguration }; 