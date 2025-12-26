const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { execFileSync } = require('child_process');
const Handlebars = require('handlebars');

// 导入Handlebars助手函数
const { registerAllHelpers } = require('./helpers');

// 注册Handlebars实例和辅助函数
const handlebars = Handlebars.create();
registerAllHelpers(handlebars);

// 加载和注册Handlebars模板的函数
function loadHandlebarsTemplates() {
    const templatesDir = path.join(process.cwd(), 'templates');

    // 检查基本模板目录是否存在
    if (!fs.existsSync(templatesDir)) {
        throw new Error('Templates directory not found. Cannot proceed without templates.');
    }

    // 加载布局模板
    const layoutsDir = path.join(templatesDir, 'layouts');
    if (fs.existsSync(layoutsDir)) {
        fs.readdirSync(layoutsDir).forEach(file => {
            if (file.endsWith('.hbs')) {
                const layoutName = path.basename(file, '.hbs');
                const layoutPath = path.join(layoutsDir, file);
                const layoutContent = fs.readFileSync(layoutPath, 'utf8');
                handlebars.registerPartial(layoutName, layoutContent);
            }
        });
    } else {
        throw new Error('Layouts directory not found. Cannot proceed without layout templates.');
    }

    // 加载组件模板
    const componentsDir = path.join(templatesDir, 'components');
    if (fs.existsSync(componentsDir)) {
        fs.readdirSync(componentsDir).forEach(file => {
            if (file.endsWith('.hbs')) {
                const componentName = path.basename(file, '.hbs');
                const componentPath = path.join(componentsDir, file);
                const componentContent = fs.readFileSync(componentPath, 'utf8');
                handlebars.registerPartial(componentName, componentContent);
            }
        });
    } else {
        throw new Error('Components directory not found. Cannot proceed without component templates.');
    }

    // 识别并检查默认布局模板是否存在
    const defaultLayoutPath = path.join(layoutsDir, 'default.hbs');
    if (!fs.existsSync(defaultLayoutPath)) {
        throw new Error('Default layout template not found. Cannot proceed without default layout.');
    }
}

/**
 * 获取默认布局模板
 * @returns {Object} 包含模板路径和编译的模板函数
 */
function getDefaultLayoutTemplate() {
  const defaultLayoutPath = path.join(process.cwd(), 'templates', 'layouts', 'default.hbs');

  // 检查默认布局模板是否存在
  if (!fs.existsSync(defaultLayoutPath)) {
    throw new Error('Default layout template not found. Cannot proceed without default layout.');
  }

  try {
    // 读取布局内容并编译模板
    const layoutContent = fs.readFileSync(defaultLayoutPath, 'utf8');
    const layoutTemplate = handlebars.compile(layoutContent);

    return {
      path: defaultLayoutPath,
      template: layoutTemplate
    };
  } catch (error) {
    throw new Error(`Error loading default layout template: ${error.message}`);
  }
}

// 渲染Handlebars模板函数
function renderTemplate(templateName, data, useLayout = true) {
    const templatePath = path.join(process.cwd(), 'templates', 'pages', `${templateName}.hbs`);

    // 检查模板是否存在
    if (!fs.existsSync(templatePath)) {
        // 尝试使用通用模板 page.hbs
        const genericTemplatePath = path.join(process.cwd(), 'templates', 'pages', 'page.hbs');

        if (fs.existsSync(genericTemplatePath)) {
            console.log(`模板 ${templateName}.hbs 不存在，使用通用模板 page.hbs 代替`);
            const genericTemplateContent = fs.readFileSync(genericTemplatePath, 'utf8');
            const genericTemplate = handlebars.compile(genericTemplateContent);

            // 添加 pageId 到数据中，以便通用模板使用
            const enhancedData = {
                ...data,
                pageId: templateName // 确保pageId在模板中可用
            };

            // 渲染页面内容
            const pageContent = genericTemplate(enhancedData);

            // 如果不使用布局，直接返回页面内容
            if (!useLayout) {
                return pageContent;
            }

            try {
                // 使用辅助函数获取默认布局模板
                const { template: layoutTemplate } = getDefaultLayoutTemplate();

                // 准备布局数据，包含页面内容
                const layoutData = {
                    ...enhancedData,
                    body: pageContent
                };

                // 渲染完整页面
                return layoutTemplate(layoutData);
            } catch (layoutError) {
                throw new Error(`Error rendering layout for ${templateName}: ${layoutError.message}`);
            }
        } else {
            throw new Error(`Template ${templateName}.hbs not found and generic template page.hbs not found. Cannot proceed without template.`);
        }
    }

    try {
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(templateContent);

        // 渲染页面内容
        const pageContent = template(data);

        // 如果不使用布局，直接返回页面内容
        if (!useLayout) {
            return pageContent;
        }

        try {
            // 使用辅助函数获取默认布局模板
            const { template: layoutTemplate } = getDefaultLayoutTemplate();

            // 准备布局数据，包含页面内容
            const layoutData = {
                ...data,
                body: pageContent
            };

            // 渲染完整页面
            return layoutTemplate(layoutData);
        } catch (layoutError) {
            throw new Error(`Error rendering layout for ${templateName}: ${layoutError.message}`);
        }
    } catch (error) {
        throw new Error(`Error rendering template ${templateName}: ${error.message}`);
    }
}

// HTML转义函数，防止XSS攻击
function escapeHtml(unsafe) {
    if (unsafe === undefined || unsafe === null) {
        return '';
    }
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 统一处理配置文件加载错误
 * @param {string} filePath 配置文件路径
 * @param {Error} error 错误对象
 */
function handleConfigLoadError(filePath, error) {
  console.error(`Error loading configuration from ${filePath}:`, error);
}

/**
 * 安全地加载YAML配置文件
 * @param {string} filePath 配置文件路径
 * @returns {Object|null} 配置对象，如果文件不存在或加载失败则返回null
 */
function safeLoadYamlConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    // 使用 loadAll 而不是 load 来支持多文档 YAML 文件
    const docs = yaml.loadAll(fileContent);
    
    // 如果只有一个文档，直接返回
    if (docs.length === 1) {
      return docs[0];
    }
    
    // 如果有多个文档，返回第一个文档（忽略后面的文档）
    if (docs.length > 1) {
      console.warn(`Warning: Multiple documents found in ${filePath}. Using the first document only.`);
      return docs[0];
    }
    
    return null;
  } catch (error) {
    handleConfigLoadError(filePath, error);
    return null;
  }
}

/**
 * 加载模块化配置目录
 * @param {string} dirPath 配置目录路径
 * @returns {Object|null} 配置对象，如果目录不存在或加载失败则返回null
 */
function loadModularConfig(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return null;
    }

    const config = {
        site: {},
        navigation: [],
        fonts: {},
        profile: {},
        social: [],
        categories: []
    };

    // 加载基础配置
    const siteConfigPath = path.join(dirPath, 'site.yml');
    const siteConfig = safeLoadYamlConfig(siteConfigPath);
    if (siteConfig) {
        // 将site.yml中的内容分配到正确的配置字段
        config.site = siteConfig;

        // 提取特殊字段到顶层配置
        if (siteConfig.fonts) config.fonts = siteConfig.fonts;
        if (siteConfig.profile) config.profile = siteConfig.profile;
        if (siteConfig.social) config.social = siteConfig.social;
        
        // 优先使用site.yml中的navigation配置
        if (siteConfig.navigation) {
            config.navigation = siteConfig.navigation;
            console.log('使用 site.yml 中的导航配置');
        }
    }

    // 如果site.yml中没有navigation配置，则回退到独立的navigation.yml
    if (!config.navigation || config.navigation.length === 0) {
        const navConfigPath = path.join(dirPath, 'navigation.yml');
        const navConfig = safeLoadYamlConfig(navConfigPath);
        if (navConfig) {
            config.navigation = navConfig;
            console.log('site.yml 中未找到导航配置，使用独立的 navigation.yml 文件');
            console.log('提示：建议将导航配置迁移到 site.yml 中，以便统一管理');
        }
    }

    // 加载页面配置
    const pagesPath = path.join(dirPath, 'pages');
    if (fs.existsSync(pagesPath)) {
        const files = fs.readdirSync(pagesPath).filter(file =>
            file.endsWith('.yml') || file.endsWith('.yaml'));

        files.forEach(file => {
            const filePath = path.join(pagesPath, file);
            const fileConfig = safeLoadYamlConfig(filePath);

            if (fileConfig) {
                // 提取文件名（不含扩展名）作为配置键
                const configKey = path.basename(file, path.extname(file));

                // 特殊处理home.yml中的categories字段
                if (configKey === 'home' && fileConfig.categories) {
                    config.categories = fileConfig.categories;
                }

                // 将页面配置添加到主配置对象
                config[configKey] = fileConfig;
            }
        });
    }

    return config;
}

/**
 * 确保配置对象具有必要的默认值
 * @param {Object} config 配置对象
 * @returns {Object} 处理后的配置对象
 */
function ensureConfigDefaults(config) {
  // 创建一个新对象，避免修改原始配置
  const result = { ...config };

  // 确保基本结构存在
  result.site = result.site || {};
  result.navigation = result.navigation || [];
  result.fonts = result.fonts || {};

  // 确保字体配置完整
  result.fonts.title = result.fonts.title || {};
  result.fonts.title.family = result.fonts.title.family || 'Arial';
  result.fonts.title.weight = result.fonts.title.weight || 700;
  result.fonts.title.source = result.fonts.title.source || 'system';

  result.fonts.subtitle = result.fonts.subtitle || {};
  result.fonts.subtitle.family = result.fonts.subtitle.family || 'Arial';
  result.fonts.subtitle.weight = result.fonts.subtitle.weight || 500;
  result.fonts.subtitle.source = result.fonts.subtitle.source || 'system';

  result.fonts.body = result.fonts.body || {};
  result.fonts.body.family = result.fonts.body.family || 'Arial';
  result.fonts.body.weight = result.fonts.body.weight || 400;
  result.fonts.body.source = result.fonts.body.source || 'system';

  result.profile = result.profile || {};
  result.social = result.social || [];
  result.categories = result.categories || [];
  // 图标配置默认值
  result.icons = result.icons || {};
  // icons.mode: manual | favicon, 默认 favicon
  result.icons.mode = result.icons.mode || 'favicon';

  // 站点基本信息默认值
  result.site.title = result.site.title || 'MeNav导航';
  result.site.description = result.site.description || '个人网络导航站';
  result.site.author = result.site.author || 'MeNav User';
  result.site.logo_text = result.site.logo_text || '导航站';
  result.site.favicon = result.site.favicon || 'menav.svg';
  result.site.logo = result.site.logo || null;
  result.site.footer = result.site.footer || '';
  result.site.theme = result.site.theme || {
    primary: '#4a89dc',
    background: '#f5f7fa',
    modeToggle: true
  };

  // 用户资料默认值
  result.profile = result.profile || {};
  result.profile.title = result.profile.title || '欢迎使用';
  result.profile.subtitle = result.profile.subtitle || 'MeNav个人导航系统';

  // 处理站点默认值的辅助函数
  function processSiteDefaults(site) {
    site.name = site.name || '未命名站点';
    site.url = site.url || '#';
    site.description = site.description || '';
    site.icon = site.icon || 'fas fa-link';
    site.external = typeof site.external === 'boolean' ? site.external : true;
  }

  // 处理分类默认值的辅助函数
  function processCategoryDefaults(category) {
    category.name = category.name || '未命名分类';
    category.sites = category.sites || [];
    category.sites.forEach(processSiteDefaults);
  }

  // 为首页的每个类别和站点设置默认值
  result.categories = result.categories || [];
  result.categories.forEach(processCategoryDefaults);

  // 为所有页面配置中的类别和站点设置默认值
  Object.keys(result).forEach(key => {
    const pageConfig = result[key];
    // 检查是否是页面配置对象
    if (!pageConfig || typeof pageConfig !== 'object') return;

    // 传统结构：categories -> sites
    if (Array.isArray(pageConfig.categories)) {
      pageConfig.categories.forEach(processCategoryDefaults);
    }

    // 扁平结构：sites（用于 friends/articles 等“无层级并列卡片”页面）
    if (Array.isArray(pageConfig.sites)) {
      pageConfig.sites.forEach(processSiteDefaults);
    }
  });

  return result;
}

/**
 * 验证配置是否有效
 * @param {Object} config 配置对象
 * @returns {boolean} 配置是否有效
 */
function validateConfig(config) {
  // 基本结构检查
  if (!config || typeof config !== 'object') {
    console.error('配置无效: 配置必须是一个对象');
    return false;
  }

  // 所有其他验证被移除，因为它们只是检查但没有实际操作
  // 配置默认值和数据修复已经在ensureConfigDefaults函数中处理

  return true;
}

/**
 * 获取导航项的子菜单数据
 * @param {Object} navItem 导航项对象
 * @param {Object} config 配置对象
 * @returns {Array|null} 子菜单数据数组或null
 */
function getSubmenuForNavItem(navItem, config) {
  if (!navItem || !navItem.id || !config) {
    return null;
  }

  // friends/articles 模板为“无层级扁平展示”，不生成分类子菜单，避免出现“有子菜单但页面无分类标题”的割裂体验
  const pageConfig = config[navItem.id];
  const pageTemplate = pageConfig && pageConfig.template ? pageConfig.template : navItem.id;
  if (pageTemplate === 'friends' || pageTemplate === 'articles') {
    return null;
  }

  // 首页页面添加子菜单（分类）
  if (navItem.id === 'home' && Array.isArray(config.categories)) {
    return config.categories;
  }
  // 书签页面添加子菜单（分类）
  else if (navItem.id === 'bookmarks' && config.bookmarks && Array.isArray(config.bookmarks.categories)) {
    return config.bookmarks.categories;
  }
  // 项目页面添加子菜单
  else if (navItem.id === 'projects' && config.projects && Array.isArray(config.projects.categories)) {
    return config.projects.categories;
  }
  // 文章页面添加子菜单
  else if (navItem.id === 'articles' && config.articles && Array.isArray(config.articles.categories)) {
    return config.articles.categories;
  }
  // 友链页面添加子菜单
  else if (navItem.id === 'friends' && config.friends && Array.isArray(config.friends.categories)) {
    return config.friends.categories;
  }
  // 通用处理：任意自定义页面的子菜单生成
  else if (config[navItem.id] && config[navItem.id].categories && Array.isArray(config[navItem.id].categories)) {
    return config[navItem.id].categories;
  }

  return null;
}

/**
 * 将 JSON 字符串安全嵌入到 <script> 中，避免出现 `</script>` 结束标签导致脚本块被提前终止。
 * 说明：返回值仍是合法 JSON，JSON.parse 后数据不变。
 * @param {string} jsonString JSON 字符串
 * @returns {string} 安全的 JSON 字符串
 */
function makeJsonSafeForHtmlScript(jsonString) {
  if (typeof jsonString !== 'string') {
    return '';
  }

  return jsonString.replace(/<\/script/gi, '<\\/script');
}

/**
 * 解析页面配置文件路径（优先 user，回退 _default）
 * 注意：仅用于构建期读取文件元信息，不会把路径注入到页面/扩展配置中。
 * @param {string} pageId 页面ID（与 pages/<id>.yml 文件名对应）
 * @returns {string|null} 文件路径或 null
 */
function resolvePageConfigFilePath(pageId) {
  if (!pageId) return null;

  const candidates = [
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yaml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yaml`),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch (e) {
      // 忽略 IO 异常，继续尝试下一个候选
    }
  }

  return null;
}

/**
 * 尝试获取文件最后一次 git 提交时间（ISO 字符串）
 * @param {string} filePath 文件路径
 * @returns {string|null} ISO 字符串（UTC），失败返回 null
 */
function tryGetGitLastCommitIso(filePath) {
  if (!filePath) return null;

  try {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const output = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', relativePath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const raw = String(output || '').trim();
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 获取文件 mtime（ISO 字符串）
 * @param {string} filePath 文件路径
 * @returns {string|null} ISO 字符串（UTC），失败返回 null
 */
function tryGetFileMtimeIso(filePath) {
  if (!filePath) return null;

  try {
    const stats = fs.statSync(filePath);
    const mtime = stats && stats.mtime ? stats.mtime : null;
    if (!(mtime instanceof Date) || Number.isNaN(mtime.getTime())) return null;
    return mtime.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 计算页面配置文件“内容更新时间”（优先 git，回退 mtime）
 * @param {string} pageId 页面ID
 * @returns {{updatedAt: string, updatedAtSource: 'git'|'mtime'}|null}
 */
function getPageConfigUpdatedAtMeta(pageId) {
  const filePath = resolvePageConfigFilePath(pageId);
  if (!filePath) return null;

  const gitIso = tryGetGitLastCommitIso(filePath);
  if (gitIso) {
    return { updatedAt: gitIso, updatedAtSource: 'git' };
  }

  const mtimeIso = tryGetFileMtimeIso(filePath);
  if (mtimeIso) {
    return { updatedAt: mtimeIso, updatedAtSource: 'mtime' };
  }

  return null;
}

/**
 * 读取 articles 页面 RSS 缓存（Phase 2）
 * - 缓存默认放在 dev/（仓库默认 gitignore）
 * - 构建端只读缓存：缓存缺失/损坏时回退到 Phase 1（flatCategories 扁平站点入口）
 * @param {string} pageId 页面ID（用于支持多个 articles 页面的独立缓存）
 * @param {Object} config 全站配置（用于读取 site.rss.cacheDir）
 * @returns {{items: Array<Object>, meta: Object}|null}
 */
function tryLoadArticlesFeedCache(pageId, config) {
  if (!pageId) return null;

  const cacheDirFromEnv = process.env.RSS_CACHE_DIR ? String(process.env.RSS_CACHE_DIR) : '';
  const cacheDirFromConfig =
    config && config.site && config.site.rss && config.site.rss.cacheDir ? String(config.site.rss.cacheDir) : '';
  const cacheDir = cacheDirFromEnv || cacheDirFromConfig || 'dev';

  const cacheBaseDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
  const cachePath = path.join(cacheBaseDir, `${pageId}.feed-cache.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const articles = Array.isArray(parsed.articles) ? parsed.articles : [];
    const items = articles
      .map(a => {
        const title = a && a.title ? String(a.title) : '';
        const url = a && a.url ? String(a.url) : '';
        if (!title || !url) return null;

        return {
          // 兼容 site-card partial 字段
          name: title,
          url,
          icon: a && a.icon ? String(a.icon) : 'fas fa-pen',
          description: a && a.summary ? String(a.summary) : '',

          // Phase 2 文章元信息（只读展示）
          publishedAt: a && a.publishedAt ? String(a.publishedAt) : '',
          source: a && a.source ? String(a.source) : '',

          // 文章链接通常应在新标签页打开
          external: true
        };
      })
      .filter(Boolean);

    return {
      items,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || '',
        total: parsed.stats && Number.isFinite(parsed.stats.totalArticles) ? parsed.stats.totalArticles : items.length
      }
    };
  } catch (e) {
    console.warn(`[WARN] articles 缓存读取失败：${cachePath}（将回退 Phase 1）`);
    return null;
  }
}

function tryLoadProjectsRepoCache(pageId, config) {
  if (!pageId) return null;

  const cacheDirFromEnv = process.env.PROJECTS_CACHE_DIR ? String(process.env.PROJECTS_CACHE_DIR) : '';
  const cacheDirFromConfig =
    config && config.site && config.site.github && config.site.github.cacheDir ? String(config.site.github.cacheDir) : '';
  const cacheDir = cacheDirFromEnv || cacheDirFromConfig || 'dev';

  const cacheBaseDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
  const cachePath = path.join(cacheBaseDir, `${pageId}.repo-cache.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const repos = Array.isArray(parsed.repos) ? parsed.repos : [];
    const map = new Map();
    repos.forEach(r => {
      const url = r && r.url ? String(r.url) : '';
      if (!url) return;
      map.set(url, {
        language: r && r.language ? String(r.language) : '',
        languageColor: r && r.languageColor ? String(r.languageColor) : '',
        stars: Number.isFinite(r && r.stars) ? r.stars : null,
        forks: Number.isFinite(r && r.forks) ? r.forks : null
      });
    });

    return {
      map,
      meta: {
        pageId: parsed.pageId || pageId,
        generatedAt: parsed.generatedAt || ''
      }
    };
  } catch (e) {
    console.warn(`[WARN] projects 缓存读取失败：${cachePath}（将仅展示标题与描述）`);
    return null;
  }
}

function normalizeGithubRepoUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url));
    if (u.hostname.toLowerCase() !== 'github.com') return '';
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) return '';
    return `https://github.com/${owner}/${repo}`;
  } catch {
    return '';
  }
}

function applyRepoMetaToCategories(categories, repoMetaMap) {
  if (!Array.isArray(categories) || !(repoMetaMap instanceof Map)) return;

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.subcategories)) node.subcategories.forEach(walk);
    if (Array.isArray(node.groups)) node.groups.forEach(walk);
    if (Array.isArray(node.subgroups)) node.subgroups.forEach(walk);

    if (Array.isArray(node.sites)) {
      node.sites.forEach(site => {
        if (!site || typeof site !== 'object' || !site.url) return;
        const canonical = normalizeGithubRepoUrl(site.url);
        if (!canonical) return;
        const meta = repoMetaMap.get(canonical);
        if (!meta) return;

        site.language = meta.language || '';
        site.languageColor = meta.languageColor || '';
        site.stars = meta.stars;
        site.forks = meta.forks;
      });
    }
  };

  categories.forEach(walk);
}

/**
 * 从任意层级节点递归收集 sites（用于 friends/articles 扁平化展示）
 * @param {any} node 当前节点（category/subcategory/group/subgroup）
 * @param {Array<Object>} output 收集到的 sites 数组
 */
function collectSitesRecursively(node, output) {
  if (!node || typeof node !== 'object') return;

  // 先深入子层级（保持与现有模板结构相近的遍历顺序）
  if (Array.isArray(node.subcategories)) {
    node.subcategories.forEach(child => collectSitesRecursively(child, output));
  }
  if (Array.isArray(node.groups)) {
    node.groups.forEach(child => collectSitesRecursively(child, output));
  }
  if (Array.isArray(node.subgroups)) {
    node.subgroups.forEach(child => collectSitesRecursively(child, output));
  }

  // 再收集当前层级 sites
  if (Array.isArray(node.sites)) {
    node.sites.forEach(site => {
      if (site && typeof site === 'object') output.push(site);
    });
  }
}

/**
 * 将页面 categories 中的所有 sites 扁平化为一个数组
 * @param {Array<any>} categories 顶层分类数组
 * @returns {Array<Object>} sites 扁平数组
 */
function buildFlatSitesFromCategories(categories) {
  const output = [];
  if (!Array.isArray(categories)) return output;
  categories.forEach(category => collectSitesRecursively(category, output));
  return output;
}

/**
 * 将页面的顶层 categories 映射为“无标题分类容器”数据：保留顶层分类 name/icon，但 sites 扁平化合并其子层级 sites
 * @param {Array<any>} categories 顶层分类数组
 * @returns {Array<{name: string, icon: string, sites: Array<Object>}>}
 */
function buildFlatCategoriesFromCategories(categories) {
  if (!Array.isArray(categories)) return [];

  return categories.map(category => {
    const sites = [];
    collectSitesRecursively(category, sites);

    return {
      name: category && category.name ? category.name : '',
      icon: category && category.icon ? category.icon : '',
      sites
    };
  });
}

/**
 * 准备渲染数据，添加模板所需的特殊属性
 * @param {Object} config 配置对象
 * @returns {Object} 增强的渲染数据
 */
function prepareRenderData(config) {
  // 创建渲染数据对象，包含原始配置
  const renderData = { ...config };

  // 添加额外渲染数据
  renderData._meta = {
    generated_at: new Date(),
    version: process.env.npm_package_version || '1.0.0',
    generator: 'MeNav'
  };

  // 确保navigation是数组
  if (!Array.isArray(renderData.navigation)) {
    renderData.navigation = [];
    // 移除警告日志，数据处理逻辑保留
  }

  // 添加导航项的活动状态标记和子菜单
  if (Array.isArray(renderData.navigation)) {
    renderData.navigation = renderData.navigation.map((item, index) => {
      const navItem = {
        ...item,
        isActive: index === 0, // 默认第一项为活动项
        id: item.id || `nav-${index}`,
        active: index === 0 // 保持旧模板兼容（由顺序决定，不读取配置的 active 字段）
      };

      // 使用辅助函数获取子菜单
      const submenu = getSubmenuForNavItem(navItem, renderData);
      if (submenu) {
        navItem.submenu = submenu;
      }

      return navItem;
    });
  }

  // 首页（默认页）规则：navigation 顺序第一项即首页
  renderData.homePageId = renderData.navigation && renderData.navigation[0] ? renderData.navigation[0].id : null;

  // 添加序列化的配置数据，用于浏览器扩展（确保包含 homePageId 等处理结果）
  renderData.configJSON = makeJsonSafeForHtmlScript(
    JSON.stringify({
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      data: renderData // 使用经过处理的renderData而不是原始config
    })
  );

  // 为Handlebars模板特别准备navigationData数组
  renderData.navigationData = renderData.navigation;

  // 确保social数据格式正确
  if (Array.isArray(renderData.social)) {
    renderData.socialLinks = renderData.social; // 兼容模板中的不同引用名
  }

  return renderData;
}

// 读取配置文件
function loadConfig() {
  // 初始化空配置对象
  let config = {
    site: {},
    navigation: [],
    fonts: {},
    profile: {},
    social: [],
    categories: []
  };

  // 检查模块化配置来源是否存在
  const hasUserModularConfig = fs.existsSync('config/user');
  const hasDefaultModularConfig = fs.existsSync('config/_default');

  // 根据优先级顺序选择最高优先级的配置
  if (hasUserModularConfig) {
    // 配置采用“完全替换”策略：一旦存在 config/user/，将不会回退到 config/_default/
    if (!fs.existsSync('config/user/site.yml')) {
      console.error('[ERROR] 检测到 config/user/ 目录，但缺少 config/user/site.yml。');
      console.error('[ERROR] 由于配置采用“完全替换”策略，系统不会从 config/_default/ 补齐缺失配置。');
      console.error('[ERROR] 解决方法：先完整复制 config/_default/ 到 config/user/，再按需修改。');
      process.exit(1);
    }

    if (!fs.existsSync('config/user/pages')) {
      console.warn('[WARN] 检测到 config/user/ 目录，但缺少 config/user/pages/。部分页面内容可能为空。');
      console.warn('[WARN] 建议：复制 config/_default/pages/ 到 config/user/pages/，再按需修改。');
    }

    // 1. 最高优先级: config/user/ 目录
    config = loadModularConfig('config/user');
  } else if (hasDefaultModularConfig) {
    // 2. 次高优先级: config/_default/ 目录
    config = loadModularConfig('config/_default');
  } else {
    // 3. 最低优先级: 旧版单文件配置 (config.yml or config.yaml)
    const legacyConfigPath = fs.existsSync('config.yml') ? 'config.yml' : 'config.yaml';

    if (fs.existsSync(legacyConfigPath)) {
      try {
        const fileContent = fs.readFileSync(legacyConfigPath, 'utf8');
        config = yaml.load(fileContent);
      } catch (e) {
        console.error(`Error loading configuration from ${legacyConfigPath}:`, e);
      }
    } else {
      console.error('No configuration found. Please create a configuration file.');
      process.exit(1);
    }
  }

  // 确保配置有默认值并通过验证
  config = ensureConfigDefaults(config);

  if (!validateConfig(config)) {
    // 移除警告日志，保留函数调用
  }

  // 准备渲染数据
  const renderData = prepareRenderData(config);

  return renderData;
}

// 生成导航菜单
function generateNavigation(navigation, config) {
    return navigation.map(nav => {
        // 根据页面ID获取对应的子菜单项（分类）
        let submenuItems = '';

        // 使用辅助函数获取子菜单数据
        const submenu = getSubmenuForNavItem(nav, config);

        // 如果存在子菜单，生成HTML
        if (submenu && Array.isArray(submenu)) {
            submenuItems = `
                <div class="submenu">
                    ${submenu.map(category => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `).join('')}
                </div>`;
        }

        return `
                <div class="nav-item-wrapper">
                    <a href="#" class="nav-item${nav.active ? ' active' : ''}" data-page="${escapeHtml(nav.id)}">
                        <div class="icon-container">
                            <i class="${escapeHtml(nav.icon)}"></i>
                        </div>
                        <span class="nav-text">${escapeHtml(nav.name)}</span>
                        ${submenuItems ? '<i class="fas fa-chevron-down submenu-toggle"></i>' : ''}
                    </a>
                    ${submenuItems}
                </div>`;
    }).join('\n');
}

// 生成网站卡片HTML
function generateSiteCards(sites) {
    if (!sites || !Array.isArray(sites) || sites.length === 0) {
        return `<p class="empty-sites">暂无网站</p>`;
    }

    return sites.map(site => `
                        <a href="${escapeHtml(site.url)}" class="site-card" title="${escapeHtml(site.name)} - ${escapeHtml(site.description || '')}">
                            <i class="${escapeHtml(site.icon || 'fas fa-link')}"></i>
                            <h3>${escapeHtml(site.name || '未命名站点')}</h3>
                            <p>${escapeHtml(site.description || '')}</p>
                        </a>`).join('\n');
}

// 生成分类板块
function generateCategories(categories) {
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
        return `
                <section class="category">
                    <h2><i class="fas fa-info-circle"></i> 暂无分类</h2>
                    <p>请在配置文件中添加分类</p>
                </section>`;
    }

    return categories.map(category => `
                <section class="category" id="${escapeHtml(category.name)}">
                    <h2><i class="${escapeHtml(category.icon)}"></i> ${escapeHtml(category.name)}</h2>
                    <div class="sites-grid">
                        ${generateSiteCards(category.sites)}
                    </div>
                </section>`).join('\n');
}

// 生成社交链接HTML
function generateSocialLinks(social) {
    if (!social || !Array.isArray(social) || social.length === 0) {
        return '';
    }

    // 尝试使用Handlebars模板
    try {
        const socialLinksPath = path.join(process.cwd(), 'templates', 'components', 'social-links.hbs');
        if (fs.existsSync(socialLinksPath)) {
            const templateContent = fs.readFileSync(socialLinksPath, 'utf8');
            const template = handlebars.compile(templateContent);
            // 确保数据格式正确
            return template(social); // 社交链接模板直接接收数组
        }
    } catch (error) {
        console.error('Error rendering social-links template:', error);
        // 出错时回退到原始生成方法
    }

    // 回退到原始生成方法
    return social.map(link => `
                    <a href="${escapeHtml(link.url)}" class="social-icon" target="_blank" rel="noopener" title="${escapeHtml(link.name || '社交链接')}" aria-label="${escapeHtml(link.name || '社交链接')}" data-type="social-link" data-name="${escapeHtml(link.name || '社交链接')}" data-url="${escapeHtml(link.url)}" data-icon="${escapeHtml(link.icon || 'fas fa-link')}">
                        <i class="${escapeHtml(link.icon || 'fas fa-link')}" aria-hidden="true"></i>
                        <span class="nav-text visually-hidden" data-editable="social-link-name">${escapeHtml(link.name || '社交链接')}</span>
                    </a>`).join('\n');
}

// 生成页面内容（包括首页和其他页面）
function generatePageContent(pageId, data) {
    // 确保数据对象存在
    if (!data) {
        console.error(`Missing data for page: ${pageId}`);
        return `
                <div class="welcome-section">
                    <h2>页面未配置</h2>
                    <p class="subtitle">请配置 ${pageId} 页面</p>
                </div>`;
    }

    // 首页使用profile数据，其他页面使用自身数据
    if (pageId === 'home') {
        const profile = data.profile || {};

        return `
                <div class="welcome-section">
                    <h2>${escapeHtml(profile.title || '欢迎使用')}</h2>
                    <h3>${escapeHtml(profile.subtitle || '个人导航站')}</h3>
                </div>
${generateCategories(data.categories)}`;
    } else {
        // 其他页面使用通用结构
        const title = data.title || `${pageId} 页面`;
        const subtitle = data.subtitle || '';
        const categories = data.categories || [];

        return `
                <div class="welcome-section">
                    <h2>${escapeHtml(title)}</h2>
                    <p class="subtitle">${escapeHtml(subtitle)}</p>
                </div>
                ${generateCategories(categories)}`;
    }
}

// 生成搜索结果页面
function generateSearchResultsPage(config) {
    // 获取所有导航页面ID
    const pageIds = config.navigation.map(nav => nav.id);

    // 生成所有页面的搜索结果区域
    const searchSections = pageIds.map(pageId => {
        // 根据页面ID获取对应的图标和名称
        const navItem = config.navigation.find(nav => nav.id === pageId);
        const icon = navItem ? navItem.icon : 'fas fa-file';
        const name = navItem ? navItem.name : pageId;

        return `
                <section class="category search-section" data-section="${escapeHtml(pageId)}" style="display: none;">
                    <h2><i class="${escapeHtml(icon)}"></i> ${escapeHtml(name)}匹配项</h2>
                    <div class="sites-grid"></div>
                </section>`;
    }).join('\n');

    return `
            <!-- 搜索结果页 -->
            <div class="page" id="search-results">
                <div class="welcome-section">
                    <h2>搜索结果</h2>
                    <p class="subtitle">在所有页面中找到的匹配项</p>
                </div>
${searchSections}
            </div>`;
}

// 生成Google Fonts链接
function generateGoogleFontsLink(config) {
    const fonts = config.fonts;
    const googleFonts = [];

    // 收集需要加载的Google字体
    Object.values(fonts).forEach(font => {
        if (font.source === 'google') {
            const fontName = font.family.replace(/["']/g, '');
            const fontWeight = font.weight || 400;
            googleFonts.push(`family=${fontName}:wght@${fontWeight}`);
        }
    });

    return googleFonts.length > 0
        ? `<link href="https://fonts.googleapis.com/css2?${googleFonts.join('&')}&display=swap" rel="stylesheet">`
        : '';
}

// 生成字体CSS变量
function generateFontVariables(config) {
    const fonts = config.fonts;
    let css = ':root {\n';

    Object.entries(fonts).forEach(([key, font]) => {
        css += `    --font-${key}: ${font.family};\n`;
        if (font.weight) {
            css += `    --font-weight-${key}: ${font.weight};\n`;
        }
    });

    css += '}';
    return css;
}

function normalizeGithubHeatmapColor(input) {
  const raw = String(input || '').trim().replace(/^#/, '');
  const color = raw.toLowerCase();
  if (/^[0-9a-f]{6}$/.test(color)) return color;
  if (/^[0-9a-f]{3}$/.test(color)) return color;
  return '339af0';
}

function getGithubUsernameFromConfig(config) {
  const username = config && config.site && config.site.github && config.site.github.username
    ? String(config.site.github.username).trim()
    : '';
  return username;
}

function buildProjectsMeta(config) {
  const username = getGithubUsernameFromConfig(config);
  if (!username) return null;

  const color = normalizeGithubHeatmapColor(
    config && config.site && config.site.github && config.site.github.heatmapColor
      ? config.site.github.heatmapColor
      : '339af0'
  );

  return {
    heatmap: {
      username,
      profileUrl: `https://github.com/${username}`,
      imageUrl: `https://ghchart.rshah.org/${color}/${username}`
    }
  };
}

/**
 * 渲染单个页面
 * @param {string} pageId 页面ID
 * @param {Object} config 配置数据
 * @returns {string} 渲染后的HTML
 */
function renderPage(pageId, config) {
  // 准备页面数据
  // 注意：config.categories 为 home.yml 的顶层分类（便于生成导航子菜单），不应无条件注入到所有页面，否则会导致“无 categories 的页面误显示首页内容”
  const { categories: _homeCategories, ...configWithoutHomeCategories } = config || {};
  const data = {
    ...configWithoutHomeCategories,
    currentPage: pageId,
    pageId // 同时保留pageId字段，用于通用模板
  };

  // 确保navigation是数组
  if (!Array.isArray(config.navigation)) {
    console.warn('Warning: config.navigation is not an array in renderPage. Using empty array.');
    data.navigation = [];
  } else {
    // 设置当前页面为活动页，其他页面为非活动
    data.navigation = config.navigation.map(nav => {
      const navItem = {
        ...nav,
        isActive: nav.id === pageId,
        active: nav.id === pageId // 兼容原有逻辑
      };

      // 使用辅助函数获取子菜单
      const submenu = getSubmenuForNavItem(navItem, config);
      if (submenu) {
        navItem.submenu = submenu;
      }

      return navItem;
    });
  }

  // 确保socialLinks字段存在
  data.socialLinks = Array.isArray(config.social) ? config.social : [];

  // 确保navigationData可用（针对模板使用）
  data.navigationData = data.navigation;

  // 页面特定的额外数据
  if (config[pageId]) {
    // 使用已经经过ensureConfigDefaults处理的配置数据
    Object.assign(data, config[pageId]);
  }

  // 检查页面配置中是否指定了模板（用于派生字段与渲染）
  const templateName = data.template ? data.template : pageId;

  // 页面级卡片风格开关（用于差异化）
  if (templateName === 'projects') {
    data.siteCardStyle = 'repo';
    data.projectsMeta = buildProjectsMeta(config);
    if (Array.isArray(data.categories)) {
      const repoCache = tryLoadProjectsRepoCache(pageId, config);
      if (repoCache && repoCache.map) {
        applyRepoMetaToCategories(data.categories, repoCache.map);
      }
    }
  }

  // friends/articles：无层级扁平展示所需派生字段（不写回 yml）
  if (templateName === 'friends' || templateName === 'articles') {
    let categories = Array.isArray(data.categories) ? data.categories : [];

    // 如果用户使用了顶层 sites（推荐的扁平配置），则生成一个“隐式分类容器”供模板/扩展使用
    if (categories.length === 0 && Array.isArray(data.sites) && data.sites.length > 0) {
      const implicitName = templateName === 'friends' ? '全部友链' : '全部来源';
      categories = [
        {
          name: implicitName,
          icon: 'fas fa-link',
          sites: data.sites
        }
      ];
    }

    data.flatSites = buildFlatSitesFromCategories(categories);
    data.flatCategories = buildFlatCategoriesFromCategories(categories);
  }

  // articles 模板页面：Phase 2 若存在 RSS 缓存，则注入 articlesItems（缓存缺失/损坏则回退 Phase 1）
  if (templateName === 'articles') {
    const cache = tryLoadArticlesFeedCache(pageId, config);
    data.articlesItems = cache && Array.isArray(cache.items) ? cache.items : [];
    data.articlesMeta = cache ? cache.meta : null;
  }

  // bookmarks 模板页面：注入配置文件“内容更新时间”（优先 git，回退 mtime）
  if (templateName === 'bookmarks') {
    const updatedAtMeta = getPageConfigUpdatedAtMeta(pageId);
    if (updatedAtMeta) {
      data.pageMeta = { ...updatedAtMeta };
    }
  }

  // 首页标题规则：使用 site.yml 的 profile 覆盖首页（导航第一项）的 title/subtitle 显示
  const homePageId = config.homePageId
    || (Array.isArray(config.navigation) && config.navigation[0] ? config.navigation[0].id : null)
    || 'home';
  // 供模板判断“当前是否首页”
  data.homePageId = homePageId;
  if (pageId === homePageId && config.profile) {
    if (config.profile.title !== undefined) data.title = config.profile.title;
    if (config.profile.subtitle !== undefined) data.subtitle = config.profile.subtitle;
  }

  if (config[pageId] && config[pageId].template) {
    console.log(`页面 ${pageId} 使用指定模板: ${templateName}`);
  }

  // 直接渲染页面内容，不使用layout布局（因为layout会在generateHTML中统一应用）
  return renderTemplate(templateName, data, false);
}

/**
 * 生成所有页面的HTML内容
 * @param {Object} config 配置对象
 * @returns {Object} 包含所有页面HTML的对象
 */
function generateAllPagesHTML(config) {
  // 页面内容集合
  const pages = {};

  // 渲染配置中定义的所有页面
  if (Array.isArray(config.navigation)) {
    config.navigation.forEach(navItem => {
      const pageId = navItem.id;

      // 渲染页面内容
      pages[pageId] = renderPage(pageId, config);
    });
  }

  // 确保搜索结果页存在
  if (!pages['search-results']) {
    pages['search-results'] = renderPage('search-results', config);
  }

  return pages;
}

/**
 * 生成完整的HTML
 * @param {Object} config 配置对象
 * @returns {string} 完整HTML
 */
function generateHTML(config) {
  // 获取所有页面内容
  const pages = generateAllPagesHTML(config);

  // 获取当前年份
  const currentYear = new Date().getFullYear();

  // 准备导航数据，添加submenu字段
  const navigationData = config.navigation.map(nav => {
    const navItem = { ...nav };

    // 使用辅助函数获取子菜单
    const submenu = getSubmenuForNavItem(navItem, config);
    if (submenu) {
      navItem.submenu = submenu;
    }

    return navItem;
  });

  // 准备Google Fonts链接
  const googleFontsLink = generateGoogleFontsLink(config);

  // 准备CSS字体变量
  const fontVariables = generateFontVariables(config);

  // 准备社交链接
  const socialLinks = generateSocialLinks(config.social);

  // 使用主布局模板
  const layoutData = {
    ...config,
    pages,
    googleFontsLink,
    fontVariables,
    navigationData,
    currentYear,
    socialLinks,
    navigation: generateNavigation(config.navigation, config), // 兼容旧版
    social: Array.isArray(config.social) ? config.social : [], // 兼容旧版

    // 确保配置数据可用于浏览器扩展
    configJSON: config.configJSON // 从prepareRenderData函数中获取的配置数据
  };

  try {
    // 使用辅助函数获取默认布局模板
    const { template: layoutTemplate } = getDefaultLayoutTemplate();

    // 渲染模板
    return layoutTemplate(layoutData);
  } catch (error) {
    console.error('Error rendering main HTML template:', error);
    throw error;
  }
}

// 复制静态文件
function copyStaticFiles(config) {
    // 确保dist目录存在
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist', { recursive: true });
    }

    // 复制CSS文件
    try {
        fs.copyFileSync('assets/style.css', 'dist/style.css');
    } catch (e) {
        console.error('Error copying style.css:', e);
    }

    try {
      fs.copyFileSync('assets/pinyin-match.js', 'dist/pinyin-match.js');
    } catch (e) {
      console.error('Error copying pinyin-match.js:', e);
    }
  
    // 复制JavaScript文件
    try {
        fs.copyFileSync('src/script.js', 'dist/script.js');
    } catch (e) {
        console.error('Error copying script.js:', e);
    }

    // 如果配置了favicon，确保文件存在并复制
    if (config.site.favicon) {
        try {
            if (fs.existsSync(`assets/${config.site.favicon}`)) {
                fs.copyFileSync(`assets/${config.site.favicon}`, `dist/${path.basename(config.site.favicon)}`);
            } else if (fs.existsSync(config.site.favicon)) {
                fs.copyFileSync(config.site.favicon, `dist/${path.basename(config.site.favicon)}`);
            } else {
                console.warn(`Warning: Favicon file not found: ${config.site.favicon}`);
            }
        } catch (e) {
            console.error('Error copying favicon:', e);
        }
    }
}

// 主函数
function main() {
    const config = loadConfig();

    try {
        // 确保dist目录存在
        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist', { recursive: true });
        }

        // 初始化Handlebars模板系统
        loadHandlebarsTemplates();

        // 使用generateHTML函数生成完整的HTML
        const htmlContent = generateHTML(config);

        // 生成HTML
        fs.writeFileSync('dist/index.html', htmlContent);

        // 复制静态文件
        copyStaticFiles(config);
    } catch (e) {
        console.error('Error in main function:', e);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

// 导出供测试使用的函数
module.exports = {
  loadConfig,
  generateHTML,
  copyStaticFiles,
  generateNavigation,
  generateCategories,
  loadHandlebarsTemplates,
  renderTemplate,
  generateAllPagesHTML
};
