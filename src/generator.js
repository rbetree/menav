const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

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
 * 加载单个配置文件
 * @param {string} filePath 配置文件路径
 * @returns {Object|null} 配置对象，如果文件不存在或加载失败则返回null
 */
function loadSingleConfig(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const fileConfig = yaml.load(fileContent);
            console.log(`Loaded configuration from ${filePath}`);
            return fileConfig;
        } catch (e) {
            console.error(`Error loading configuration from ${filePath}:`, e);
            return null;
        }
    }
    return null;
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
    if (fs.existsSync(siteConfigPath)) {
        try {
            const fileContent = fs.readFileSync(siteConfigPath, 'utf8');
            const siteConfig = yaml.load(fileContent);
            
            // 将site.yml中的内容分配到正确的配置字段
            config.site = siteConfig;
            
            // 提取特殊字段到顶层配置
            if (siteConfig.fonts) config.fonts = siteConfig.fonts;
            if (siteConfig.profile) config.profile = siteConfig.profile;
            if (siteConfig.social) config.social = siteConfig.social;
            
            console.log(`Loaded site configuration from ${siteConfigPath}`);
        } catch (e) {
            console.error(`Error loading site configuration from ${siteConfigPath}:`, e);
        }
    }

    const navConfigPath = path.join(dirPath, 'navigation.yml');
    if (fs.existsSync(navConfigPath)) {
        try {
            const fileContent = fs.readFileSync(navConfigPath, 'utf8');
            config.navigation = yaml.load(fileContent);
            console.log(`Loaded navigation configuration from ${navConfigPath}`);
        } catch (e) {
            console.error(`Error loading navigation configuration from ${navConfigPath}:`, e);
        }
    }

    // 加载页面配置
    const pagesPath = path.join(dirPath, 'pages');
    if (fs.existsSync(pagesPath)) {
        const files = fs.readdirSync(pagesPath).filter(file => 
            file.endsWith('.yml') || file.endsWith('.yaml'));
        
        files.forEach(file => {
            try {
                const filePath = path.join(pagesPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const fileConfig = yaml.load(fileContent);
                
                // 提取文件名（不含扩展名）作为配置键
                const configKey = path.basename(file, path.extname(file));
                
                // 特殊处理home.yml中的categories字段
                if (configKey === 'home' && fileConfig.categories) {
                    config.categories = fileConfig.categories;
                }
                
                // 将页面配置添加到主配置对象
                config[configKey] = fileConfig;
                
                console.log(`Loaded page configuration from ${filePath}`);
            } catch (e) {
                console.error(`Error loading page configuration from ${path.join(pagesPath, file)}:`, e);
            }
        });
    }

    return config;
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
        // 1. 最高优先级: config/user/ 目录
        console.log('Using modular user configuration from config/user/ (highest priority)');
        config = loadModularConfig('config/user');
    } else if (hasDefaultModularConfig) {
        // 2. 其次优先级: config/_default/ 目录
        console.log('Using modular default configuration from config/_default/');
        
        // 从模块化默认配置加载
        config = loadModularConfig('config/_default');
        
        // 检查并加载home.yml中的categories（如果loadModularConfig未正确处理）
        const homePath = path.join('config', '_default', 'pages', 'home.yml');
        if (fs.existsSync(homePath) && (!config.categories || config.categories.length === 0)) {
            try {
                const homeContent = fs.readFileSync(homePath, 'utf8');
                const homeConfig = yaml.load(homeContent);
                
                if (homeConfig && homeConfig.categories) {
                    // 直接设置categories
                    config.categories = homeConfig.categories;
                    
                    // 确保home配置也正确设置
                    if (!config.home) {
                        config.home = homeConfig;
                    }
                }
            } catch (e) {
                console.error(`Error loading home.yml: ${e.message}`);
            }
        }
    } else {
        console.log('No configuration found, using default empty config');
    }
    
    // 确保配置具有必要的结构
    config.site = config.site || {};
    config.navigation = config.navigation || [];
    config.fonts = config.fonts || {};
    config.profile = config.profile || {};
    config.social = config.social || [];
    config.categories = config.categories || [];
    
    // 处理书签文件
    try {
        let bookmarksConfig = null;
        let bookmarksSource = null;
        
        // 按照优先级顺序处理书签配置
        // 1. 模块化用户书签配置 (最高优先级)
        if (fs.existsSync('config/user/pages/bookmarks.yml')) {
            const userBookmarksFile = fs.readFileSync('config/user/pages/bookmarks.yml', 'utf8');
            bookmarksConfig = yaml.load(userBookmarksFile);
            bookmarksSource = 'config/user/pages/bookmarks.yml';
        }
        // 2. 模块化默认书签配置
        else if (fs.existsSync('config/_default/pages/bookmarks.yml')) {
            const defaultBookmarksFile = fs.readFileSync('config/_default/pages/bookmarks.yml', 'utf8');
            bookmarksConfig = yaml.load(defaultBookmarksFile);
            bookmarksSource = 'config/_default/pages/bookmarks.yml';
        }
        
        // 添加书签页面配置
        if (bookmarksConfig) {
            config.bookmarks = bookmarksConfig;
            console.log(`Using bookmarks configuration from ${bookmarksSource}`);
        }
    } catch (e) {
        console.error('Error loading bookmarks configuration:', e);
    }
    
    return config;
}

// 生成导航菜单
function generateNavigation(navigation, config) {
    return navigation.map(nav => {
        // 根据页面ID获取对应的子菜单项（分类）
        let submenuItems = '';

        // 首页页面添加子菜单（分类）
        if (nav.id === 'home' && Array.isArray(config.categories)) {
            submenuItems = `
                <div class="submenu">
                    ${config.categories.map(category => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `).join('')}
                </div>`;
        }
        // 书签页面添加子菜单（分类）
        else if (nav.id === 'bookmarks' && config.bookmarks && Array.isArray(config.bookmarks.categories)) {
            submenuItems = `
                <div class="submenu">
                    ${config.bookmarks.categories.map(category => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `).join('')}
                </div>`;
        }
        // 项目页面添加子菜单
        else if (nav.id === 'projects' && config.projects && Array.isArray(config.projects.categories)) {
            submenuItems = `
                <div class="submenu">
                    ${config.projects.categories.map(category => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `).join('')}
                </div>`;
        }
        // 文章页面添加子菜单
        else if (nav.id === 'articles' && config.articles && Array.isArray(config.articles.categories)) {
            submenuItems = `
                <div class="submenu">
                    ${config.articles.categories.map(category => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `).join('')}
                </div>`;
        }
        // 友链页面添加子菜单
        else if (nav.id === 'friends' && config.friends && Array.isArray(config.friends.categories)) {
            submenuItems = `
                <div class="submenu">
                    ${config.friends.categories.map(category => `
                        <a href="#${category.name}" class="submenu-item" data-page="${nav.id}" data-category="${category.name}">
                            <i class="${escapeHtml(category.icon)}"></i>
                            <span>${escapeHtml(category.name)}</span>
                        </a>
                    `).join('')}
                </div>`;
        }
        // 通用处理：任意自定义页面的子菜单生成
        else if (config[nav.id] && config[nav.id].categories && Array.isArray(config[nav.id].categories)) {
            submenuItems = `
                <div class="submenu">
                    ${config[nav.id].categories.map(category => `
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
    
    return social.map(link => `
                <a href="${escapeHtml(link.url)}" class="nav-item" target="_blank">
                    <div class="icon-container">
                        <i class="${escapeHtml(link.icon || 'fas fa-link')}"></i>
                    </div>
                    <span class="nav-text">${escapeHtml(link.name || '社交链接')}</span>
                    <i class="fas fa-external-link-alt external-icon"></i>
                </a>`).join('\n');
}

// 生成欢迎区域和首页内容
function generateHomeContent(config) {
    const profile = config.profile || {};
    
    return `
                <div class="welcome-section">
                    <h2>${escapeHtml(profile.title || '欢迎使用')}</h2>
                    <h3>${escapeHtml(profile.subtitle || '个人导航站')}</h3>
                    <p class="subtitle">${escapeHtml(profile.description || '快速访问您的常用网站')}</p>
                </div>
${generateCategories(config.categories)}`;
}

// 生成页面内容
function generatePageContent(pageId, data) {
    // 确保数据对象存在且有必要的字段
    if (!data) {
        console.error(`Missing data for page: ${pageId}`);
        return `
                <div class="welcome-section">
                    <h2>页面未配置</h2>
                    <p class="subtitle">请配置 ${pageId} 页面</p>
                </div>`;
    }
    
    // 设置默认值
    const title = data.title || `${pageId} 页面`;
    const subtitle = data.subtitle || '';
    const categories = data.categories || [];
    
    // 如果是书签页面，使用bookmarks配置
    if (pageId === 'bookmarks') {
        return `
                <div class="welcome-section">
                    <h2>${escapeHtml(title)}</h2>
                    <p class="subtitle">${escapeHtml(subtitle)}</p>
                </div>
                ${generateCategories(categories)}`;
    }
    
    return `
                <div class="welcome-section">
                    <h2>${escapeHtml(title)}</h2>
                    <p class="subtitle">${escapeHtml(subtitle)}</p>
                </div>
                ${generateCategories(categories)}`;
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

// 生成完整的HTML
function generateHTML(config) {
    const googleFontsLink = generateGoogleFontsLink(config);
    const fontVariables = generateFontVariables(config);
    const currentYear = new Date().getFullYear();
    
    // 处理所有页面内容
    const pageContents = {};
    
    // 首页内容
    pageContents.home = generateHomeContent(config);
    
    // 动态生成所有其他页面的内容
    if (config.navigation && Array.isArray(config.navigation)) {
        config.navigation.forEach(navItem => {
            const pageId = navItem.id;
            // 跳过已处理的首页和搜索结果页
            if (pageId === 'home' || pageId === 'search-results') {
                return;
            }
            
            // 如果配置中存在该页面的配置，则生成页面内容
            if (config[pageId]) {
                pageContents[pageId] = generatePageContent(pageId, config[pageId]);
            }
        });
    }
    
    // 生成首页HTML
    const homeHTML = `
            <!-- home页 -->
            <div class="page active" id="home">
${pageContents.home}
            </div>`;
    
    // 生成其他页面的HTML
    const dynamicPagesHTML = Object.entries(pageContents)
        .filter(([id]) => id !== 'home') // 排除首页
        .map(([id, content]) => `
            <!-- ${id}页 -->
            <div class="page" id="${id}">
${content}
            </div>`)
        .join('\n');
    
    // 生成搜索结果页面
    const searchResultsHTML = generateSearchResultsPage(config);
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(config.site.title)}</title>
    <link rel="icon" href="./favicon.ico" type="image/x-icon">
    <link rel="shortcut icon" href="./favicon.ico" type="image/x-icon">
    ${googleFontsLink}
    <style>
    ${fontVariables}
    </style>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body class="loaded">
    <div class="layout">
        <!-- 移动端按钮 -->
        <div class="mobile-buttons">
            <button class="menu-toggle" aria-label="切换菜单">
                <i class="fas fa-bars"></i>
            </button>
            <button class="search-toggle" aria-label="切换搜索">
                <i class="fas fa-search"></i>
            </button>
        </div>

        <!-- 遮罩层 -->
        <div class="overlay"></div>

        <!-- 左侧导航 -->
        <nav class="sidebar">
            <div class="logo">
                <h1>${escapeHtml(config.site.logo_text || '导航站')}</h1>
            </div>
            
            <div class="sidebar-content">
                <div class="nav-section">
${generateNavigation(config.navigation, config)}
                </div>

                <div class="nav-section">
                    <div class="section-title">
                        <i class="fas fa-link"></i>
                    </div>
${generateSocialLinks(config.social)}
                </div>
            </div>

            <div class="copyright">
                <p>© ${currentYear} <a href="https://github.com/rbetree/menav" target="_blank">MeNav</a></p>
                <p>by <a href="https://github.com/rbetree" target="_blank">rbetree</a></p>
            </div>
        </nav>

        <!-- 右侧内容区 -->
        <main class="content">
            <!-- 搜索框容器 -->
            <div class="search-container">
                <div class="search-box">
                    <input type="text" id="search" placeholder="搜索...">
                    <i class="fas fa-search"></i>
                </div>
            </div>

${homeHTML}
${dynamicPagesHTML}
            
            <!-- 搜索结果页 -->
            <div class="page" id="search-results">
${searchResultsHTML}
            </div>
        </main>
        
        <!-- 主题切换按钮 -->
        <button class="theme-toggle" aria-label="切换主题">
            <i class="fas fa-moon"></i>
        </button>
    </div>
    <script src="script.js"></script>
</body>
</html>`;
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
        console.log('Copied style.css to dist/');
    } catch (e) {
        console.error('Error copying style.css:', e);
    }
    
    // 复制JavaScript文件
    try {
        fs.copyFileSync('src/script.js', 'dist/script.js');
        console.log('Copied script.js to dist/');
    } catch (e) {
        console.error('Error copying script.js:', e);
    }
    
    // 如果配置了favicon，确保文件存在并复制
    if (config.site.favicon) {
        try {
            if (fs.existsSync(`assets/${config.site.favicon}`)) {
                fs.copyFileSync(`assets/${config.site.favicon}`, `dist/${path.basename(config.site.favicon)}`);
                console.log(`Copied favicon: ${config.site.favicon} to dist/`);
            } else if (fs.existsSync(config.site.favicon)) {
                fs.copyFileSync(config.site.favicon, `dist/${path.basename(config.site.favicon)}`);
                console.log(`Copied favicon: ${config.site.favicon} to dist/`);
            } else {
                console.warn(`Warning: Favicon file not found: ${config.site.favicon}`);
            }
        } catch (e) {
            console.error('Error copying favicon:', e);
        }
    }
}

// 处理模板文件，替换占位符
function processTemplate(template, config) {
    const currentYear = new Date().getFullYear();
    const googleFontsLink = generateGoogleFontsLink(config);
    const fontVariables = generateFontVariables(config);
    
    // 生成所有页面的HTML
    let allPagesHTML = '';
    
    // 确保按照导航顺序生成页面
    if (config.navigation && Array.isArray(config.navigation)) {
        // 按照导航中的顺序生成页面
        config.navigation.forEach(navItem => {
            const pageId = navItem.id;
            
            // 跳过搜索结果页
            if (pageId === 'search-results') {
                return;
            }
            
            let pageContent = '';
            let isActive = pageId === 'home' ? ' active' : '';
            
            // 根据页面ID生成对应内容
            if (pageId === 'home') {
                pageContent = generateHomeContent(config);
            } else if (config[pageId]) {
                pageContent = generatePageContent(pageId, config[pageId]);
            } else {
                pageContent = `<div class="welcome-section">
                    <h2>页面未配置</h2>
                    <p class="subtitle">请配置 ${pageId} 页面</p>
                </div>`;
            }
            
            // 添加页面HTML
            allPagesHTML += `
            <!-- ${pageId}页 -->
            <div class="page${isActive}" id="${pageId}">
${pageContent}
            </div>`;
        });
    }
    
    // 创建替换映射
    const replacements = {
        '{{SITE_TITLE}}': escapeHtml(config.site.title),
        '{{SITE_LOGO_TEXT}}': escapeHtml(config.site.logo_text || '导航站'),
        '{{GOOGLE_FONTS}}': googleFontsLink,
        '{{{FONT_VARIABLES}}}': fontVariables,
        '{{NAVIGATION}}': generateNavigation(config.navigation, config),
        '{{SOCIAL_LINKS}}': generateSocialLinks(config.social),
        '{{CURRENT_YEAR}}': currentYear,
        '{{SEARCH_RESULTS}}': generateSearchResultsPage(config),
        '{{ALL_PAGES}}': allPagesHTML
    };
    
    // 执行替换
    let processedTemplate = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
        // 使用正则表达式进行全局替换
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        processedTemplate = processedTemplate.replace(regex, value || '');
    }
    
    return processedTemplate;
}

// 调试函数
function debugConfig(config) {
    console.log('==== DEBUG INFO ====');
    console.log('Navigation items:', config.navigation.map(nav => nav.id));
    console.log('Has bookmarks config:', !!config.bookmarks);
    if (config.bookmarks) {
        console.log('Bookmarks title:', config.bookmarks.title);
        console.log('Bookmarks categories:', config.bookmarks.categories.length);
    }
    console.log('==================');
}

// 主函数
function main() {
    const config = loadConfig();
    
    // 输出调试信息
    debugConfig(config);
    
    try {
        // 确保dist目录存在
        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist', { recursive: true });
        }
        
        // 读取模板文件
        const templatePath = 'templates/index.html';
        let htmlContent = '';
        
        if (fs.existsSync(templatePath)) {
            // 读取模板并处理
            const template = fs.readFileSync(templatePath, 'utf8');
            htmlContent = processTemplate(template, config);
            console.log(`Using template from ${templatePath} and injecting content`);
        } else {
            // 如果没有模板文件，使用生成的HTML
            htmlContent = generateHTML(config);
            console.log('No template file found, using generated HTML');
        }
        
        // 生成HTML
        fs.writeFileSync('dist/index.html', htmlContent);
        console.log('Successfully generated dist/index.html');
        
        // 复制静态文件
        copyStaticFiles(config);
    } catch (e) {
        console.error('Error in main function:', e);
        process.exit(1);
    }
}

main(); 

// 导出供测试使用的函数
module.exports = {
  loadConfig,
  generateHTML,
  copyStaticFiles,
  generateNavigation,
  generateCategories
};
