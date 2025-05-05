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
    
    // 搜索索引，用于提高搜索效率
    let searchIndex = {
        initialized: false,
        items: []
    };
    
    // 获取DOM元素 - 基本元素
    const searchInput = document.getElementById('search');
    const searchBox = document.querySelector('.search-box');
    const searchResultsPage = document.getElementById('search-results');
    const searchSections = searchResultsPage.querySelectorAll('.search-section');
    
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
                        const icon = card.querySelector('i')?.className || '';
                        
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
            console.log('Search index initialized with', searchIndex.items.length, 'items');
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
                return item.searchText.includes(searchTerm);
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
                            console.error('Error clearing search section:', sectionError);
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
                                console.error(`Error updating search results for ${pageId}:`, gridError);
                            }
                        } else {
                            console.warn(`Search section for page "${pageId}" not found`);
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
                    console.error('Error updating search UI:', uiError);
                }
            });
        } catch (searchError) {
            console.error('Error performing search:', searchError);
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
            }
        } catch (error) {
            console.error('Error highlighting search term:', error);
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
                            console.error('Error clearing search section:', sectionError);
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
                } catch (uiError) {
                    console.error('Error resetting search UI:', uiError);
                }
            });
        } catch (error) {
            console.error('Error in resetSearch:', error);
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
        debouncedSearch(e.target.value);
    });

    // 搜索框事件处理
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            resetSearch();
        } else if (e.key === 'Enter') {
            performSearch(searchInput.value);
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
        
        // 初始化搜索索引（使用requestIdleCallback或setTimeout延迟初始化，避免影响页面加载）
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => initSearchIndex());
        } else {
            setTimeout(initSearchIndex, 1000);
        }
    });
}); 