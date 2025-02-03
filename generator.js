const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// 读取配置文件
function loadConfig() {
    let config = {};
    
    // 读取默认配置
    try {
        const defaultConfigFile = fs.readFileSync('config.yml', 'utf8');
        config = yaml.load(defaultConfigFile);
    } catch (e) {
        console.error('Error loading default config file:', e);
        process.exit(1);
    }
    
    // 尝试读取用户配置并合并
    try {
        if (fs.existsSync('config.user.yml')) {
            const userConfigFile = fs.readFileSync('config.user.yml', 'utf8');
            const userConfig = yaml.load(userConfigFile);
            // 深度合并配置,用户配置优先
            config = mergeConfigs(config, userConfig);
            console.log('Using user configuration from config.user.yml');
        } else {
            console.log('No user configuration found, using default config.yml');
        }
    } catch (e) {
        console.error('Error loading user config file:', e);
        console.log('Falling back to default configuration');
    }
    
    return config;
}

// 深度合并配置对象
function mergeConfigs(defaultConfig, userConfig) {
    if (!userConfig) return defaultConfig;
    
    const merged = { ...defaultConfig };
    
    for (const key in userConfig) {
        if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
            merged[key] = mergeConfigs(defaultConfig[key] || {}, userConfig[key]);
        } else {
            merged[key] = userConfig[key];
        }
    }
    
    return merged;
}

// 生成导航菜单
function generateNavigation(navigation) {
    return navigation.map(nav => `
                <a href="#" class="nav-item${nav.active ? ' active' : ''}" data-page="${nav.id}">
                    <div class="icon-container">
                        <i class="${nav.icon}"></i>
                    </div>
                    <span class="nav-text">${nav.name}</span>
                </a>`).join('\n');
}

// 生成网站卡片HTML
function generateSiteCards(sites) {
    return sites.map(site => `
                        <a href="${site.url}" class="site-card">
                            <i class="${site.icon}"></i>
                            <h3>${site.name}</h3>
                            <p>${site.description}</p>
                        </a>`).join('\n');
}

// 生成分类HTML
function generateCategories(categories) {
    return categories.map(category => `
                <section class="category">
                    <h2><i class="${category.icon}"></i> ${category.name}</h2>
                    <div class="sites-grid">
                        ${generateSiteCards(category.sites)}
                    </div>
                </section>`).join('\n');
}

// 生成社交链接HTML
function generateSocialLinks(social) {
    return social.map(link => `
                <a href="${link.url}" class="nav-item" target="_blank">
                    <div class="icon-container">
                        <i class="${link.icon}"></i>
                    </div>
                    <span class="nav-text">${link.name}</span>
                    <i class="fas fa-external-link-alt external-icon"></i>
                </a>`).join('\n');
}

// 生成页面内容
function generatePageContent(pageId, data) {
    return `
                <div class="welcome-section">
                    <h2>${data.title}</h2>
                    <p class="subtitle">${data.subtitle}</p>
                </div>
                ${generateCategories(data.categories)}`;
}

// 生成搜索结果页面
function generateSearchResultsPage() {
    return `
            <!-- 搜索结果页 -->
            <div class="page" id="search-results">
                <div class="welcome-section">
                    <h2>搜索结果</h2>
                    <p class="subtitle">在所有页面中找到的匹配项</p>
                </div>

                <section class="category search-section" data-section="home" style="display: none;">
                    <h2><i class="fas fa-home"></i> 首页匹配项</h2>
                    <div class="sites-grid"></div>
                </section>

                <section class="category search-section" data-section="projects" style="display: none;">
                    <h2><i class="fas fa-project-diagram"></i> 项目匹配项</h2>
                    <div class="sites-grid"></div>
                </section>

                <section class="category search-section" data-section="articles" style="display: none;">
                    <h2><i class="fas fa-book"></i> 文章匹配项</h2>
                    <div class="sites-grid"></div>
                </section>

                <section class="category search-section" data-section="friends" style="display: none;">
                    <h2><i class="fas fa-users"></i> 朋友匹配项</h2>
                    <div class="sites-grid"></div>
                </section>
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
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.site.title}</title>
    <link rel="icon" href="./favicon.ico" type="image/x-icon">
    <link rel="shortcut icon" href="./favicon.ico" type="image/x-icon">
    ${googleFontsLink}
    <style>
    ${fontVariables}
    </style>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body class="loading">
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
                <h1>导航站</h1>
            </div>
            
            <div class="nav-section">
${generateNavigation(config.navigation)}
            </div>

            <div class="nav-section">
                <div class="section-title">
                    <i class="fas fa-link"></i>
                </div>
${generateSocialLinks(config.social)}
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

            <!-- 首页 -->
            <div class="page active" id="home">
                <div class="welcome-section">
                    <h2>${config.profile.title}</h2>
                    <h3>${config.profile.subtitle}</h3>
                    <p class="subtitle">${config.profile.description}</p>
                </div>
${generateCategories(config.categories)}
            </div>

            <!-- 项目页 -->
            <div class="page" id="projects">
${generatePageContent('projects', config.projects)}
            </div>

            <!-- 文章页 -->
            <div class="page" id="articles">
${generatePageContent('articles', config.articles)}
            </div>

            <!-- 朋友页 -->
            <div class="page" id="friends">
${generatePageContent('friends', config.friends)}
            </div>
${generateSearchResultsPage()}
        </main>
    </div>
    <script src="script.js"></script>
</body>
</html>`;
}

// 复制静态文件
function copyStaticFiles(config) {
    // 如果配置了favicon，确保文件存在并复制
    if (config.site.favicon) {
        try {
            if (fs.existsSync(config.site.favicon)) {
                fs.copyFileSync(config.site.favicon, path.basename(config.site.favicon));
                console.log(`Copied favicon: ${config.site.favicon}`);
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
    const html = generateHTML(config);
    
    try {
        // 生成HTML
        fs.writeFileSync('index.html', html);
        console.log('Successfully generated index.html');
        
        // 复制静态文件
        copyStaticFiles(config);
    } catch (e) {
        console.error('Error in main function:', e);
        process.exit(1);
    }
}

main(); 