// 全局MeNav对象 - 用于浏览器扩展
window.MeNav = {
    version: "1.0.0",

    // 获取配置数据
    getConfig: function() {
        const configData = document.getElementById('menav-config-data');
        return configData ? JSON.parse(configData.textContent) : null;
    },

    // 获取元素的唯一标识符
    _getElementId: function(element) {
        const type = element.getAttribute('data-type');
        if (type === 'nav-item') {
            return element.getAttribute('data-id');
        } else if (type === 'social-link') {
            return element.getAttribute('data-url');
        } else {
            return element.getAttribute('data-name');
        }
    },

    // 根据类型和ID查找元素
    _findElement: function(type, id) {
        let selector;
        if (type === 'nav-item') {
            selector = `[data-type="${type}"][data-id="${id}"]`;
        } else if (type === 'social-link') {
            selector = `[data-type="${type}"][data-url="${id}"]`;
        } else {
            selector = `[data-type="${type}"][data-name="${id}"]`;
        }
        return document.querySelector(selector);
    },

    // 更新DOM元素
    updateElement: function(type, id, newData) {
        const element = this._findElement(type, id);
        if (!element) return false;

        if (type === 'site') {
            // 更新站点卡片
            if (newData.url) {
                element.href = newData.url;
                element.setAttribute('data-url', newData.url);
            }
            if (newData.name) {
                element.querySelector('h3').textContent = newData.name;
                element.setAttribute('data-name', newData.name);
            }
            if (newData.description) {
                element.querySelector('p').textContent = newData.description;
                element.setAttribute('data-description', newData.description);
            }
            if (newData.icon) {
                // 优先更新站点卡片中的回退图标（favicon模式下存在）
                const iconElement = element.querySelector('i.icon-fallback') || element.querySelector('i');
                if (iconElement) {
                    iconElement.className = newData.icon;
                }
                element.setAttribute('data-icon', newData.icon);
            }
            if (newData.title) element.title = newData.title;

            // 触发元素更新事件
            this.events.emit('elementUpdated', {
                id: id,
                type: 'site',
                data: newData
            });

            return true;
        } else if (type === 'category') {
            // 更新分类
            if (newData.name) {
                const titleElement = element.querySelector('h2');
                if (titleElement) {
                    // 保留图标
                    const iconElement = titleElement.querySelector('i');
                    const iconClass = iconElement ? iconElement.className : '';
                    titleElement.innerHTML = `<i class="${newData.icon || iconClass}"></i> ${newData.name}`;
                }
                element.setAttribute('data-name', newData.name);
            }
            if (newData.icon) {
                element.setAttribute('data-icon', newData.icon);
            }

            // 触发元素更新事件
            this.events.emit('elementUpdated', {
                id: id,
                type: 'category',
                data: newData
            });

            return true;
        } else if (type === 'nav-item') {
            // 更新导航项
            if (newData.name) {
                const textElement = element.querySelector('.nav-text');
                if (textElement) {
                    textElement.textContent = newData.name;
                }
                element.setAttribute('data-name', newData.name);
            }
            if (newData.icon) {
                const iconElement = element.querySelector('i');
                if (iconElement) {
                    iconElement.className = newData.icon;
                }
                element.setAttribute('data-icon', newData.icon);
            }

            // 触发元素更新事件
            this.events.emit('elementUpdated', {
                id: id,
                type: 'nav-item',
                data: newData
            });

            return true;
        } else if (type === 'social-link') {
            // 更新社交链接
            if (newData.url) {
                element.href = newData.url;
                element.setAttribute('data-url', newData.url);
            }
            if (newData.name) {
                const textElement = element.querySelector('.nav-text');
                if (textElement) {
                    textElement.textContent = newData.name;
                }
                element.setAttribute('data-name', newData.name);
            }
            if (newData.icon) {
                const iconElement = element.querySelector('i');
                if (iconElement) {
                    iconElement.className = newData.icon;
                }
                element.setAttribute('data-icon', newData.icon);
            }

            // 触发元素更新事件
            this.events.emit('elementUpdated', {
                id: id,
                type: 'social-link',
                data: newData
            });

            return true;
        }

        return false;
    },

    // 添加新元素
    addElement: function(type, parentId, data) {
        let parent;
        
        if (type === 'site') {
            // 查找父级分类
            parent = document.querySelector(`[data-type="category"][data-name="${parentId}"]`);
            if (!parent) return null;

            // 添加站点卡片到分类
            const sitesGrid = parent.querySelector('[data-container="sites"]');
            if (!sitesGrid) return null;

            // 创建新的站点卡片
            const newSite = document.createElement('a');
            newSite.className = 'site-card';
            newSite.href = data.url || '#';
            newSite.title = data.name + (data.description ? ' - ' + data.description : '');
            
            // 设置数据属性
            newSite.setAttribute('data-type', 'site');
            newSite.setAttribute('data-name', data.name || '未命名站点');
            newSite.setAttribute('data-url', data.url || '');
            newSite.setAttribute('data-icon', data.icon || 'fas fa-link');
            newSite.setAttribute('data-description', data.description || '');

            // 添加内容（根据图标模式渲染）
            try {
                const cfg = window.MeNav && typeof window.MeNav.getConfig === 'function' ? window.MeNav.getConfig() : null;
                const iconsMode = (cfg && (cfg.data?.icons?.mode || cfg.icons?.mode)) || 'favicon';
                if (iconsMode === 'favicon' && data.url && /^https?:\/\//i.test(data.url)) {
                    const faviconUrl = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(data.url)}&size=32`;
                    newSite.innerHTML = `
                        <i class="fas fa-circle-notch fa-spin icon-placeholder" aria-hidden="true"></i>
                        <img class="favicon-icon" src="${faviconUrl}" alt="${(data.name || '站点')} favicon" loading="lazy" style="opacity:0;"
                             onload="this.style.opacity='1'; this.previousElementSibling.style.display='none';"
                             onerror="this.style.display='none'; this.previousElementSibling.style.display='none'; this.nextElementSibling.style.display='inline-block';" />
                        <i class="fas fa-link icon-fallback" aria-hidden="true" style="display:none;"></i>
                        <h3>${data.name || '未命名站点'}</h3>
                        <p>${data.description || ''}</p>
                    `;
                } else {
                    newSite.innerHTML = `
                        <i class="${data.icon || 'fas fa-link'}"></i>
                        <h3>${data.name || '未命名站点'}</h3>
                        <p>${data.description || ''}</p>
                    `;
                }
            } catch (e) {
                newSite.innerHTML = `
                    <i class="${data.icon || 'fas fa-link'}"></i>
                    <h3>${data.name || '未命名站点'}</h3>
                    <p>${data.description || ''}</p>
                `;
            }

            // 添加到DOM
            sitesGrid.appendChild(newSite);

            

            // 移除"暂无网站"提示（如果存在）
            const emptyMessage = sitesGrid.querySelector('.empty-sites');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // 触发元素添加事件
            this.events.emit('elementAdded', {
                id: data.name,
                type: 'site',
                parentId: parentId,
                data: data
            });

            return data.name;
        } else if (type === 'category') {
            // 查找父级页面容器
            parent = document.querySelector(`[data-container="categories"]`);
            if (!parent) return null;

            // 创建新的分类
            const newCategory = document.createElement('section');
            newCategory.className = 'category';
            
            // 设置数据属性
            newCategory.setAttribute('data-type', 'category');
            newCategory.setAttribute('data-name', data.name || '未命名分类');
            newCategory.setAttribute('data-icon', data.icon || 'fas fa-folder');
            newCategory.setAttribute('data-container', 'categories');

            // 添加内容
            newCategory.innerHTML = `
                <h2 data-editable="category-name"><i class="${data.icon || 'fas fa-folder'}"></i> ${data.name || '未命名分类'}</h2>
                <div class="sites-grid" data-container="sites">
                    <p class="empty-sites">暂无网站</p>
                </div>
            `;

            // 添加到DOM
            parent.appendChild(newCategory);

            // 触发元素添加事件
            this.events.emit('elementAdded', {
                id: data.name,
                type: 'category',
                data: data
            });

            return data.name;
        }

        return null;
    },

    // 删除元素
    removeElement: function(type, id) {
        const element = this._findElement(type, id);
        if (!element) return false;

        // 获取父级容器（如果是站点卡片）
        let parentId = null;
        if (type === 'site') {
            const categoryElement = element.closest('[data-type="category"]');
            if (categoryElement) {
                parentId = categoryElement.getAttribute('data-name');
            }
        }

        // 删除元素
        element.remove();

        // 触发元素删除事件
        this.events.emit('elementRemoved', {
            id: id,
            type: type,
            parentId: parentId
        });

        return true;
    },

    // 获取所有元素
    getAllElements: function(type) {
        return Array.from(document.querySelectorAll(`[data-type="${type}"]`)).map(el => {
            const id = this._getElementId(el);
            return {
                id: id,
                type: type,
                element: el
            };
        });
    },

    // 事件系统
    events: {
        listeners: {},

        // 添加事件监听器
        on: function(event, callback) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }
            this.listeners[event].push(callback);
            return this;
        },

        // 触发事件
        emit: function(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(callback => callback(data));
            }
            return this;
        },

        // 移除事件监听器
        off: function(event, callback) {
            if (this.listeners[event]) {
                if (callback) {
                    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
                } else {
                    delete this.listeners[event];
                }
            }
            return this;
        }
    }
};

// 多层级嵌套书签功能
window.MeNav.expandAll = function() {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        activePage.querySelectorAll('.category.collapsed, .group.collapsed').forEach(element => {
            element.classList.remove('collapsed');
            saveToggleState(element, 'expanded');
        });
    }
};

window.MeNav.collapseAll = function() {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        activePage.querySelectorAll('.category:not(.collapsed), .group:not(.collapsed)').forEach(element => {
            element.classList.add('collapsed');
            saveToggleState(element, 'collapsed');
        });
    }
};

// 智能切换分类展开/收起状态
window.MeNav.toggleCategories = function() {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    
    const allElements = activePage.querySelectorAll('.category, .group');
    const collapsedElements = activePage.querySelectorAll('.category.collapsed, .group.collapsed');
    
    // 如果收起的数量 >= 总数的一半，执行展开；否则执行收起
    if (collapsedElements.length >= allElements.length / 2) {
        window.MeNav.expandAll();
        updateCategoryToggleIcon('up');
    } else {
        window.MeNav.collapseAll();
        updateCategoryToggleIcon('down');
    }
};

// 更新分类切换按钮图标
function updateCategoryToggleIcon(state) {
    const toggleBtn = document.getElementById('category-toggle');
    if (!toggleBtn) return;
    
    const icon = toggleBtn.querySelector('i');
    if (!icon) return;
    
    if (state === 'up') {
        icon.className = 'fas fa-angle-double-up';
        toggleBtn.setAttribute('aria-label', '收起分类');
    } else {
        icon.className = 'fas fa-angle-double-down';
        toggleBtn.setAttribute('aria-label', '展开分类');
    }
}

window.MeNav.toggleCategory = function(categoryName, subcategoryName = null, groupName = null) {
    const selector = groupName
        ? `[data-name="${categoryName}"] [data-name="${subcategoryName}"] [data-name="${groupName}"]`
        : subcategoryName
            ? `[data-name="${categoryName}"] [data-name="${subcategoryName}"]`
            : `[data-name="${categoryName}"]`;
            
    const element = document.querySelector(selector);
    if (element) {
        toggleNestedElement(element);
    }
};

window.MeNav.getNestedStructure = function() {
    // 返回完整的嵌套结构数据
    const categories = [];
    document.querySelectorAll('.category-level-1').forEach(cat => {
        categories.push(extractNestedData(cat));
    });
    return categories;
};

// 切换嵌套元素
function toggleNestedElement(container) {
    const isCollapsed = container.classList.contains('collapsed');
    
    if (isCollapsed) {
        container.classList.remove('collapsed');
        saveToggleState(container, 'expanded');
    } else {
        container.classList.add('collapsed');
        saveToggleState(container, 'collapsed');
    }
    
    // 触发自定义事件
    const event = new CustomEvent('nestedToggle', {
        detail: {
            element: container,
            type: container.dataset.type,
            name: container.dataset.name,
            isCollapsed: !isCollapsed
        }
    });
    document.dispatchEvent(event);
}

// 保存切换状态
function saveToggleState(element, state) {
    const type = element.dataset.type;
    const name = element.dataset.name;
    const level = element.dataset.level || '1';
    const key = `menav-toggle-${type}-${level}-${name}`;
    localStorage.setItem(key, state);
}

// 恢复切换状态
function restoreToggleState(element) {
    const type = element.dataset.type;
    const name = element.dataset.name;
    const level = element.dataset.level || '1';
    const key = `menav-toggle-${type}-${level}-${name}`;
    const savedState = localStorage.getItem(key);
    
    if (savedState === 'collapsed') {
        element.classList.add('collapsed');
    }
}

// 初始化嵌套分类
function initializeNestedCategories() {
    // 为所有可折叠元素添加切换功能
    document.querySelectorAll('[data-toggle="category"], [data-toggle="group"]').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const container = this.parentElement;
            toggleNestedElement(container);
        });
        
        // 恢复保存的状态
        restoreToggleState(header.parentElement);
    });
}

// 提取嵌套数据
function extractNestedData(element) {
    const data = {
        name: element.dataset.name,
        type: element.dataset.type,
        level: element.dataset.level,
        isCollapsed: element.classList.contains('collapsed')
    };
    
    // 提取子元素数据
    const subcategories = element.querySelectorAll(':scope > .category-content > .subcategories-container > .category');
    if (subcategories.length > 0) {
        data.subcategories = Array.from(subcategories).map(sub => extractNestedData(sub));
    }
    
    const groups = element.querySelectorAll(':scope > .category-content > .groups-container > .group');
    if (groups.length > 0) {
        data.groups = Array.from(groups).map(group => extractNestedData(group));
    }
    
    const sites = element.querySelectorAll(':scope > .category-content > .sites-grid > .site-card, :scope > .group-content > .sites-grid > .site-card');
    if (sites.length > 0) {
        data.sites = Array.from(sites).map(site => ({
            name: site.dataset.name,
            url: site.dataset.url,
            icon: site.dataset.icon,
            description: site.dataset.description
        }));
    }
    
    return data;
}

document.addEventListener('DOMContentLoaded', () => {
    // 先声明所有状态变量
    let isSearchActive = false;
    let currentPageId = 'home';
    let isInitialLoad = true;
    let isSidebarOpen = false;
    let isSearchOpen = false;
    let isLightTheme = false; // 主题状态
    let isSidebarCollapsed = false; // 侧边栏折叠状态
    let pages; // 页面元素的全局引用
    let currentSearchEngine = 'local'; // 当前选择的搜索引擎

    // 搜索索引，用于提高搜索效率
    let searchIndex = {
        initialized: false,
        items: []
    };

    // 搜索引擎配置
    const searchEngines = {
        local: {
            name: '本地搜索',
            icon: 'fas fa-search',
            url: null // 本地搜索不需要URL
        },
        google: {
            name: 'Google搜索',
            icon: 'fab fa-google',
            url: 'https://www.google.com/search?q='
        },
        bing: {
            name: 'Bing搜索',
            icon: 'fab fa-microsoft',
            url: 'https://www.bing.com/search?q='
        },
        baidu: {
            name: '百度搜索',
            icon: 'fas fa-paw',
            url: 'https://www.baidu.com/s?wd='
        }
    };

    // 获取DOM元素 - 基本元素
    const searchInput = document.getElementById('search');
    const searchBox = document.querySelector('.search-box');
    const searchResultsPage = document.getElementById('search-results');
    const searchSections = searchResultsPage.querySelectorAll('.search-section');

    // 搜索引擎相关元素
    const searchIcon = document.querySelector('.search-icon');
    const searchEngineToggle = document.querySelector('.search-engine-toggle');
    const searchEngineDropdown = document.querySelector('.search-engine-dropdown');
    const searchEngineOptions = document.querySelectorAll('.search-engine-option');

    // 移动端元素
    const menuToggle = document.querySelector('.menu-toggle');
    const searchToggle = document.querySelector('.search-toggle');
    const sidebar = document.querySelector('.sidebar');
    const searchContainer = document.querySelector('.search-container');
    const overlay = document.querySelector('.overlay');

    // 侧边栏折叠功能
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const content = document.querySelector('.content');

    // 主题切换元素
    const themeToggle = document.querySelector('.theme-toggle');
    const themeIcon = themeToggle.querySelector('i');

    // 滚动进度条元素
    const scrollProgress = document.querySelector('.scroll-progress');

    // 移除预加载类，允许CSS过渡效果
    document.documentElement.classList.remove('preload');

    // 应用从localStorage读取的主题设置
    if (document.documentElement.classList.contains('theme-preload')) {
        document.documentElement.classList.remove('theme-preload');
        document.body.classList.add('light-theme');
        isLightTheme = true;
    }

    // 应用从localStorage读取的侧边栏状态
    if (document.documentElement.classList.contains('sidebar-collapsed-preload')) {
        document.documentElement.classList.remove('sidebar-collapsed-preload');
        sidebar.classList.add('collapsed');
        content.classList.add('expanded');
        isSidebarCollapsed = true;
    }

    // 即时移除loading类，确保侧边栏可见
    document.body.classList.remove('loading');
    document.body.classList.add('loaded');

    // 侧边栏折叠功能
    function toggleSidebarCollapse() {
        // 仅在交互时启用布局相关动画，避免首屏闪烁
        document.documentElement.classList.add('with-anim');

        isSidebarCollapsed = !isSidebarCollapsed;

        // 使用 requestAnimationFrame 确保平滑过渡
        requestAnimationFrame(() => {
            sidebar.classList.toggle('collapsed', isSidebarCollapsed);
            content.classList.toggle('expanded', isSidebarCollapsed);

            // 保存折叠状态到localStorage
            localStorage.setItem('sidebarCollapsed', isSidebarCollapsed ? 'true' : 'false');
        });
    }

    // 初始化侧边栏折叠状态 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
    function initSidebarState() {
        // 从localStorage获取侧边栏状态
        const savedState = localStorage.getItem('sidebarCollapsed');

        // 图标状态与折叠状态保持一致
        if (savedState === 'true' && !isMobile()) {
            isSidebarCollapsed = true;
        } else {
            isSidebarCollapsed = false;
        }
    }

    // 侧边栏折叠按钮点击事件
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebarCollapse);
    }

    // 主题切换功能
    function toggleTheme() {
        isLightTheme = !isLightTheme;
        document.body.classList.toggle('light-theme', isLightTheme);

        // 更新图标
        if (isLightTheme) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }

        // 保存主题偏好到localStorage
        localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
    }

    // 初始化主题 - 已在页面加载前处理，此处仅完成图标状态初始化等次要任务
    function initTheme() {
        // 从localStorage获取主题偏好
        const savedTheme = localStorage.getItem('theme');

        // 更新图标状态以匹配当前主题
        if (savedTheme === 'light') {
            isLightTheme = true;
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            isLightTheme = false;
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }

    // 主题切换按钮点击事件
    themeToggle.addEventListener('click', toggleTheme);

    // 初始化搜索索引
    function initSearchIndex() {
        if (searchIndex.initialized) return;

        searchIndex.items = [];

        try {
            // 为每个页面创建索引
            if (!pages) {
                pages = document.querySelectorAll('.page');
            }

            pages.forEach(page => {
                if (page.id === 'search-results') return;

                const pageId = page.id;

                page.querySelectorAll('.site-card').forEach(card => {
                    try {
                        const title = card.querySelector('h3')?.textContent?.toLowerCase() || '';
                        const description = card.querySelector('p')?.textContent?.toLowerCase() || '';
                        const url = card.href || card.getAttribute('href') || '#';
                        const icon = card.querySelector('i.icon-fallback')?.className || card.querySelector('i')?.className || '';

                        // 将卡片信息添加到索引中
                        searchIndex.items.push({
                            pageId,
                            title,
                            description,
                            url,
                            icon,
                            element: card,
                            // 预先计算搜索文本，提高搜索效率
                            searchText: (title + ' ' + description).toLowerCase()
                        });
                    } catch (cardError) {
                        console.error('Error processing card:', cardError);
                    }
                });
            });

            searchIndex.initialized = true;
        } catch (error) {
            console.error('Error initializing search index:', error);
            searchIndex.initialized = true; // 防止反复尝试初始化
        }
    }

    // 移动端菜单切换
    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;
        sidebar.classList.toggle('active', isSidebarOpen);
        overlay.classList.toggle('active', isSidebarOpen);
        if (isSearchOpen) {
            toggleSearch();
        }
    }

    // 移动端搜索切换
    function toggleSearch() {
        isSearchOpen = !isSearchOpen;
        searchContainer.classList.toggle('active', isSearchOpen);
        overlay.classList.toggle('active', isSearchOpen);
        if (isSearchOpen) {
            searchInput.focus();
            if (isSidebarOpen) {
                toggleSidebar();
            }
        }
    }

    // 关闭所有移动端面板
    function closeAllPanels() {
        if (isSidebarOpen) {
            toggleSidebar();
        }
        if (isSearchOpen) {
            toggleSearch();
        }
    }

    // 移动端事件监听
    menuToggle.addEventListener('click', toggleSidebar);
    searchToggle.addEventListener('click', toggleSearch);
    overlay.addEventListener('click', closeAllPanels);

    // 检查是否是移动设备
    function isMobile() {
        return window.innerWidth <= 768;
    }

    // 窗口大小改变时处理
    window.addEventListener('resize', () => {
        if (!isMobile()) {
            sidebar.classList.remove('active');
            searchContainer.classList.remove('active');
            overlay.classList.remove('active');
            isSidebarOpen = false;
            isSearchOpen = false;
        } else {
            // 在移动设备下，重置侧边栏折叠状态
            sidebar.classList.remove('collapsed');
            content.classList.remove('expanded');
        }

        // 重新计算滚动进度
        updateScrollProgress();
    });

    // 更新滚动进度条
    function updateScrollProgress() {
        const scrollTop = content.scrollTop || 0;
        const scrollHeight = content.scrollHeight - content.clientHeight || 1;
        const scrollPercent = (scrollTop / scrollHeight) * 100;
        scrollProgress.style.width = scrollPercent + '%';
    }

    // 监听内容区域的滚动事件
    content.addEventListener('scroll', updateScrollProgress);

    // 初始化时更新一次滚动进度
    updateScrollProgress();

    // 页面切换功能
    function showPage(pageId, skipSearchReset = false) {
        if (currentPageId === pageId && !skipSearchReset && !isInitialLoad) return;

        currentPageId = pageId;

        // 使用 RAF 确保动画流畅
        requestAnimationFrame(() => {
            if (!pages) {
                pages = document.querySelectorAll('.page');
            }

            pages.forEach(page => {
                const shouldBeActive = page.id === pageId;
                if (shouldBeActive !== page.classList.contains('active')) {
                    page.classList.toggle('active', shouldBeActive);
                }
            });

            // 初始加载完成后设置标志
            if (isInitialLoad) {
                isInitialLoad = false;
                document.body.classList.add('loaded');
            }
        });

        // 重置滚动位置并更新进度条
        content.scrollTop = 0;
        updateScrollProgress();

        // 只有在非搜索状态下才重置搜索
        if (!skipSearchReset) {
            searchInput.value = '';
            resetSearch();
        }
    }

    // 搜索功能
    function performSearch(searchTerm) {
        // 确保搜索索引已初始化
        if (!searchIndex.initialized) {
            initSearchIndex();
        }

        searchTerm = searchTerm.toLowerCase().trim();

        // 如果搜索框为空，重置所有内容
        if (!searchTerm) {
            resetSearch();
            return;
        }

        if (!isSearchActive) {
            isSearchActive = true;
        }

        try {
            // 使用搜索索引进行搜索
            const searchResults = new Map();
            let hasResults = false;

            // 使用更高效的搜索算法
            const matchedItems = searchIndex.items.filter(item => {
                return item.searchText.includes(searchTerm) || PinyinMatch.match(item.searchText, searchTerm);;
            });

            // 按页面分组结果
            matchedItems.forEach(item => {
                if (!searchResults.has(item.pageId)) {
                    searchResults.set(item.pageId, []);
                }
                // 克隆元素以避免修改原始DOM
                searchResults.get(item.pageId).push(item.element.cloneNode(true));
                hasResults = true;
            });

            // 使用requestAnimationFrame批量更新DOM，减少重排重绘
            requestAnimationFrame(() => {
                try {
                    // 清空并隐藏所有搜索区域
                    searchSections.forEach(section => {
                        try {
                            const grid = section.querySelector('.sites-grid');
                            if (grid) {
                                grid.innerHTML = ''; // 使用innerHTML清空，比removeChild更高效
                            }
                            section.style.display = 'none';
                        } catch (sectionError) {
                            console.error('Error clearing search section');
                        }
                    });

                    // 使用DocumentFragment批量添加DOM元素，减少重排
                    searchResults.forEach((matches, pageId) => {
                        const section = searchResultsPage.querySelector(`[data-section="${pageId}"]`);
                        if (section) {
                            try {
                                const grid = section.querySelector('.sites-grid');
                                if (grid) {
                                    const fragment = document.createDocumentFragment();

                                    matches.forEach(card => {
                                        // 高亮匹配文本
                                        highlightSearchTerm(card, searchTerm);
                                        fragment.appendChild(card);
                                    });

                                    grid.appendChild(fragment);
                                    section.style.display = 'block';
                                }
                            } catch (gridError) {
                                console.error('Error updating search results grid');
                            }
                        }
                    });

                    // 更新搜索结果页面状态
                    const subtitle = searchResultsPage.querySelector('.subtitle');
                    if (subtitle) {
                        subtitle.textContent = hasResults
                            ? `在所有页面中找到 ${matchedItems.length} 个匹配项`
                            : '未找到匹配的结果';
                    }

                    // 显示搜索结果页面
                    if (currentPageId !== 'search-results') {
                        currentPageId = 'search-results';
                        pages.forEach(page => {
                            page.classList.toggle('active', page.id === 'search-results');
                        });
                    }

                    // 更新搜索状态样式
                    searchBox.classList.toggle('has-results', hasResults);
                    searchBox.classList.toggle('no-results', !hasResults);
                } catch (uiError) {
                    console.error('Error updating search UI');
                }
            });
        } catch (searchError) {
            console.error('Error performing search');
        }
    }

    // 高亮搜索匹配文本
    function highlightSearchTerm(card, searchTerm) {
        if (!card || !searchTerm) return;

        try {
            const title = card.querySelector('h3');
            const description = card.querySelector('p');

            if (!title || !description) return;

            // 安全地高亮标题中的匹配文本
            if (title.textContent.toLowerCase().includes(searchTerm)) {
                const titleText = title.textContent;
                const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');

                // 创建安全的DOM结构而不是直接使用innerHTML
                const titleFragment = document.createDocumentFragment();
                let lastIndex = 0;
                let match;

                // 使用正则表达式查找所有匹配项
                const titleRegex = new RegExp(regex);
                while ((match = titleRegex.exec(titleText)) !== null) {
                    // 添加匹配前的文本
                    if (match.index > lastIndex) {
                        titleFragment.appendChild(document.createTextNode(
                            titleText.substring(lastIndex, match.index)
                        ));
                    }

                    // 添加高亮的匹配文本
                    const span = document.createElement('span');
                    span.className = 'highlight';
                    span.textContent = match[0];
                    titleFragment.appendChild(span);

                    lastIndex = match.index + match[0].length;

                    // 防止无限循环
                    if (titleRegex.lastIndex === 0) break;
                }

                // 添加剩余文本
                if (lastIndex < titleText.length) {
                    titleFragment.appendChild(document.createTextNode(
                        titleText.substring(lastIndex)
                    ));
                }

                // 清空原标题并添加新内容
                while (title.firstChild) {
                    title.removeChild(title.firstChild);
                }
                title.appendChild(titleFragment);
            } else if (PinyinMatch.match(title.textContent, searchTerm)) {
                const arr = PinyinMatch.match(title.textContent, searchTerm);
                const [start, end] = arr;
                title.innerHTML = title.textContent.slice(0, start) +
                    `<span class="highlight">${title.textContent.slice(start, end + 1)}</span>` +
                    title.textContent.slice(end + 1);
            }

            // 安全地高亮描述中的匹配文本
            if (description.textContent.toLowerCase().includes(searchTerm)) {
                const descText = description.textContent;
                const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');

                // 创建安全的DOM结构而不是直接使用innerHTML
                const descFragment = document.createDocumentFragment();
                let lastIndex = 0;
                let match;

                // 使用正则表达式查找所有匹配项
                const descRegex = new RegExp(regex);
                while ((match = descRegex.exec(descText)) !== null) {
                    // 添加匹配前的文本
                    if (match.index > lastIndex) {
                        descFragment.appendChild(document.createTextNode(
                            descText.substring(lastIndex, match.index)
                        ));
                    }

                    // 添加高亮的匹配文本
                    const span = document.createElement('span');
                    span.className = 'highlight';
                    span.textContent = match[0];
                    descFragment.appendChild(span);

                    lastIndex = match.index + match[0].length;

                    // 防止无限循环
                    if (descRegex.lastIndex === 0) break;
                }

                // 添加剩余文本
                if (lastIndex < descText.length) {
                    descFragment.appendChild(document.createTextNode(
                        descText.substring(lastIndex)
                    ));
                }

                // 清空原描述并添加新内容
                while (description.firstChild) {
                    description.removeChild(description.firstChild);
                }
                description.appendChild(descFragment);
            } else if (PinyinMatch.match(description.textContent, searchTerm)) {
                const arr = PinyinMatch.match(description.textContent, searchTerm);
                const [start, end] = arr;
                description.innerHTML = description.textContent.slice(0, start) +
                    `<span class="highlight">${description.textContent.slice(start, end + 1)}</span>` +
                    description.textContent.slice(end + 1);
            }
        } catch (error) {
            console.error('Error highlighting search term');
        }
    }

    // 转义正则表达式特殊字符
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 重置搜索状态
    function resetSearch() {
        if (!isSearchActive) return;

        isSearchActive = false;

        try {
            requestAnimationFrame(() => {
                try {
                    // 清空搜索结果
                    searchSections.forEach(section => {
                        try {
                            const grid = section.querySelector('.sites-grid');
                            if (grid) {
                                while (grid.firstChild) {
                                    grid.removeChild(grid.firstChild);
                                }
                            }
                            section.style.display = 'none';
                        } catch (sectionError) {
                            console.error('Error clearing search section');
                        }
                    });

                    // 移除搜索状态样式
                    searchBox.classList.remove('has-results', 'no-results');

                    // 恢复到当前激活的页面
                    const currentActiveNav = document.querySelector('.nav-item.active');
                    if (currentActiveNav) {
                        const targetPageId = currentActiveNav.getAttribute('data-page');

                        if (targetPageId && currentPageId !== targetPageId) {
                            currentPageId = targetPageId;
                            pages.forEach(page => {
                                page.classList.toggle('active', page.id === targetPageId);
                            });
                        }
                    } else {
                        // 如果没有激活的导航项，默认显示首页
                        currentPageId = 'home';
                        pages.forEach(page => {
                            page.classList.toggle('active', page.id === 'home');
                        });
                    }
                } catch (resetError) {
                    console.error('Error resetting search UI');
                }
            });
        } catch (error) {
            console.error('Error in resetSearch');
        }
    }

    // 搜索输入事件（使用防抖）
    const debounce = (fn, delay) => {
        let timer = null;
        return (...args) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                fn.apply(this, args);
                timer = null;
            }, delay);
        };
    };

    const debouncedSearch = debounce(performSearch, 300);

    searchInput.addEventListener('input', (e) => {
        // 只有在选择了本地搜索时，才在输入时实时显示本地搜索结果
        if (currentSearchEngine === 'local') {
            debouncedSearch(e.target.value);
        } else {
            // 对于非本地搜索，重置之前的本地搜索结果（如果有）
            if (isSearchActive) {
                resetSearch();
            }
        }
    });

    // 初始化搜索引擎设置
    function initSearchEngine() {
        // 从本地存储获取上次选择的搜索引擎
        const savedEngine = localStorage.getItem('searchEngine');
        if (savedEngine && searchEngines[savedEngine]) {
            currentSearchEngine = savedEngine;
        }

        // 设置当前搜索引擎的激活状态及图标
        updateSearchEngineUI();

        // 初始化搜索引擎下拉菜单事件
        const toggleEngineDropdown = () => {
            const next = !searchEngineDropdown.classList.contains('active');
            searchEngineDropdown.classList.toggle('active', next);
            if (searchBox) {
                searchBox.classList.toggle('dropdown-open', next);
            }
            if (searchEngineToggle) {
                searchEngineToggle.setAttribute('aria-expanded', String(next));
            }
        };

        if (searchIcon) {
            searchIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleEngineDropdown();
            });
        }

        if (searchEngineToggle) {
            searchEngineToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleEngineDropdown();
            });
            // 键盘可访问性：Enter/Space 触发
            searchEngineToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleEngineDropdown();
                }
            });
        }

        // 点击搜索引擎选项
        searchEngineOptions.forEach(option => {
            // 初始化激活状态
            if (option.getAttribute('data-engine') === currentSearchEngine) {
                option.classList.add('active');
            }

            option.addEventListener('click', (e) => {
                e.stopPropagation();

                // 获取选中的搜索引擎
                const engine = option.getAttribute('data-engine');

                // 更新当前搜索引擎
                if (engine && searchEngines[engine]) {
                    // 如果搜索引擎变更，且之前有活跃的本地搜索结果，重置搜索状态
                    if (currentSearchEngine !== engine && isSearchActive) {
                        resetSearch();
                    }

                    currentSearchEngine = engine;
                    localStorage.setItem('searchEngine', engine);

                    // 更新UI显示
                    updateSearchEngineUI();

                    // 关闭下拉菜单
                    searchEngineDropdown.classList.remove('active');
                    if (searchBox) {
                        searchBox.classList.remove('dropdown-open');
                    }
                }
            });
        });

        // 点击页面其他位置关闭下拉菜单
        document.addEventListener('click', () => {
            searchEngineDropdown.classList.remove('active');
            if (searchBox) {
                searchBox.classList.remove('dropdown-open');
            }
        });
    }

    // 更新搜索引擎UI显示
    function updateSearchEngineUI() {
        // 移除所有选项的激活状态
        searchEngineOptions.forEach(option => {
            option.classList.remove('active');

            // 如果是当前选中的搜索引擎，添加激活状态
            if (option.getAttribute('data-engine') === currentSearchEngine) {
                option.classList.add('active');
            }
        });

        // 更新搜索图标以反映当前搜索引擎
        if (searchIcon) {
            // 清除所有类，保留基本的search-icon类
            const classList = searchIcon.className.split(' ').filter(cls => cls === 'search-icon');
            searchIcon.className = classList.join(' ');

            // 添加当前搜索引擎的图标类
            const engine = searchEngines[currentSearchEngine];
            if (engine) {
                const iconClasses = engine.icon.split(' ');
                iconClasses.forEach(cls => {
                    searchIcon.classList.add(cls);
                });

                // 更新标题提示
                searchIcon.setAttribute('title', engine.name);
            }
        }
    }

    // 执行搜索（根据选择的搜索引擎）
    function executeSearch(searchTerm) {
        if (!searchTerm.trim()) return;

        // 根据当前搜索引擎执行搜索
        if (currentSearchEngine === 'local') {
            // 执行本地搜索
            performSearch(searchTerm);
        } else {
            // 使用外部搜索引擎
            const engine = searchEngines[currentSearchEngine];
            if (engine && engine.url) {
                // 打开新窗口进行搜索
                window.open(engine.url + encodeURIComponent(searchTerm), '_blank');
            }
        }
    }

    // 搜索框事件处理
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            resetSearch();
        } else if (e.key === 'Enter') {
            executeSearch(searchInput.value);
            // 在移动设备上，执行搜索后自动关闭搜索面板
            if (isMobile() && isSearchOpen) {
                closeAllPanels();
            }
        }
    });

    // 阻止搜索框的回车默认行为
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });

    // 初始化
    window.addEventListener('load', () => {
        // 获取可能在HTML生成后才存在的DOM元素
        const siteCards = document.querySelectorAll('.site-card');
        const categories = document.querySelectorAll('.category');
        const navItems = document.querySelectorAll('.nav-item');
        const navItemWrappers = document.querySelectorAll('.nav-item-wrapper');
        const submenuItems = document.querySelectorAll('.submenu-item');
        pages = document.querySelectorAll('.page');

        // 初始化主题
        initTheme();

        // 初始化侧边栏状态
        initSidebarState();

        // 初始化搜索引擎选择
        initSearchEngine();

        // 初始化MeNav对象版本信息
        try {
            const config = window.MeNav.getConfig();
            if (config && config.version) {
                window.MeNav.version = config.version;
                console.log('MeNav API initialized with version:', config.version);
            }
        } catch (error) {
            console.error('Error initializing MeNav API:', error);
        }

        // 立即执行初始化，不再使用requestAnimationFrame延迟
        // 显示首页
        showPage('home');

        // 添加载入动画
        categories.forEach((category, index) => {
            setTimeout(() => {
                category.style.opacity = '1';
            }, index * 100);
        });

        // 初始展开当前页面的子菜单
        const activeNavItem = document.querySelector('.nav-item.active');
        if (activeNavItem) {
            const activeWrapper = activeNavItem.closest('.nav-item-wrapper');
            if (activeWrapper) {
            }
        }

        // 导航项点击效果
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (item.getAttribute('target') === '_blank') return;

                e.preventDefault();

                // 获取当前项的父级wrapper
                const wrapper = item.closest('.nav-item-wrapper');
                const hasSubmenu = wrapper && wrapper.querySelector('.submenu');

                // 处理子菜单展开/折叠
                if (hasSubmenu) {
                    // 如果点击的导航项已经激活且有子菜单，则切换子菜单展开状态
                    if (item.classList.contains('active')) {
                        wrapper.classList.toggle('expanded');
                    } else {
                        // 关闭所有已展开的子菜单
                        navItemWrappers.forEach(navWrapper => {
                            if (navWrapper !== wrapper) {
                                navWrapper.classList.remove('expanded');
                            }
                        });

                        // 展开当前子菜单
                        wrapper.classList.add('expanded');
                    }
                }

                // 激活导航项
                navItems.forEach(nav => {
                    nav.classList.toggle('active', nav === item);
                });

                const pageId = item.getAttribute('data-page');
                if (pageId) {
                    showPage(pageId);

                    // 在移动端视图下点击导航项后自动收起侧边栏
                    if (isMobile() && isSidebarOpen && !hasSubmenu) {
                        closeAllPanels();
                    }
                }
            });
        });

        // 子菜单项点击效果
        submenuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();

                // 获取页面ID和分类名称
                const pageId = item.getAttribute('data-page');
                const categoryName = item.getAttribute('data-category');

                if (pageId) {
                    // 清除所有子菜单项的激活状态
                    submenuItems.forEach(subItem => {
                        subItem.classList.remove('active');
                    });

                    // 激活当前子菜单项
                    item.classList.add('active');

                    // 激活相应的导航项
                    navItems.forEach(nav => {
                        nav.classList.toggle('active', nav.getAttribute('data-page') === pageId);
                    });

                    // 显示对应页面
                    showPage(pageId);

                    // 等待页面切换完成后滚动到对应分类
                    setTimeout(() => {
                        // 查找目标分类元素
                        const targetPage = document.getElementById(pageId);
                        if (targetPage) {
                            const targetCategory = Array.from(targetPage.querySelectorAll('.category h2')).find(
                                heading => heading.textContent.trim().includes(categoryName)
                            );

                            if (targetCategory) {
                                // 优化的滚动实现：滚动到使目标分类位于视口1/4处（更靠近顶部位置）
                                try {
                                    // 直接获取所需元素和属性，减少重复查询
                                    const contentElement = document.querySelector('.content');

                                    if (contentElement && contentElement.scrollHeight > contentElement.clientHeight) {
                                        // 获取目标元素相对于内容区域的位置
                                        const rect = targetCategory.getBoundingClientRect();
                                        const containerRect = contentElement.getBoundingClientRect();

                                        // 计算目标应该在视口中的位置（视口高度的1/4处）
                                        const desiredPosition = containerRect.height / 4;

                                        // 计算需要滚动的位置
                                        const scrollPosition = contentElement.scrollTop + rect.top - containerRect.top - desiredPosition;

                                        // 执行滚动
                                        contentElement.scrollTo({
                                            top: scrollPosition,
                                            behavior: 'smooth'
                                        });
                                    } else {
                                        // 回退到基本滚动方式
                                        targetCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                } catch (error) {
                                    console.error('Error during scroll:', error);
                                    // 回退到基本滚动方式
                                    targetCategory.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }
                        }
                    }, 25); // 延迟时间

                    // 在移动端视图下点击子菜单项后自动收起侧边栏
                    if (isMobile() && isSidebarOpen) {
                        closeAllPanels();
                    }
                }
            });
        });

        // 初始化嵌套分类功能
        initializeNestedCategories();
        
        // 初始化分类切换按钮
        const categoryToggleBtn = document.getElementById('category-toggle');
        if (categoryToggleBtn) {
            categoryToggleBtn.addEventListener('click', function() {
                window.MeNav.toggleCategories();
            });
        } else {
            console.error('Category toggle button not found');
        }
        
        // 初始化搜索索引（使用requestIdleCallback或setTimeout延迟初始化，避免影响页面加载）
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => initSearchIndex());
        } else {
            setTimeout(initSearchIndex, 1000);
        }
    });
});
