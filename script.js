document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search');
    const siteCards = document.querySelectorAll('.site-card');
    const categories = document.querySelectorAll('.category');
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    const searchBox = document.querySelector('.search-box');
    const searchResultsPage = document.getElementById('search-results');
    const searchSections = searchResultsPage.querySelectorAll('.search-section');
    let isSearchActive = false;
    let currentPageId = 'home';
    let isInitialLoad = true;

    // 页面切换功能
    function showPage(pageId, skipSearchReset = false) {
        if (currentPageId === pageId && !skipSearchReset && !isInitialLoad) return;
        
        currentPageId = pageId;

        // 使用 RAF 确保动画流畅
        requestAnimationFrame(() => {
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
        
        // 只有在非搜索状态下才重置搜索
        if (!skipSearchReset) {
            searchInput.value = '';
            resetSearch();
        }
    }

    // 搜索功能
    function performSearch(searchTerm) {
        searchTerm = searchTerm.toLowerCase().trim();

        // 如果搜索框为空，重置所有内容
        if (!searchTerm) {
            resetSearch();
            return;
        }

        if (!isSearchActive) {
            isSearchActive = true;
        }

        let hasResults = false;
        const searchResults = new Map();

        // 收集所有匹配结果
        pages.forEach(page => {
            if (page.id === 'search-results') return;

            const pageId = page.id;
            const matches = [];

            page.querySelectorAll('.site-card').forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                const description = card.querySelector('p').textContent.toLowerCase();
                if (title.includes(searchTerm) || description.includes(searchTerm)) {
                    matches.push(card.cloneNode(true));
                    hasResults = true;
                }
            });

            if (matches.length > 0) {
                searchResults.set(pageId, matches);
            }
        });

        // 批量更新DOM
        requestAnimationFrame(() => {
            // 清空并隐藏所有搜索区域
            searchSections.forEach(section => {
                const grid = section.querySelector('.sites-grid');
                while (grid.firstChild) {
                    grid.removeChild(grid.firstChild);
                }
                section.style.display = 'none';
            });

            // 填充匹配结果
            searchResults.forEach((matches, pageId) => {
                const section = searchResultsPage.querySelector(`[data-section="${pageId}"]`);
                const grid = section.querySelector('.sites-grid');
                const fragment = document.createDocumentFragment();
                matches.forEach(card => fragment.appendChild(card));
                grid.appendChild(fragment);
                section.style.display = 'block';
            });

            // 更新搜索结果页面状态
            searchResultsPage.querySelector('.subtitle').textContent = 
                hasResults ? '在所有页面中找到的匹配项' : '未找到匹配的结果';

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
        });
    }

    // 重置搜索状态
    function resetSearch() {
        if (!isSearchActive) return;

        isSearchActive = false;

        requestAnimationFrame(() => {
            // 清空搜索结果
            searchSections.forEach(section => {
                const grid = section.querySelector('.sites-grid');
                while (grid.firstChild) {
                    grid.removeChild(grid.firstChild);
                }
                section.style.display = 'none';
            });

            // 移除搜索状态样式
            searchBox.classList.remove('has-results', 'no-results');

            // 恢复到当前激活的页面
            const currentActiveNav = document.querySelector('.nav-item.active');
            const targetPageId = currentActiveNav.getAttribute('data-page');
            
            if (currentPageId !== targetPageId) {
                currentPageId = targetPageId;
                pages.forEach(page => {
                    page.classList.toggle('active', page.id === targetPageId);
                });
            }
        });
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
        }
    });

    // 阻止搜索框的回车默认行为
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });

    // 导航项点击效果
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.getAttribute('target') === '_blank') return;
            
            e.preventDefault();
            navItems.forEach(nav => {
                nav.classList.toggle('active', nav === item);
            });

            const pageId = item.getAttribute('data-page');
            if (pageId) {
                showPage(pageId);
            }
        });
    });

    // 初始化
    window.addEventListener('load', () => {
        // 延迟一帧执行初始化，确保样式已经应用
        requestAnimationFrame(() => {
            // 显示首页
            showPage('home');
            
            // 添加载入动画
            categories.forEach((category, index) => {
                setTimeout(() => {
                    category.style.opacity = '1';
                }, index * 100);
            });
        });
    });

    // 移动端菜单交互
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.overlay');

    function toggleMenu() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }

    function closeMenu() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuToggle.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);

    // 点击链接后自动关闭菜单
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMenu();
            }
        });
    });

    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMenu();
        }
    });
}); 