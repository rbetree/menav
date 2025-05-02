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
 * 从文件合并配置到主配置对象
 * @param {Object} config 主配置对象
 * @param {string} filePath 配置文件路径
 */
function mergeConfigFromFile(config, filePath) {
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const fileConfig = yaml.load(fileContent);
            
            // 提取文件名（不含扩展名）作为配置键
            const configKey = path.basename(filePath, path.extname(filePath));
            
            // 如果是site或navigation文件，直接合并到主配置
            if (configKey === 'site' || configKey === 'navigation') {
                if (!config[configKey]) config[configKey] = {};
                deepMerge(config[configKey], fileConfig);
            } else {
                // 其他配置直接合并到根级别
                deepMerge(config, fileConfig);
            }
            
            console.log(`Loaded and merged configuration from ${filePath}`);
        } catch (e) {
            console.error(`Error loading configuration from ${filePath}:`, e);
        }
    }
}

/**
 * 加载页面配置目录中的所有配置文件
 * @param {Object} config 主配置对象
 * @param {string} dirPath 页面配置目录路径
 */
function loadPageConfigs(config, dirPath) {
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(file => 
            file.endsWith('.yml') || file.endsWith('.yaml'));
        
        files.forEach(file => {
            try {
                const filePath = path.join(dirPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const fileConfig = yaml.load(fileContent);
                
                // 提取文件名（不含扩展名）作为配置键
                const configKey = path.basename(file, path.extname(file));
                
                // 将页面配置添加到主配置对象
                config[configKey] = fileConfig;
                
                console.log(`Loaded page configuration from ${filePath}`);
            } catch (e) {
                console.error(`Error loading page configuration from ${path.join(dirPath, file)}:`, e);
            }
        });
    }
}

/**
 * 深度合并两个对象
 * @param {Object} target 目标对象
 * @param {Object} source 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
    if (!source) return target;
    
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (typeof source[key] === 'object' && source[key] !== null) {
                // 确保目标对象有这个属性
                if (!target[key]) {
                    if (Array.isArray(source[key])) {
                        target[key] = [];
                    } else {
                        target[key] = {};
                    }
                }
                
                // 递归合并
                if (Array.isArray(source[key])) {
                    // 对于数组，直接替换或添加
                    target[key] = source[key];
                } else {
                    // 对于对象，递归合并
                    deepMerge(target[key], source[key]);
                }
            } else {
                // 对于基本类型，直接替换
                target[key] = source[key];
            }
        }
    }
    
    return target;
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
    
    // 处理配置目录结构，按照优先级从低到高加载
    // 4. 最低优先级: config.yml (传统默认配置)
    if (fs.existsSync('config.yml')) {
        const defaultConfigFile = fs.readFileSync('config.yml', 'utf8');
        const defaultConfig = yaml.load(defaultConfigFile);
        deepMerge(config, defaultConfig);
        console.log('Loaded legacy default config.yml');
    }
    
    // 3. 其次优先级: config/_default/ 目录
    if (fs.existsSync('config/_default')) {
        console.log('Loading modular default configuration from config/_default/');
        
        // 加载基础配置
        mergeConfigFromFile(config, 'config/_default/site.yml');
        mergeConfigFromFile(config, 'config/_default/navigation.yml');
        
        // 加载页面配置
        if (fs.existsSync('config/_default/pages')) {
            loadPageConfigs(config, 'config/_default/pages');
        }
    }
    
    // 2. 次高优先级: config.user.yml (传统用户配置)
    if (fs.existsSync('config.user.yml')) {
        const userConfigFile = fs.readFileSync('config.user.yml', 'utf8');
        const userConfig = yaml.load(userConfigFile);
        
        // 深度合并配置
        deepMerge(config, userConfig);
        console.log('Merged legacy user configuration from config.user.yml');
    }
    
    // 1. 最高优先级: config/user/ 目录
    if (fs.existsSync('config/user')) {
        console.log('Loading modular user configuration from config/user/ (highest priority)');
        
        // 覆盖基础配置
        mergeConfigFromFile(config, 'config/user/site.yml');
        mergeConfigFromFile(config, 'config/user/navigation.yml');
        
        // 覆盖页面配置
        if (fs.existsSync('config/user/pages')) {
            loadPageConfigs(config, 'config/user/pages');
        }
    }
    
    // 处理书签文件（保持现有功能）
    try {
        let bookmarksConfig = null;
        let bookmarksSource = null;
        
        // 按照相同的优先级顺序处理书签配置
        // 1. 模块化用户书签配置 (最高优先级)
        if (fs.existsSync('config/user/pages/bookmarks.yml')) {
            const userBookmarksFile = fs.readFileSync('config/user/pages/bookmarks.yml', 'utf8');
            bookmarksConfig = yaml.load(userBookmarksFile);
            bookmarksSource = 'config/user/pages/bookmarks.yml';
        }
        // 2. 传统用户书签配置
        else if (fs.existsSync('bookmarks.user.yml')) {
            const userBookmarksFile = fs.readFileSync('bookmarks.user.yml', 'utf8');
            bookmarksConfig = yaml.load(userBookmarksFile);
            bookmarksSource = 'bookmarks.user.yml';
        }
        // 3. 模块化默认书签配置
        else if (fs.existsSync('config/_default/pages/bookmarks.yml')) {
            const defaultBookmarksFile = fs.readFileSync('config/_default/pages/bookmarks.yml', 'utf8');
            bookmarksConfig = yaml.load(defaultBookmarksFile);
            bookmarksSource = 'config/_default/pages/bookmarks.yml';
        }
        // 4. 传统默认书签配置 (最低优先级)
        else if (fs.existsSync('bookmarks.yml')) {
            const bookmarksFile = fs.readFileSync('bookmarks.yml', 'utf8');
            bookmarksConfig = yaml.load(bookmarksFile);
            bookmarksSource = 'bookmarks.yml';
        }
        
        // 添加书签页面配置
        if (bookmarksConfig) {
            config.bookmarks = bookmarksConfig;
            console.log(`Using bookmarks configuration from ${bookmarksSource}`);
            
            // 确保导航中有书签页面
            const hasBookmarksNav = config.navigation.some(nav => nav.id === 'bookmarks');
            if (!hasBookmarksNav) {
                config.navigation.push({
                    name: '书签',
                    icon: 'fas fa-bookmark',
                    id: 'bookmarks',
                    active: false
                });
            }
        }
    } catch (e) {
        console.error('Error loading bookmarks configuration:', e);
    }
    
    return config;
}

// 生成导航菜单
function generateNavigation(navigation) {
    return navigation.map(nav => `
                <a href="#" class="nav-item${nav.active ? ' active' : ''}" data-page="${escapeHtml(nav.id)}">
                    <div class="icon-container">
                        <i class="${escapeHtml(nav.icon)}"></i>
                    </div>
                    <span class="nav-text">${escapeHtml(nav.name)}</span>
                </a>`).join('\n');
}

// 生成网站卡片HTML
function generateSiteCards(sites) {
    return sites.map(site => `
                        <a href="${escapeHtml(site.url)}" class="site-card" title="${escapeHtml(site.name)} - ${escapeHtml(site.description)}">
                            <i class="${escapeHtml(site.icon)}"></i>
                            <h3>${escapeHtml(site.name)}</h3>
                            <p>${escapeHtml(site.description)}</p>
                        </a>`).join('\n');
}

// 生成分类HTML
function generateCategories(categories) {
    return categories.map(category => `
                <section class="category">
                    <h2><i class="${escapeHtml(category.icon)}"></i> ${escapeHtml(category.name)}</h2>
                    <div class="sites-grid">
                        ${generateSiteCards(category.sites)}
                    </div>
                </section>`).join('\n');
}

// 生成社交链接HTML
function generateSocialLinks(social) {
    return social.map(link => `
                <a href="${escapeHtml(link.url)}" class="nav-item" target="_blank">
                    <div class="icon-container">
                        <i class="${escapeHtml(link.icon)}"></i>
                    </div>
                    <span class="nav-text">${escapeHtml(link.name)}</span>
                    <i class="fas fa-external-link-alt external-icon"></i>
                </a>`).join('\n');
}

// 生成欢迎区域和首页内容
function generateHomeContent(config) {
    return `
                <div class="welcome-section">
                    <h2>${escapeHtml(config.profile.title)}</h2>
                    <h3>${escapeHtml(config.profile.subtitle)}</h3>
                    <p class="subtitle">${escapeHtml(config.profile.description)}</p>
                </div>
${generateCategories(config.categories)}`;
}

// 生成页面内容
function generatePageContent(pageId, data) {
    // 如果是book、marks页面，使用bookmarks配置
    if (pageId === 'bookmarks' && data) {
        return `
                <div class="welcome-section">
                    <h2>${escapeHtml(data.title)}</h2>
                    <p class="subtitle">${escapeHtml(data.subtitle)}</p>
                </div>
                ${generateCategories(data.categories)}`;
    }
    
    return `
                <div class="welcome-section">
                    <h2>${escapeHtml(data.title)}</h2>
                    <p class="subtitle">${escapeHtml(data.subtitle)}</p>
                </div>
                ${generateCategories(data.categories)}`;
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
    
    // 如果配置了项目页面
    if (config.projects) {
        pageContents.projects = generatePageContent('projects', config.projects);
    }
    
    // 如果配置了文章页面
    if (config.articles) {
        pageContents.articles = generatePageContent('articles', config.articles);
    }
    
    // 如果配置了友链页面
    if (config.friends) {
        pageContents.friends = generatePageContent('friends', config.friends);
    }
    
    // 如果配置了书签页面
    if (config.bookmarks) {
        pageContents.bookmarks = generatePageContent('bookmarks', config.bookmarks);
    }
    
    // 生成所有页面的HTML
    const pagesHTML = Object.entries(pageContents).map(([id, content]) => `
            <!-- ${id}页 -->
            <div class="page${id === 'home' ? ' active' : ''}" id="${id}">
${content}
            </div>`).join('\n');
    
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
${generateNavigation(config.navigation)}
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

${pagesHTML}
            
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
    
    // 创建替换映射
    const replacements = {
        '{{SITE_TITLE}}': escapeHtml(config.site.title),
        '{{SITE_LOGO_TEXT}}': escapeHtml(config.site.logo_text || '导航站'), // 从配置中获取，如果不存在则使用默认值
        '{{GOOGLE_FONTS}}': googleFontsLink,
        '{{{FONT_VARIABLES}}}': fontVariables,
        '{{NAVIGATION}}': generateNavigation(config.navigation),
        '{{SOCIAL_LINKS}}': generateSocialLinks(config.social),
        '{{CURRENT_YEAR}}': currentYear,
        '{{HOME_CONTENT}}': generateHomeContent(config),
        '{{PROJECTS_CONTENT}}': generatePageContent('projects', config.projects),
        '{{ARTICLES_CONTENT}}': generatePageContent('articles', config.articles),
        '{{FRIENDS_CONTENT}}': generatePageContent('friends', config.friends),
        '{{BOOKMARKS_CONTENT}}': generatePageContent('bookmarks', config.bookmarks),
        '{{SEARCH_RESULTS}}': generateSearchResultsPage(config)
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