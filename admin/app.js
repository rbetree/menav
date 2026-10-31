'use strict';

/* ============================================================
   menav 动态后台管理前端(形态二)
   纯原生 JS,无任何 UI 框架 / 构建步骤。
   - 渲染 页面 → 分类(可嵌套) → 站点 树,支持搜索定位与拖拽排序
   - 站点 / 分类 / 页面 CRUD,同级排序,立即发布,书签导入
   - 所有请求带 credentials;受保护端点由 Cloudflare Access 拦截,
     前端一律不自带 token。
   ============================================================ */

/* ---------- 全局状态 ---------- */
let state = { pages: [] }; // /api/state 返回的站点模型
let stateEtag = null;
let modalEtag = null;
let mutationPending = false;
let statusTimer;
let searchTerm = ''; // 当前搜索关键词
const collapsed = new Set(); // 'p:<id>' / 'c:<id>',折叠状态记忆
const nodeIndex = { pages: [], categories: [], sites: [] };
let booted = false; // 入场动画只在首帧播放一次

/* ---------- 图标(内联 SVG,不依赖任何网络字体/图标库) ---------- */
const ICON = {
  loader:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".28"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 20h18L12 4Z"/><path d="M12 10v4.5"/><path d="M12 17.4h.01"/></svg>',
  cloudOff:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16"/><path d="M8.6 18H7a4 4 0 0 1-.7-7.9"/><path d="M9.9 6.3A5.5 5.5 0 0 1 18 11h1a3.5 3.5 0 0 1 2.2 6.2"/></svg>',
  folder:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17V7.5Z"/></svg>',
  layers:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 8l-9 5-9-5 9-5Z"/><path d="m3 13.5 9 5 9-5"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.2"/><path d="m20 20-3.6-3.6"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8h.01"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.6v2M12 19.4v2M4.7 4.7l1.4 1.4M17.9 17.9l1.4 1.4M2.6 12h2M19.4 12h2M4.7 19.3 6.1 17.9M17.9 6.1l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.7 8.7 0 1 0 11.3 11.3Z"/></svg>',
  arrowUp:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6"/><path d="m6.5 11.5 5.5-5.5 5.5 5.5"/></svg>',
  arrowDown:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v13"/><path d="m6.5 12.5 5.5 5.5 5.5-5.5"/></svg>',
};

/* ---------- 小工具 ---------- */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* 文本查询是否命中站点/分类/页面(大小写不敏感)。 */
function matches(text) {
  if (!searchTerm) return true;
  return String(text || '')
    .toLowerCase()
    .includes(searchTerm);
}

function toast(msg, kind = 'info') {
  const box = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' is-' + kind : '');
  if (kind === 'error') el.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = msg;
  el.appendChild(text);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', '关闭提示');
  close.textContent = '×';
  el.appendChild(close);
  box.appendChild(el);
  // 文案越长停留越久,避免长提示读不完。
  const duration = Math.min(3000 + msg.length * 70, 9000);
  const timer = setTimeout(dismiss, duration);
  close.addEventListener(
    'click',
    () => {
      clearTimeout(timer);
      dismiss();
    },
    { once: true }
  );
  // 淡出后再移除,避免提示突然消失
  function dismiss() {
    if (el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 240);
  }
}

function showStatus(kind, text, opts) {
  const el = document.getElementById('status');
  const icon = el.querySelector('.status-icon');
  const txt = el.querySelector('.status-text');
  el.className = 'status-notice is-' + kind;
  const icons = {
    loading: ICON.loader,
    error: ICON.alert,
    empty: ICON.folder,
    offline: ICON.cloudOff,
  };
  icon.innerHTML = icons[kind] || ICON.info;
  txt.textContent = text;
  // 错误/脱机态附「重试」入口,替代只让用户手动刷新
  const retryBtn = el.querySelector('.status-retry');
  if (retryBtn) retryBtn.remove();
  if (opts && typeof opts.retry === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm status-retry';
    btn.textContent = '重试';
    btn.addEventListener('click', opts.retry);
    el.appendChild(btn);
  }
  el.hidden = false;
  // 仅整屏加载态才清空树;错误态保留旧内容便于对照。
  if (kind === 'loading') document.getElementById('tree-root').innerHTML = '';
}

function hideStatus() {
  document.getElementById('status').hidden = true;
}

/* ---------- API 封装 ---------- */
/* 404 意味着该条目已被删除或不存在(常见于编辑窗口打开期间数据被其他端改动),统一提示并刷新 */
function isNotFound(r) {
  return !r.ok && !r.auth && r.status === 404;
}

async function api(method, path, body, etagOverride) {
  const opts = { method, credentials: 'include', headers: {} };
  const mutation = method !== 'GET' && path !== '/api/rebuild';
  if (mutation && mutationPending)
    return { ok: false, status: 409, error: 'busy', detail: '请等待当前保存完成' };
  if (mutation) {
    const etag = etagOverride || modalEtag || stateEtag;
    if (!etag)
      return { ok: false, status: 409, error: 'revision_conflict', detail: '请先刷新数据后再编辑' };
    opts.headers['If-Match'] = etag;
    mutationPending = true;
  }
  try {
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch {
      return { ok: false, auth: false, status: 0, error: 'network' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, auth: true, status: res.status, error: 'auth' };
    }
    // 仅认证重定向属于会话失效；普通 HTML 500 保留服务故障语义。
    const contentType = res.headers.get('content-type') || '';
    if (res.redirected && /\/cdn-cgi\/access\/|\.cloudflareaccess\.com/.test(res.url)) {
      return { ok: false, auth: true, status: res.status, error: 'auth' };
    }
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        auth: false,
        status: res.status,
        error: 'invalid_response',
        detail: '服务返回异常响应（HTTP ' + res.status + '），请稍后重试',
      };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, error: 'invalid_json', detail: '服务器响应格式无效' };
    }
    if (!res.ok || (data && data.ok === false)) {
      return {
        ok: false,
        auth: false,
        status: res.status,
        error: (data && data.error) || 'HTTP ' + res.status,
        detail: data ? data.detail : undefined,
        count: data ? data.count : undefined,
      };
    }
    // B1:裸数组响应(如 /api/state 返回 PageNode[])不得被 `...(data||{})` 摊平成索引对象
    const etag = res.headers.get('etag');
    if (Array.isArray(data)) return { ok: true, status: res.status, data, etag };
    return {
      ok: true,
      status: res.status,
      data: data ? data.data : undefined,
      ...(data || {}),
      etag,
    };
  } finally {
    if (mutation) mutationPending = false;
  }
}

/* ---------- 数据加载 ---------- */
/* silent=true 用于写操作后的静默刷新:不清空树、保留滚动位置与焦点。 */
async function loadState(opts = {}) {
  const silent = opts.silent === true;
  if (!silent) {
    showStatus('loading', '正在加载站点模型…');
  } else {
    hideStatus();
  }
  const r = await api('GET', '/api/state');
  if (r.status === 0) {
    showStatus(
      'offline',
      '无法连接 /api/state —— 当前处于脱机态。请通过动态后台域名访问,并确保已登录 Cloudflare Access。',
      { retry: loadState }
    );
    return;
  }
  if (r.auth) {
    showStatus('error', '需登录(Cloudflare Access)。会话可能已过期,请刷新页面重新验证。');
    return;
  }
  if (!r.ok) {
    // 404:admin 未与 Worker 同域部署时最常见,给出可操作的下一步
    const msg =
      r.status === 404
        ? '获取站点模型失败:后端接口不可达(404)。请确认控制台部署在动态后台 Worker 同域下。'
        : '获取站点模型失败:' + (r.detail || r.error || '未知错误');
    showStatus('error', msg, { retry: loadState });
    return;
  }
  // /api/state 直接返回 PageNode[]
  state.pages = Array.isArray(r.data) ? r.data : [];
  stateEtag = r.etag;
  hideStatus();
  const scrollY = window.scrollY;
  renderTree();
  if (silent) window.scrollTo(0, scrollY);
  void loadPublishStatus();
}

/* ---------- 节点索引:定位节点 + 兄弟列表 ---------- */
function rebuildIndex() {
  const idx = { pages: [], categories: [], sites: [] };
  for (const p of state.pages) {
    idx.pages.push({ node: p, page: null });

    const visitCats = (cats, parent) => {
      for (const c of cats) {
        idx.categories.push({ node: c, page: p, parent });
        visitCats(c.categories || [], c);
      }
    };
    visitCats(p.categories || [], null);

    const visitSites = (cats) => {
      for (const c of cats) {
        for (const s of c.sites || []) idx.sites.push({ node: s, category: c, page: p });
        visitSites(c.categories || []);
      }
    };
    visitSites(p.categories || []);
  }
  return idx;
}

function categorySiblings(page, parentId) {
  return nodeIndex.categories
    .filter((x) => x.page.id === page.id && (x.parent ? x.parent.id : null) === parentId)
    .map((x) => x.node);
}

function siteSiblings(categoryId) {
  return nodeIndex.sites.filter((x) => x.category.id === categoryId).map((x) => x.node);
}

/* 分类及其全部子孙的 id 集合(用于父分类下拉排除,避免循环) */
function descendantIds(rootCat) {
  const set = new Set();
  const walk = (c) => {
    set.add(c.id);
    for (const ch of c.categories || []) walk(ch);
  };
  walk(rootCat);
  return set;
}

/* ---------- 渲染 ---------- */
/* 空树 / 搜索无结果的引导态:说明下一步该做什么,而不只是宣告「没有数据」 */
function emptyTreeHtml() {
  if (searchTerm) {
    // 回显用户原始输入(搜索词内部按小写比较)
    const shown = document.getElementById('tree-search')?.value.trim() || searchTerm;
    return (
      '<div class="tree-empty">' +
      '<span class="tree-empty-icon">' +
      ICON.search +
      '</span>' +
      '<p class="tree-empty-title">没有匹配的结果</p>' +
      '<p class="tree-empty-text">没有页面、分类或站点匹配「' +
      esc(shown) +
      '」。换个关键词,或清空搜索回到完整结构。</p>' +
      '<button type="button" class="btn" data-action="clear-search">清空搜索</button>' +
      '</div>'
    );
  }
  return (
    '<div class="tree-empty">' +
    '<span class="tree-empty-icon">' +
    ICON.layers +
    '</span>' +
    '<p class="tree-empty-title">还没有任何页面</p>' +
    '<p class="tree-empty-text">页面是导航站的一级结构,例如「首页」或「书签」。创建页面后即可在其中添加分类与站点。</p>' +
    '<button type="button" class="btn btn-primary" data-action="add-page">新增第一个页面</button>' +
    '</div>'
  );
}

/* 统计一棵分类子树下的分类与站点数 */
function nodeStats(cats) {
  let catCount = 0;
  let siteCount = 0;
  const walk = (list) => {
    for (const c of list) {
      catCount++;
      siteCount += (c.sites || []).length;
      walk(c.categories || []);
    }
  };
  walk(cats);
  return { cats: catCount, sites: siteCount };
}

function renderTree() {
  const fresh = rebuildIndex();
  nodeIndex.pages = fresh.pages;
  nodeIndex.categories = fresh.categories;
  nodeIndex.sites = fresh.sites;

  // 记录当前焦点(用 data-* 复定位),重渲染后恢复,避免键盘操作被打断。
  const active = document.activeElement;
  let focusSel = null;
  if (active && active.dataset) {
    const { target, id, action } = active.dataset;
    if (target) focusSel = '[data-target="' + CSS.escape(target) + '"]';
    else if (id)
      focusSel =
        '[data-action="' + CSS.escape(action || '') + '"][data-id="' + CSS.escape(id) + '"]';
    else if (action) focusSel = '[data-action="' + CSS.escape(action) + '"]';
  }

  const root = document.getElementById('tree-root');
  const html = state.pages.map((p) => renderPage(p)).join('');
  if (!html) {
    root.innerHTML = emptyTreeHtml();
    updateSearchCount(searchTerm ? '无匹配结果' : '');
    return;
  }
  root.innerHTML = html;

  // 首帧一次性入场,后续重渲染不重复播放
  if (!booted) {
    booted = true;
    root.classList.add('is-entering');
    setTimeout(() => root.classList.remove('is-entering'), 700);
  }

  if (focusSel) {
    const back = root.querySelector(focusSel);
    if (back && !back.disabled) back.focus({ preventScroll: true });
  }
}

function updateSearchCount(text) {
  const el = document.getElementById('tree-search-count');
  if (!el) return;
  el.textContent = text;
}

/* 搜索命中计数:统计可见页面/分类/站点 */
function countMatches() {
  let pages = 0;
  let cats = 0;
  let sites = 0;
  for (const p of state.pages) {
    const pageHit = matches(p.label);
    let pageCounted = pageHit;
    for (const { node: c } of nodeIndex.categories.filter((x) => x.page.id === p.id)) {
      if (matches(c.label) || pageHit) cats++;
    }
    for (const { node: s } of nodeIndex.sites.filter((x) => x.page.id === p.id)) {
      if (matches(s.name) || matches(s.url) || pageHit) sites++;
    }
    if (pageCounted) pages++;
  }
  return { pages, cats, sites };
}

function renderPage(p) {
  const cKey = 'p:' + p.id;
  const isCollapsed = !searchTerm && collapsed.has(cKey);
  const pageMatch = matches(p.label);
  const body = catList(p, p.categories || [], null, pageMatch);
  // 搜索过滤:页面自身或子树命中才显示
  if (searchTerm && !pageMatch && !body) return '';
  const stats = nodeStats(p.categories || []);
  const meta = stats.cats || stats.sites ? stats.cats + ' 分类 · ' + stats.sites + ' 站点' : '';
  return (
    '<section class="page-block" data-type="page" data-id="' +
    esc(p.id) +
    '" draggable="true">' +
    '<div class="page-header">' +
    '<span class="drag-grip" aria-hidden="true"></span>' +
    '<button type="button" class="collapse-btn' +
    (isCollapsed ? ' collapsed' : '') +
    '" data-action="toggle" data-target="' +
    cKey +
    '" aria-expanded="' +
    String(!isCollapsed) +
    '" aria-label="' +
    (isCollapsed ? '展开' : '折叠') +
    ' ' +
    esc(p.label) +
    '"><span class="collapse-caret"></span></button>' +
    '<span class="page-label">' +
    esc(p.label) +
    '</span>' +
    (meta ? '<span class="node-meta">' + meta + '</span>' : '') +
    (p.hidden ? '<span class="badge badge-hidden">隐藏</span>' : '') +
    '<div class="node-actions">' +
    moveBtns('pages', p, state.pages) +
    '<button type="button" class="btn btn-sm" data-action="add-cat" data-page-id="' +
    esc(p.id) +
    '">＋分类</button>' +
    '<button type="button" class="btn btn-sm" data-action="edit-page" data-id="' +
    esc(p.id) +
    '">编辑</button>' +
    '<button type="button" class="btn btn-sm btn-danger" data-action="del-page" data-id="' +
    esc(p.id) +
    '">删除</button>' +
    '</div>' +
    '</div>' +
    (isCollapsed ? '' : body) +
    '</section>'
  );
}

function catList(page, cats, parentId, forceShow) {
  const rendered = cats
    .map((c) => renderCategory(page, c, parentId, forceShow))
    .filter(Boolean)
    .join('');
  if (!rendered) return '';
  return '<div class="cat-list">' + rendered + '</div>';
}

function renderCategory(page, c, parentId, forceShow) {
  const cKey = 'c:' + c.id;
  const isCollapsed = !searchTerm && collapsed.has(cKey);
  const catMatch = matches(c.label);
  const show = forceShow || catMatch;
  const kidCount = (c.categories || []).length + (c.sites || []).length;
  const hasKids = kidCount > 0;
  const childrenInner = catList(page, c.categories || [], c.id, show) + siteList(c, show);
  if (searchTerm && !show && !childrenInner) return '';
  return (
    '<div class="cat-item" data-type="category" data-id="' +
    esc(c.id) +
    '" draggable="true">' +
    '<div class="cat-header">' +
    '<span class="drag-grip" aria-hidden="true"></span>' +
    (hasKids
      ? '<button type="button" class="collapse-btn' +
        (isCollapsed ? ' collapsed' : '') +
        '" data-action="toggle" data-target="' +
        cKey +
        '" aria-expanded="' +
        String(!isCollapsed) +
        '" aria-label="' +
        (isCollapsed ? '展开' : '折叠') +
        ' ' +
        esc(c.label) +
        '"><span class="collapse-caret"></span></button>'
      : '<span class="collapse-btn is-placeholder" aria-hidden="true"></span>') +
    '<span class="cat-label">' +
    esc(c.label) +
    '</span>' +
    (isCollapsed && hasKids ? '<span class="node-meta">' + kidCount + ' 项</span>' : '') +
    (c.foldable ? '<span class="badge badge-foldable">可折叠</span>' : '') +
    '<div class="node-actions">' +
    moveBtns('categories', c, categorySiblings(page, parentId)) +
    '<button type="button" class="btn btn-sm" data-action="add-subcat" data-page-id="' +
    esc(page.id) +
    '" data-parent-id="' +
    esc(c.id) +
    '">＋子分类</button>' +
    '<button type="button" class="btn btn-sm" data-action="add-site" data-category-id="' +
    esc(c.id) +
    '">＋站点</button>' +
    '<button type="button" class="btn btn-sm" data-action="edit-cat" data-id="' +
    esc(c.id) +
    '" data-page-id="' +
    esc(page.id) +
    '">编辑</button>' +
    '<button type="button" class="btn btn-sm btn-danger" data-action="del-cat" data-id="' +
    esc(c.id) +
    '">删除</button>' +
    '</div>' +
    '</div>' +
    (isCollapsed ? '' : childrenInner) +
    '</div>'
  );
}

function siteList(c, forceShow) {
  const sites = (c.sites || []).filter((s) => forceShow || matches(s.name) || matches(s.url));
  // 搜索态下,未命中的空分类不应该把整棵树"撑"出来
  if (!c.sites || !c.sites.length) {
    if (searchTerm && !forceShow) return '';
    return (
      '<div class="site-list"><div class="empty-hint"><span>暂无站点</span>' +
      '<button type="button" class="btn btn-sm" data-action="add-site" data-category-id="' +
      esc(c.id) +
      '">添加站点</button></div></div>'
    );
  }
  if (!sites.length && searchTerm) return '';
  return '<div class="site-list">' + sites.map((s) => renderSite(c, s)).join('') + '</div>';
}

function renderSite(c, s) {
  return (
    '<div class="site-row" data-type="site" data-id="' +
    esc(s.id) +
    '" draggable="true">' +
    '<span class="drag-grip" aria-hidden="true"></span>' +
    faviconHtml(s) +
    '<div class="site-info">' +
    '<div class="site-name">' +
    esc(s.name) +
    '</div>' +
    '<div class="site-url" title="' +
    esc(s.url) +
    '" tabindex="0">' +
    esc(s.url) +
    '</div>' +
    '</div>' +
    (s.external ? '<span class="badge">外链</span>' : '') +
    '<div class="node-actions">' +
    moveBtns('sites', s, siteSiblings(c.id)) +
    '<button type="button" class="btn btn-sm" data-action="edit-site" data-id="' +
    esc(s.id) +
    '">编辑</button>' +
    '<button type="button" class="btn btn-sm btn-danger" data-action="del-site" data-id="' +
    esc(s.id) +
    '">删除</button>' +
    '</div>' +
    '</div>'
  );
}

function faviconHtml(s) {
  const imgSrc = s.faviconUrl || (s.icon && /^https?:/.test(s.icon) ? s.icon : null);
  const fallback = esc((s.name || '?').charAt(0).toUpperCase());
  if (imgSrc) {
    // 加载失败时回退到首字母,而不是留下空白方框
    return (
      '<span class="site-favicon"><img src="' +
      esc(imgSrc) +
      '" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode(this.dataset.fallback))" data-fallback="' +
      fallback +
      '" /></span>'
    );
  }
  return '<span class="site-favicon">' + fallback + '</span>';
}

/* 上移/下移按钮;list 为同层级节点数组(已保证含 node) */
function moveBtns(type, node, list) {
  const idx = list.findIndex((n) => n.id === node.id);
  if (idx < 0) return '';
  const up = idx > 0;
  const down = idx < list.length - 1;
  return (
    '<button type="button" class="btn btn-icon btn-sm" data-action="move-up" data-type="' +
    type +
    '" data-id="' +
    esc(node.id) +
    '" title="上移" aria-label="上移"' +
    (up ? '' : ' disabled') +
    '>' +
    ICON.arrowUp +
    '</button>' +
    '<button type="button" class="btn btn-icon btn-sm" data-action="move-down" data-type="' +
    type +
    '" data-id="' +
    esc(node.id) +
    '" title="下移" aria-label="下移"' +
    (down ? '' : ' disabled') +
    '>' +
    ICON.arrowDown +
    '</button>'
  );
}

/* ---------- 排序 ---------- */
async function reorder(type, id, dir) {
  let list;
  if (type === 'pages') {
    list = state.pages;
  } else if (type === 'categories') {
    const entry = nodeIndex.categories.find((x) => x.node.id === id);
    if (!entry) return;
    list = categorySiblings(entry.page, entry.parent ? entry.parent.id : null);
  } else {
    const entry = nodeIndex.sites.find((x) => x.node.id === id);
    if (!entry) return;
    list = siteSiblings(entry.category.id);
  }
  const idx = list.findIndex((n) => n.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= list.length) return;
  const next = list.slice();
  [next[idx], next[swap]] = [next[swap], next[idx]];
  await submitOrder(type, next);
}

/* 一次提交整组顺序(拖拽与上下移共用) */
async function submitOrder(type, ordered) {
  const items = ordered.map((n, sort) => ({ id: n.id, sort }));
  const r = await api('POST', '/api/reorder', { type, items });
  if (r.ok) {
    toast('已保存排序', 'success');
    await loadState({ silent: true });
  } else {
    toast(writeErr(r), 'error');
  }
}

/* 拖拽落位:把 from 移到 to 的位置(同一父级内) */
async function moveItem(type, fromId, toId) {
  let list;
  if (type === 'sites') {
    const entry = nodeIndex.sites.find((x) => x.node.id === fromId);
    if (!entry) return;
    list = siteSiblings(entry.category.id);
  } else if (type === 'categories') {
    const entry = nodeIndex.categories.find((x) => x.node.id === fromId);
    if (!entry) return;
    list = categorySiblings(entry.page, entry.parent ? entry.parent.id : null);
  } else {
    list = state.pages;
  }
  const from = list.findIndex((n) => n.id === fromId);
  const to = list.findIndex((n) => n.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  await submitOrder(type, next);
}

/* ---------- 弹窗 ---------- */
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
let previousFocus;

function openModal(title, html) {
  if (!modalOverlay.classList.contains('open')) previousFocus = document.activeElement;
  modalEtag = stateEtag;
  modalTitle.textContent = title;
  modalContent.innerHTML = html;
  modalOverlay.classList.add('open');
  document.querySelector('.admin-shell').inert = true;
  document.addEventListener('keydown', modalEsc);
  (
    modalContent.querySelector('input:not([type="hidden"]), select, textarea, button') ||
    modalOverlay.querySelector('.modal-close')
  ).focus();
}

function closeModal() {
  modalEtag = null;
  modalOverlay.classList.remove('open');
  document.querySelector('.admin-shell').inert = false;
  document.removeEventListener('keydown', modalEsc);
  if (previousFocus?.isConnected) previousFocus.focus();
}

function modalEsc(e) {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Tab') {
    const focusable = [
      ...modalOverlay.querySelectorAll('button, input, select, textarea, a[href]'),
    ].filter((node) => !node.disabled && node.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/* 表单字段辅助 */
function formFieldClass(wide) {
  return 'form-field' + (wide ? ' form-field--wide' : '');
}

function textField(name, label, value, placeholder, hint, wide) {
  return (
    '<div class="' +
    formFieldClass(wide) +
    '"><label for="f-' +
    name +
    '">' +
    label +
    '</label><input id="f-' +
    name +
    '" name="' +
    name +
    '" type="text" value="' +
    esc(value || '') +
    '" placeholder="' +
    esc(placeholder || '') +
    '">' +
    (hint ? '<div class="field-hint">' + hint + '</div>' : '') +
    '</div>'
  );
}

function switchField(name, label, checked, wide) {
  return (
    '<div class="form-field form-switch' +
    (wide ? ' form-field--wide' : '') +
    '"><input id="f-' +
    name +
    '" name="' +
    name +
    '" type="checkbox"' +
    (checked ? ' checked' : '') +
    '><label for="f-' +
    name +
    '"><span class="switch-track" aria-hidden="true"></span><span>' +
    label +
    '</span></label></div>'
  );
}

function textareaField(name, label, value, placeholder, hint, wide) {
  return (
    '<div class="' +
    formFieldClass(wide) +
    '"><label for="f-' +
    name +
    '">' +
    label +
    '</label><textarea id="f-' +
    name +
    '" name="' +
    name +
    '" rows="3" placeholder="' +
    esc(placeholder || '') +
    '">' +
    esc(value || '') +
    '</textarea>' +
    (hint ? '<div class="field-hint">' + hint + '</div>' : '') +
    '</div>'
  );
}

function selectField(name, label, options, selected, hint, wide) {
  const opts = options
    .map(
      (o) =>
        '<option value="' +
        esc(o.value) +
        '"' +
        (String(o.value) === String(selected) ? ' selected' : '') +
        '>' +
        esc(o.label) +
        '</option>'
    )
    .join('');
  return (
    '<div class="' +
    formFieldClass(wide) +
    '"><label for="f-' +
    name +
    '">' +
    label +
    '</label><select id="f-' +
    name +
    '" name="' +
    name +
    '">' +
    opts +
    '</select>' +
    (hint ? '<div class="field-hint">' + hint + '</div>' : '') +
    '</div>'
  );
}

function checkField(name, label, checked, wide) {
  return (
    '<div class="form-field form-check' +
    (wide ? ' form-field--wide' : '') +
    '"><input id="f-' +
    name +
    '" name="' +
    name +
    '" type="checkbox"' +
    (checked ? ' checked' : '') +
    '><label for="f-' +
    name +
    '">' +
    label +
    '</label></div>'
  );
}

function formActions(okText) {
  return (
    '<div class="form-error" id="form-error" hidden></div>' +
    '<div class="form-actions">' +
    '<button type="button" class="btn" data-action="modal-close">取消</button>' +
    '<button type="submit" class="btn btn-primary">' +
    (okText || '保存') +
    '</button>' +
    '</div>'
  );
}

function setFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.hidden = !msg;
  const old = el.querySelector('.conflict-retry');
  if (old) old.remove();
  // 并发冲突时提供就地恢复:拉取最新版本并刷新 ETag,保留已填字段后再提交。
  if (msg && /已在其他窗口更新/.test(msg)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm conflict-retry';
    btn.textContent = '载入最新并重试';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await api('GET', '/api/state');
      if (r.ok) {
        state.pages = Array.isArray(r.data) ? r.data : [];
        stateEtag = r.etag;
        modalEtag = r.etag;
        setFormError('');
      } else {
        btn.disabled = false;
        toast(writeErr(r), 'error');
      }
    });
    el.appendChild(btn);
  }
}

/* M11:提交期间禁用按钮 + data-pending 拦截,防双击重复提交 */
async function submitWithGuard(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  if (form.dataset.pending) return;
  const origLabel = btn ? btn.textContent : '';
  form.dataset.pending = '1';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '保存中…';
  }
  try {
    await fn();
  } finally {
    form.dataset.pending = '';
    if (btn) {
      btn.disabled = false;
      btn.textContent = origLabel;
    }
  }
}

/* 规范化站点 URL:缺协议时自动补 https://,减少最常见输入错误 */
function normalizeUrl(value) {
  const v = String(value || '').trim();
  if (!v) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // 已有协议
  return 'https://' + v.replace(/^\/+/, '');
}

/* ---------- 页面 CRUD 表单 ---------- */
function openPageForm(p) {
  const isEdit = !!p;
  openModal(
    isEdit ? '编辑页面' : '新增页面',
    '<form id="node-form" novalidate>' +
      textField('label', '页面名称', p ? p.label : '', '例如:首页', '必填') +
      selectField(
        'template',
        '页面模板',
        [
          { value: '', label: '默认导航页' },
          { value: 'content', label: '正文页' },
          { value: 'bookmarks', label: '书签' },
          { value: 'articles', label: '文章' },
          { value: 'projects', label: '项目' },
        ],
        p?.template || '',
        '「正文页」需要填写下方 Markdown 正文'
      ) +
      textField(
        'title',
        '页面标题',
        p?.metadata?.title || '',
        '',
        '首页标题由站点个人资料设置决定'
      ) +
      textField('subtitle', '页面说明', p?.metadata?.subtitle || '', '') +
      textField('navIcon', '导航图标', p?.navigation?.icon || '', 'fas fa-link') +
      '<div id="markdown-field">' +
      textareaField(
        'markdown',
        '正文（Markdown）',
        p?.metadata?.content?.markdown || '',
        '',
        '正文页会展示此内容'
      ) +
      '</div>' +
      checkField('hidden', '在导航中隐藏（链接和搜索仍可访问）', p ? !!p.hidden : false) +
      formActions(isEdit ? '保存' : '新增')
  );
  const form = document.getElementById('node-form');
  const templateSel = document.getElementById('f-template');
  const markdownField = document.getElementById('markdown-field');
  // 模板联动:仅「正文页」显示并需要 Markdown
  const syncMarkdown = () => {
    const isContent = templateSel.value === 'content';
    markdownField.style.display = isContent ? '' : 'none';
  };
  templateSel.addEventListener('change', syncMarkdown);
  syncMarkdown();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(form, async () => {
      const payload = {
        label: document.getElementById('f-label').value.trim(),
        template: templateSel.value,
        hidden: document.getElementById('f-hidden').checked,
        metadata: {
          ...(p?.metadata || {}),
          title: document.getElementById('f-title').value.trim(),
          subtitle: document.getElementById('f-subtitle').value.trim(),
        },
        navigation: {
          ...(p?.navigation || {}),
          icon: document.getElementById('f-navIcon').value.trim(),
        },
      };
      if (!payload.metadata.title) delete payload.metadata.title;
      if (payload.template === 'content') {
        const markdown = document.getElementById('f-markdown').value;
        if (!markdown.trim()) {
          setFormError('正文页必须填写 Markdown 正文');
          return;
        }
        payload.metadata.content = { markdown };
      } else {
        delete payload.metadata.content;
      }
      if (!payload.label) {
        setFormError('页面名称不能为空');
        return;
      }
      const r = isEdit
        ? await api('PUT', '/api/pages/' + p.id, payload)
        : await api('POST', '/api/pages', payload);
      if (r.ok) {
        toast(isEdit ? '页面已更新' : '页面已新增', 'success');
        closeModal();
        await loadState({ silent: true });
      } else {
        setFormError(writeErr(r));
      }
    });
  });
}

/* ---------- 分类 CRUD 表单 ---------- */
function openCategoryForm(opts) {
  // opts: { pageId, parentId?, edit? }
  const isEdit = !!opts.edit;
  const page = state.pages.find((p) => p.id === opts.pageId) || { id: opts.pageId, categories: [] };
  const parentOptions = buildParentOptions(page, opts.edit);
  const curParentId =
    opts.parentId || (isEdit && opts.edit.parent ? opts.edit.parent.id : '') || ''; // 编辑保留原父级,避免扁平化到顶层
  openModal(
    isEdit ? '编辑分类' : '新增分类',
    '<form id="node-form" novalidate>' +
      textField('label', '分类名称', isEdit ? opts.edit.label : '', '例如:开发工具', '必填') +
      selectField(
        'parentId',
        '父分类',
        parentOptions,
        isEdit ? curParentId : opts.parentId || '',
        '留空表示位于该页面顶层;等级内可自由调整'
      ) +
      checkField('foldable', '可折叠(公开站允许收起)', isEdit ? !!opts.edit.foldable : true) +
      formActions(isEdit ? '保存' : '新增')
  );
  const form = document.getElementById('node-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(form, async () => {
      const label = document.getElementById('f-label').value.trim();
      const parentVal = document.getElementById('f-parentId').value;
      const foldable = document.getElementById('f-foldable').checked;
      if (!label) {
        setFormError('分类名称不能为空');
        return;
      }
      let r;
      if (isEdit) {
        // 编辑总是显式提交父分类:顶层传 null,带父则传父 id(未变时为 no-op)
        r = await api('PUT', '/api/categories/' + opts.edit.id, {
          label,
          foldable,
          parentId: parentVal === '' ? null : parentVal,
        });
      } else {
        r = await api('POST', '/api/categories', {
          pageId: opts.pageId,
          parentId: parentVal === '' ? null : parentVal,
          label,
          foldable,
        });
      }
      if (r.ok) {
        toast(isEdit ? '分类已更新' : '分类已新增', 'success');
        closeModal();
        await loadState({ silent: true });
      } else {
        setFormError(writeErr(r));
      }
    });
  });
}

/* 同一页面内的可选父分类(排除自身与子孙,避免循环);用缩进表达层级 */
function buildParentOptions(page, editCat) {
  const excluded = new Set();
  if (editCat) for (const id of descendantIds(editCat)) excluded.add(id);
  const options = [{ value: '', label: '(无 — 顶层)' }];
  const walk = (cats, depth) => {
    for (const c of cats) {
      if (excluded.has(c.id)) continue;
      const prefix = depth > 0 ? '　'.repeat(depth) + '└ ' : '';
      options.push({ value: c.id, label: prefix + c.label });
      walk(c.categories || [], depth + 1);
    }
  };
  walk(page.categories || [], 0);
  return options;
}

/* ---------- 站点 CRUD 表单 ---------- */
function openSiteForm(opts) {
  // opts: { categoryId, edit? }
  const isEdit = !!opts.edit;
  const s = opts.edit;
  openModal(
    isEdit ? '编辑站点' : '新增站点',
    '<form id="node-form" novalidate>' +
      textField('name', '站点名称', s ? s.name : '', '例如:GitHub', '必填') +
      textField(
        'url',
        '网址',
        s ? s.url : '',
        '例如:https://github.com',
        '必填,缺少协议会自动补 https://'
      ) +
      textField('description', '描述', s && s.description ? s.description : '', '一行简介(可选)') +
      selectField(
        'style',
        '卡片样式',
        [
          { value: '', label: '普通站点' },
          { value: 'repo', label: '仓库卡片' },
        ],
        s?.metadata?.style || ''
      ) +
      selectField(
        'type',
        '卡片类型',
        [
          { value: '', label: '普通站点' },
          { value: 'article', label: '文章卡片' },
        ],
        s?.metadata?.type || ''
      ) +
      checkField('external', '外部链接(新标签页打开)', s ? !!s.external : true) +
      formActions(isEdit ? '保存' : '新增')
  );
  const form = document.getElementById('node-form');
  const urlInput = document.getElementById('f-url');
  urlInput.addEventListener('blur', () => {
    urlInput.value = normalizeUrl(urlInput.value);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(form, async () => {
      const name = document.getElementById('f-name').value.trim();
      const url = normalizeUrl(document.getElementById('f-url').value);
      if (!name || !url) {
        setFormError('名称与网址都是必填项');
        return;
      }
      const metadata = { ...(s?.metadata || {}) };
      for (const [key, id] of [
        ['style', 'f-style'],
        ['type', 'f-type'],
      ]) {
        const value = document.getElementById(id).value;
        if (value) metadata[key] = value;
        else delete metadata[key];
      }
      const payload = {
        name,
        url,
        description: document.getElementById('f-description').value.trim(),
        external: document.getElementById('f-external').checked,
        metadata,
      };
      const r = isEdit
        ? await api('PUT', '/api/sites/' + s.id, payload)
        : await api('POST', '/api/sites', { categoryId: opts.categoryId, ...payload });
      if (r.ok) {
        toast(isEdit ? '站点已更新' : '站点已新增', 'success');
        closeModal();
        await loadState({ silent: true });
      } else {
        setFormError(writeErr(r));
      }
    });
  });
}

function authErr(r) {
  if (r.auth) return '需登录(Cloudflare Access),请刷新页面重新验证。';
  if (r.status === 0) return '无法连接服务器,请检查网络。';
  return '';
}

/* 写操作统一的错误呈现:404 → 提示并刷新;409 级联等特殊分支由调用方先行处理 */
function writeErr(r) {
  if (r.auth || r.status === 0) return authErr(r);
  if (r.error === 'busy') return '请等待当前保存完成';
  if (r.error === 'revision_conflict')
    return '内容已在其他窗口更新。可在弹窗内点「载入最新并重试」保留输入后重新保存。';
  if (r.error === 'unsupported_media_type') return '请求格式不被接受，请刷新页面后重试。';
  if (r.error === 'payload_too_large') return '数据过大，请缩减后重试。';
  if (r.status === 404) {
    setTimeout(() => loadState(), 1200);
    return '该条目不存在或已被删除，即将刷新';
  }
  if (typeof r.detail === 'string') return r.detail;
  return r.error ? '保存失败:' + r.error : '保存失败:未知错误';
}

/* ---------- 删除确认(含级联询问) ---------- */
function openConfirmDialog(message, onConfirm, okText) {
  openModal(
    '确认操作',
    '<div class="confirm-message">' +
      esc(message).replace(/\n/g, '<br>') +
      '</div>' +
      '<div class="form-actions"><button type="button" class="btn" data-action="modal-close">取消</button>' +
      '<button type="button" class="btn btn-danger" id="confirm-btn">' +
      esc(okText || '确认删除') +
      '</button></div>'
  );
  document.getElementById('confirm-btn').addEventListener('click', async () => {
    closeModal();
    try {
      await onConfirm();
    } catch {
      /* 已由内部 toast 处理 */
    }
  });
}

/* 409 级联删除询问(分类/页面) */
function openCascadeConfirm(r, onForce) {
  const detail = r.detail || {};
  let msg = '该节点下仍有内容，无法直接删除：';
  if (r.count != null) msg += '预计 ' + r.count + ' 个子项。';
  if (detail.childCount != null) msg += '子分类 ' + detail.childCount + ' 个；';
  if (detail.siteCount != null) msg += '直接站点 ' + detail.siteCount + ' 个。';
  msg += '\n确定要级联删除整棵子树（含全部后代与站点）吗？此操作不可撤销。';
  openConfirmDialog(msg, onForce, '确认级联删除');
}

/* ---------- 删除实现 ---------- */
async function delPage(id) {
  const r = await api('DELETE', '/api/pages/' + id);
  if (r.ok) {
    toast('页面已删除', 'success');
    await loadState({ silent: true });
  } else if (r.status === 409 && r.count !== undefined) {
    openCascadeConfirm(r, async () => {
      const f = await api('DELETE', '/api/pages/' + id + '?force=1');
      if (f.ok) {
        toast('页面及子树已删除', 'success');
        await loadState({ silent: true });
      } else toast('删除失败:' + writeErr(f), 'error');
    });
  } else {
    toast(writeErr(r), 'error');
  }
}

async function delCategory(id) {
  const r = await api('DELETE', '/api/categories/' + id);
  if (r.ok) {
    toast('分类已删除', 'success');
    await loadState({ silent: true });
  } else if (r.status === 409 && r.detail && typeof r.detail === 'object') {
    openCascadeConfirm(r, async () => {
      const f = await api('DELETE', '/api/categories/' + id + '?force=1');
      if (f.ok) {
        toast('分类及子树已删除', 'success');
        await loadState({ silent: true });
      } else toast('删除失败:' + writeErr(f), 'error');
    });
  } else {
    toast(writeErr(r), 'error');
  }
}

async function delSite(id) {
  const r = await api('DELETE', '/api/sites/' + id);
  if (r.ok) {
    toast('站点已删除', 'success');
    await loadState({ silent: true });
  } else {
    toast(writeErr(r), 'error');
  }
}

/* ---------- 立即发布 ---------- */
async function publish() {
  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.textContent = '发布中…';
  try {
    const r = await api('POST', '/api/rebuild');
    if (r.ok) {
      toast(
        r.queued
          ? '已开始构建，发布状态将自动更新'
          : r.pending
            ? '已有构建正在进行，新修改将随后发布'
            : '当前没有待发布变更',
        'success'
      );
    } else if (r.status === 501 && r.detail) {
      toast('发布未生效:' + r.detail + '。变更已保留,配置后重试。', 'error');
    } else {
      toast(writeErr(r), 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '立即发布';
    await loadPublishStatus();
  }
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '';
  const m = Math.round(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' 小时前';
  return Math.round(h / 24) + ' 天前';
}

async function loadPublishStatus() {
  clearTimeout(statusTimer);
  const panel = document.getElementById('publish-status');
  const r = await api('GET', '/api/publish-status');
  if (!r.ok) {
    const msg = '发布状态暂不可用：' + writeErr(r);
    if (panel.dataset.msg !== msg) {
      panel.dataset.msg = msg;
      panel.textContent = msg;
    }
    statusTimer = setTimeout(loadPublishStatus, 15000);
    return;
  }
  const labels = {
    dispatching: '正在创建构建',
    building: '正在发布',
    published: '已发布',
    failed: '发布失败',
  };
  // 人类语言:强调「有没有未发布改动」与「正在发布的是不是最新」
  let message;
  if (r.job && ['building', 'dispatching'].includes(r.job.status)) {
    message = r.pending ? '正在发布…（你最近的修改将在下一轮发布）' : '正在发布…';
  } else if (r.pending) {
    message = '有未发布的修改';
  } else {
    message = '已是最新';
  }
  if (r.job && r.job.status === 'failed') message = '发布失败：' + (r.job.error || '请重试');
  if (!r.wired) message += ' · 尚未配置发布服务';
  if (r.reconcileError) message += ' · 状态核对暂时不可用';
  if (panel.dataset.msg !== message) {
    panel.dataset.msg = message;
    panel.textContent = message;
  }
  const old = panel.querySelector('.publish-links');
  if (old) old.remove();
  const links = document.createElement('span');
  links.className = 'publish-links';
  if (r.job?.status === 'failed') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-sm';
    retry.dataset.action = 'publish';
    retry.textContent = '重新发布';
    links.append(' ', retry);
  }
  if (r.job?.url) {
    const link = document.createElement('a');
    link.href = r.job.url;
    link.textContent = '查看本次发布';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(' · ', link);
  }
  panel.appendChild(links);
  statusTimer = setTimeout(
    loadPublishStatus,
    r.job && ['building', 'dispatching'].includes(r.job.status) ? 10000 : 60000
  );
}

/* 站点设置的分组卡片：短字段自动并排，长字段占满一行。 */
function settingsCard(title, body, columns) {
  return (
    '<section class="settings-card">' +
    '<header class="settings-card-head"><h3>' +
    esc(title) +
    '</h3></header>' +
    '<div class="settings-grid' +
    (columns === 3 ? ' settings-grid--three' : '') +
    '">' +
    body +
    '</div></section>'
  );
}

/* 数字字段(留空表示不修改) */
function numberField(name, label, value, placeholder, hint, wide) {
  return (
    '<div class="' +
    formFieldClass(wide) +
    '"><label for="f-' +
    name +
    '">' +
    label +
    '</label><input id="f-' +
    name +
    '" name="' +
    name +
    '" type="number" min="0" value="' +
    esc(value == null ? '' : value) +
    '" placeholder="' +
    esc(placeholder || '') +
    '">' +
    (hint ? '<div class="field-hint">' + hint + '</div>' : '') +
    '</div>'
  );
}

/* 站点级配置(身份/外观/字体/资料/社交/安全/RSS/GitHub)的可视化编辑。 */
let settingsCache = null;
let settingsEtag = null;

async function loadSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  const r = await api('GET', '/api/settings');
  if (r.ok) {
    settingsCache = r;
    settingsEtag = r.etag || null;
  }
  return r;
}

async function openSiteConfig() {
  showSiteConfigPage();
  const content = document.getElementById('site-config-content');
  content.innerHTML = '<p class="field-hint">正在加载站点配置…</p>';
  const r = await loadSettings(true);
  if (!r.ok) {
    content.innerHTML = '<p class="form-error">' + esc(writeErr(r)) + '</p>';
    return;
  }
  let site = {};
  let assets = {};
  try {
    site = JSON.parse(r.site || '{}');
  } catch {
    content.innerHTML = '<p class="form-error">站点配置格式损坏，请先导出备份并修复后再保存。</p>';
    return;
  }
  try {
    assets = JSON.parse(r.assets || '{}');
  } catch {
    content.innerHTML = '<p class="form-error">图片资源格式损坏，请先导出备份并修复后再保存。</p>';
    return;
  }
  const theme = site.theme || {};
  const icons = site.icons || {};
  const profile = site.profile || {};
  const fonts = site.fonts || {};
  const security = site.security || {};
  const rss = site.rss || {};
  const rssArticles = rss.articles || {};
  const rssFetch = rss.fetch || {};
  const gh = site.github || {};
  const social = Array.isArray(site.social) ? site.social : [];
  const schemes = Array.isArray(security.allowedSchemes) ? security.allowedSchemes : [];
  const assetOptions = Object.keys(assets).map((key) => ({ value: key, label: key }));
  const faviconOptions = [{ value: '', label: '(使用默认 menav.svg)' }].concat(assetOptions);
  const logoOptions = [{ value: '', label: '(不设置)' }].concat(assetOptions);

  document.getElementById('site-config-content').innerHTML =
    '<form id="site-config-form" novalidate>' +
    settingsCard(
      '站点身份',
      textField('sc-title', '站点标题', site.title, '例如：我的导航') +
        textField('sc-author', '作者', site.author, '') +
        textField('sc-description', '站点描述', site.description, 'meta description', '', true) +
        textField('sc-logo-text', '侧栏 Logo 文字', site.logo_text, '', '', true) +
        selectField(
          'sc-favicon',
          '站点图标',
          faviconOptions,
          site.favicon || '',
          '只能选择站点已有的图片资源（避免发布后 404）'
        ) +
        selectField(
          'sc-logo',
          'Logo 图片',
          logoOptions,
          site.logo || '',
          '侧栏品牌图，优先于站点图标；只能选择已有资源'
        )
    ) +
    settingsCard(
      'SEO 与页脚',
      textField('sc-keywords', '关键词', site.keywords, 'meta keywords，逗号分隔') +
        textField('sc-footer', '页脚文字', site.footer, '显示在侧栏底部')
    ) +
    settingsCard(
      '外观',
      selectField(
        'sc-theme',
        '默认外观',
        [
          { value: 'system', label: '跟随系统' },
          { value: 'dark', label: '深色' },
          { value: 'light', label: '浅色' },
        ],
        theme.mode || 'system'
      ) +
        selectField(
          'sc-icons-region',
          'favicon 服务区域',
          [
            { value: 'com', label: '国外（优先 gstatic.com）' },
            { value: 'cn', label: '国内（优先 gstatic.cn）' },
          ],
          icons.region || 'com',
          '自动获取 favicon，失败时使用内置图标'
        ),
      2
    ) +
    settingsCard(
      '个人资料（首页）',
      textField('sc-profile-title', '首页主标题', profile.title, '会覆盖首页页面标题') +
        textField('sc-profile-subtitle', '首页副标题', profile.subtitle, '')
    ) +
    settingsCard(
      '字体',
      selectField(
        'sc-fonts-source',
        '字体来源',
        [
          { value: 'system', label: '系统字体' },
          { value: 'css', label: '自定义 CSS' },
          { value: 'google', label: 'Google Fonts' },
        ],
        fonts.source || 'system'
      ) +
        textField('sc-fonts-family', '字体族', fonts.family, '例如：Inter') +
        textField('sc-fonts-weight', '字重', fonts.weight, '例如：400') +
        textField(
          'sc-fonts-css-url',
          '字体 CSS 地址',
          fonts.cssUrl,
          'https://…',
          '来源为 CSS 时使用',
          true
        ) +
        switchField('sc-fonts-preload', '预加载字体 CSS（非阻塞）', fonts.preload === true, true),
      3
    ) +
    settingsCard(
      '社交链接',
      textareaField(
        'sc-social',
        '每行一个：名称 | URL | 图标',
        social.map((s) => [s.name || '', s.url || '', s.icon || ''].join(' | ')).join('\n'),
        'GitHub | https://github.com/me | fab fa-github',
        '',
        true
      )
    ) +
    settingsCard(
      '外链安全',
      textField(
        'sc-schemes',
        '允许的链接协议（逗号分隔）',
        schemes.join(', '),
        'https, http, mailto',
        '留空或不含 http 会让公开站的链接降级为 #，请谨慎收窄',
        true
      )
    ) +
    settingsCard(
      'RSS 文章',
      switchField('sc-rss-enabled', '启用 RSS 抓取', rss.enabled === true, true) +
        numberField('sc-rss-per-site', '每源文章数', rssArticles.perSite, '留空用默认') +
        numberField('sc-rss-total', '文章总数上限', rssArticles.total, '留空用默认') +
        numberField('sc-rss-summary', '摘要最大长度', rssArticles.summaryMaxLength, '留空用默认'),
      3
    ) +
    settingsCard(
      'RSS 抓取参数',
      numberField('sc-rss-timeout', '单次请求超时（毫秒）', rssFetch.timeoutMs, '默认 10000') +
        numberField(
          'sc-rss-total-timeout',
          '总超时（毫秒）',
          rssFetch.totalTimeoutMs,
          '默认 60000'
        ) +
        numberField('sc-rss-concurrency', '并发数', rssFetch.concurrency, '默认 5') +
        numberField('sc-rss-retries', '最大重试次数', rssFetch.maxRetries, '默认 1') +
        numberField('sc-rss-redirects', '最大重定向', rssFetch.maxRedirects, '默认 3'),
      3
    ) +
    settingsCard(
      'GitHub 贡献图',
      textField('sc-gh-username', 'GitHub 用户名', gh.username, '用于贡献热力图') +
        textField('sc-gh-color', '热力图主题色', gh.heatmapColor, '如 4f8ff7（不带 #）')
    ) +
    '<div class="form-error" id="form-error" hidden></div>' +
    '</form>';

  showSiteConfigPage();
  const form = document.getElementById('site-config-form');
  const val = (name) => {
    const el = document.getElementById('f-' + name);
    return el ? el.value.trim() : '';
  };
  const checked = (name) => document.getElementById('f-' + name).checked;
  const numOrUndef = (name) => (val(name) === '' ? undefined : Number(val(name)));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(form, async () => {
      const socialItems = val('sc-social')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, url, icon] = line.split('|').map((part) => (part || '').trim());
          return icon ? { name, url, icon } : { name, url };
        });
      const allowedSchemes = val('sc-schemes')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const perSite = numOrUndef('sc-rss-per-site');
      const total = numOrUndef('sc-rss-total');
      const summaryMaxLength = numOrUndef('sc-rss-summary');
      const fetchPatch = {};
      for (const [key, id] of [
        ['timeoutMs', 'sc-rss-timeout'],
        ['totalTimeoutMs', 'sc-rss-total-timeout'],
        ['concurrency', 'sc-rss-concurrency'],
        ['maxRetries', 'sc-rss-retries'],
        ['maxRedirects', 'sc-rss-redirects'],
      ]) {
        const value = numOrUndef(id);
        if (value !== undefined) fetchPatch[key] = value;
      }
      const patch = {
        title: val('sc-title'),
        description: val('sc-description'),
        author: val('sc-author'),
        logo_text: val('sc-logo-text'),
        keywords: val('sc-keywords'),
        footer: val('sc-footer'),
        logo: val('sc-logo') || null,
        theme: { mode: val('sc-theme') },
        icons: { mode: 'favicon', region: val('sc-icons-region') },
        profile: { title: val('sc-profile-title'), subtitle: val('sc-profile-subtitle') },
        fonts: {
          source: val('sc-fonts-source'),
          cssUrl: val('sc-fonts-css-url'),
          family: val('sc-fonts-family'),
          weight: val('sc-fonts-weight'),
          preload: checked('sc-fonts-preload'),
        },
        social: socialItems,
        security: { allowedSchemes },
        rss: {
          enabled: checked('sc-rss-enabled'),
          articles: {
            ...(perSite !== undefined ? { perSite } : {}),
            ...(total !== undefined ? { total } : {}),
            ...(summaryMaxLength !== undefined ? { summaryMaxLength } : {}),
          },
          ...(Object.keys(fetchPatch).length
            ? { fetch: { ...(site.rss?.fetch || {}), ...fetchPatch } }
            : {}),
        },
        github: { username: val('sc-gh-username'), heatmapColor: val('sc-gh-color') },
      };
      patch.favicon = val('sc-favicon');
      const res = await api('PUT', '/api/settings/site', patch, settingsEtag);
      if (res.ok) {
        settingsCache = null;
        if (res.etag) {
          settingsEtag = res.etag;
          stateEtag = res.etag;
        }
        toast('站点设置已保存', 'success');
      } else {
        setFormError(writeErr(res));
      }
    });
  });
}

const treePage = document.getElementById('tree-page');
const dataPage = document.getElementById('data-page');
const siteConfigPage = document.getElementById('site-config-page');

function setSideNav(action) {
  document.querySelectorAll('.side-link').forEach((link) => {
    const active = link.dataset.action === action;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function showPage(page) {
  treePage.hidden = page !== 'tree';
  dataPage.hidden = page !== 'data';
  siteConfigPage.hidden = page !== 'site-config';
  setSideNav(page === 'tree' ? 'show-tree' : page === 'data' ? 'data-page' : 'open-site-config');
  if (page === 'data') dataPage.querySelector('h1')?.focus();
  else if (page === 'site-config') siteConfigPage.querySelector('h1')?.focus();
  else document.getElementById('tree-search')?.focus();
}

function showDataPage() {
  showPage('data');
}

function showTreePage() {
  showPage('tree');
}

function showSiteConfigPage() {
  showPage('site-config');
}

async function openSettings() {
  const r = await api('GET', '/api/settings');
  if (!r.ok) {
    toast(writeErr(r), 'error');
    return;
  }
  let site;
  try {
    site = JSON.parse(r.site || '{}');
  } catch {
    toast('站点配置格式无效', 'error');
    return;
  }
  openModal(
    '当前配置',
    '<p class="field-hint">以下为当前生效的站点配置。</p>' +
      '<pre class="settings-json">' +
      esc(JSON.stringify(site, null, 2)) +
      '</pre>'
  );
}

async function exportSnapshot() {
  const r = await api('GET', '/api/export');
  if (!r.ok) {
    toast(writeErr(r), 'error');
    return;
  }
  const { schemaVersion, revision, updatedAt, settings, pages } = r;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ schemaVersion, revision, updatedAt, settings, pages }, null, 2)], {
      type: 'application/json',
    })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'menav-backup-v' + revision + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出备份 menav-backup-v' + revision + '.json', 'success');
}

function openSeedImport() {
  const replacing = state.pages.length > 0;
  openModal(
    '导入备份 JSON',
    '<form id="seed-form" novalidate>' +
      '<p class="field-hint">选择备份 JSON（最多 16 MB）。这是一次<strong>全站替换</strong>：现有页面、分类、站点与配置都会被覆盖，且不可撤销。导入成功后需发布才会更新公开站。</p>' +
      '<div class="form-field"><label for="seed-file">数据文件</label><input id="seed-file" type="file" accept=".json,application/json" required></div>' +
      '<p id="seed-preview" role="status"></p>' +
      (replacing ? checkField('reset', '我已确认：替换全部现有页面、站点和配置', false) : '') +
      formActions('导入并替换') +
      '</form>'
  );
  const form = document.getElementById('seed-form');
  let seed;
  document.getElementById('seed-file').addEventListener('change', async (event) => {
    seed = undefined;
    setFormError('');
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 16_000_000) {
      setFormError('文件超过 16 MB');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.pages) || !parsed.pages.length)
        throw new Error('数据文件必须包含非空 pages 数组');
      seed = parsed;
      document.getElementById('seed-preview').textContent =
        '已读取 ' + file.name + '，包含 ' + seed.pages.length + ' 个页面。';
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '无法读取数据文件');
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithGuard(form, async () => {
      if (!seed) {
        setFormError('请先选择有效的数据文件');
        return;
      }
      if (replacing && !document.getElementById('f-reset').checked) {
        setFormError('请先勾选确认替换现有数据');
        return;
      }
      const r = await api('POST', '/api/seed' + (replacing ? '?reset=1' : ''), seed);
      if (!r.ok) {
        setFormError(writeErr(r));
        return;
      }
      toast('已导入 ' + r.pages + ' 个页面、' + r.sites + ' 个站点', 'success');
      settingsCache = null;
      settingsEtag = null;
      if (r.etag) stateEtag = r.etag;
      closeModal();
      await loadState({ silent: true });
    });
  });
}

/* ---------- 书签导入 ---------- */
/* 统计 bookmarks 页当前内容,用于导入前的破坏性确认 */
function bookmarksPageStats() {
  const page = state.pages.find((p) => p.id === 'bookmarks');
  if (!page) return { cats: 0, sites: 0 };
  let cats = 0;
  let sites = 0;
  const walk = (list) => {
    for (const c of list) {
      cats++;
      sites += (c.sites || []).length;
      walk(c.categories || []);
    }
  };
  walk(page.categories || []);
  return { cats, sites };
}

function openImport() {
  openModal(
    '导入书签',
    '<form id="import-form" novalidate>' +
      '<div class="import-drop" id="import-drop" role="button" tabindex="0">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>' +
      '<span class="import-drop-title">拖拽书签文件到这里</span>' +
      '<span class="import-drop-sub">或点击选择 .html 文件</span>' +
      '</div>' +
      '<input type="file" id="import-file" accept=".html,.htm,text/html" hidden>' +
      textareaField(
        'bookmark',
        '或手动粘贴书签 HTML(Netscape 格式)',
        '',
        '粘贴导出文件内容',
        '支持 Chrome / Firefox / Safari 导出的书签 HTML，最多 8 MB。导入会<strong>替换「书签」页的现有内容</strong>，其他页面保持不变。'
      ) +
      formActions('开始导入')
  );
  const drop = document.getElementById('import-drop');
  const fileInput = document.getElementById('import-file');
  const textarea = document.getElementById('f-bookmark');

  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
  });
  // 全局兜底:吞掉落到窗口其它位置的拖拽,避免浏览器直接打开文件卸载页面
  const swallow = (e) => e.preventDefault();
  document.addEventListener('dragover', swallow);
  document.addEventListener('drop', swallow);
  document.addEventListener('dragend', () => {
    document.removeEventListener('dragover', swallow);
    document.removeEventListener('drop', swallow);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) loadFile(fileInput.files[0]);
  });

  function loadFile(file) {
    if (file.size > 8_000_000) {
      setFormError('文件超过 8 MB，请缩减后再导入');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      textarea.value = reader.result;
      toast('已读取 ' + file.name + ',可确认后导入', 'success');
    };
    reader.readAsText(file);
  }

  const importForm = document.getElementById('import-form');
  importForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(importForm, async () => {
      const html = textarea.value.trim();
      if (!html) {
        setFormError('请先粘贴书签 HTML 或选择文件');
        return;
      }
      const stats = bookmarksPageStats();
      const doImport = async () => {
        const r = await api('POST', '/api/bookmarks', { html });
        if (r.ok) {
          let msg =
            '已导入 ' +
            (r.categories != null ? r.categories : 0) +
            ' 个分类、' +
            (r.sites != null ? r.sites : 0) +
            ' 个站点';
          if (r.truncated > 0) msg += '(另有 ' + r.truncated + ' 个超 4 层文件夹被截断)';
          msg += ',建议「立即发布」使公开站生效';
          toast(msg, 'success');
          closeModal();
          await loadState({ silent: true });
        } else {
          setFormError(writeErr(r));
        }
      };
      // 破坏性替换:先确认当前「书签」页将被清空
      if (stats.cats > 0 || stats.sites > 0) {
        closeModal();
        openConfirmDialog(
          '导入会替换「书签」页的现有内容：当前有 ' +
            stats.cats +
            ' 个分类、' +
            stats.sites +
            ' 个站点将被删除并重建，此操作不可撤销。\n建议先「导出备份」。',
          doImport,
          '确认导入并替换'
        );
      } else {
        await doImport();
      }
    });
  });
}

/* ---------- 主题切换 ---------- */
function initTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  // 首帧主题已在 index.html 的内联脚本中落定,这里只同步按钮图标与交互。
  syncIcon();
  btn.addEventListener('click', () => {
    const light = document.documentElement.classList.toggle('light-theme');
    localStorage.setItem('admin-theme', light ? 'light' : 'dark');
    syncIcon();
  });
  function syncIcon() {
    const light = document.documentElement.classList.contains('light-theme');
    // 图标表达「点击后会切到哪一侧」,而非当前主题
    btn.innerHTML = light ? ICON.moon : ICON.sun;
    const label = light ? '切换到深色主题' : '切换到浅色主题';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
}

/* ---------- 侧栏导航高亮(跟随滚动位置) ---------- */
function initNavSpy() {
  const items = Array.from(document.querySelectorAll('.side-link[data-nav]'))
    .map((link) => ({ link, target: document.querySelector(link.getAttribute('href')) }))
    .filter((item) => item.target);
  if (!items.length) return;
  const sync = () => {
    let current = items[0].target;
    for (const item of items) {
      if (item.target.getBoundingClientRect().top <= 140) current = item.target;
    }
    for (const item of items) item.link.classList.toggle('is-active', item.target === current);
  };
  sync();
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
}

/* ---------- 搜索 ---------- */
function clearSearch() {
  const input = document.getElementById('tree-search');
  const clear = document.getElementById('tree-search-clear');
  if (input) input.value = '';
  searchTerm = '';
  if (clear) clear.hidden = true;
  updateSearchCount('');
  renderTree();
  input?.focus();
}

function bindSearch() {
  const input = document.getElementById('tree-search');
  const clear = document.getElementById('tree-search-clear');
  if (!input) return;
  input.addEventListener('input', () => {
    searchTerm = input.value.trim().toLowerCase();
    clear.hidden = !searchTerm;
    renderTree();
    if (searchTerm) {
      const { pages, cats, sites } = countMatches();
      updateSearchCount(
        pages + cats + sites === 0
          ? '无匹配结果'
          : '匹配 ' + pages + ' 页 / ' + cats + ' 分类 / ' + sites + ' 站点'
      );
    } else {
      updateSearchCount('');
    }
  });
  clear.addEventListener('click', clearSearch);
}

/* ---------- 拖拽排序 ---------- */
function bindDnD() {
  let dragType = null;
  let dragId = null;
  document.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.(
      '.site-row[draggable], .cat-item[draggable], .page-block[draggable]'
    );
    if (!row) return;
    dragType =
      row.dataset.type === 'category'
        ? 'categories'
        : row.dataset.type === 'page'
          ? 'pages'
          : 'sites';
    dragId = row.dataset.id;
    row.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragend', (e) => {
    e.target.closest?.('.dragging')?.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    dragType = null;
    dragId = null;
  });
  document.addEventListener('dragover', (e) => {
    if (!dragId) return;
    const target = e.target.closest?.('[data-type]');
    if (
      !target ||
      target.dataset.type !==
        (dragType === 'categories' ? 'category' : dragType === 'pages' ? 'page' : 'site')
    )
      return;
    e.preventDefault();
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    target.classList.add('drop-target');
  });
  document.addEventListener('drop', async (e) => {
    if (!dragId) return;
    const target = e.target.closest?.('[data-type]');
    if (!target) return;
    e.preventDefault();
    const toId = target.dataset.id;
    if (toId && toId !== dragId) await moveItem(dragType, dragId, toId);
    dragId = null;
  });
}

/* ---------- 全局事件委托 ---------- */
function bindEvents() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    switch (action) {
      case 'modal-close':
        closeModal();
        break;
      case 'toggle': {
        const key = btn.dataset.target;
        if (collapsed.has(key)) collapsed.delete(key);
        else collapsed.add(key);
        renderTree();
        break;
      }
      case 'refresh':
        await loadState();
        break;
      case 'clear-search':
        clearSearch();
        break;
      case 'publish':
        await publish();
        break;
      case 'import':
      case 'open-import':
        openImport();
        break;
      case 'site-config':
      case 'open-site-config':
        await openSiteConfig();
        break;
      case 'data-page':
        showDataPage();
        break;
      case 'show-tree':
        showTreePage();
        break;
      case 'save-site-config': {
        const form = document.getElementById('site-config-form');
        if (form) form.requestSubmit();
        else toast('站点配置还在加载，请稍候', 'error');
        break;
      }
      case 'cancel-site-config':
        showTreePage();
        break;
      case 'settings':
      case 'open-settings':
        await openSettings();
        break;
      case 'export':
      case 'export-backup':
        await exportSnapshot();
        break;
      case 'seed':
        openSeedImport();
        break;
      case 'add-page':
        openPageForm(null);
        break;
      case 'edit-page':
        openPageForm(state.pages.find((p) => p.id === btn.dataset.id));
        break;
      case 'del-page':
        openConfirmDialog(
          '确定删除页面「' +
            (state.pages.find((p) => p.id === btn.dataset.id)?.label || '') +
            '」？（若含子项将询问级联）',
          () => delPage(btn.dataset.id)
        );
        break;
      case 'add-cat':
        openCategoryForm({ pageId: btn.dataset.pageId });
        break;
      case 'add-subcat':
        openCategoryForm({ pageId: btn.dataset.pageId, parentId: btn.dataset.parentId });
        break;
      case 'edit-cat': {
        const entry = nodeIndex.categories.find((x) => x.node.id === btn.dataset.id);
        if (entry)
          openCategoryForm({
            pageId: entry.page.id,
            parentId: entry.parent ? entry.parent.id : null,
            edit: entry.node,
          });
        break;
      }
      case 'del-cat': {
        const entry = nodeIndex.categories.find((x) => x.node.id === btn.dataset.id);
        const name = entry ? entry.node.label : '';
        openConfirmDialog('确定删除分类「' + name + '」？（若含子项将询问级联）', () =>
          delCategory(btn.dataset.id)
        );
        break;
      }
      case 'add-site':
        openSiteForm({ categoryId: btn.dataset.categoryId });
        break;
      case 'edit-site': {
        const entry = nodeIndex.sites.find((x) => x.node.id === btn.dataset.id);
        if (entry) openSiteForm({ categoryId: entry.category.id, edit: entry.node });
        break;
      }
      case 'del-site': {
        const entry = nodeIndex.sites.find((x) => x.node.id === btn.dataset.id);
        const name = entry ? entry.node.name : '';
        openConfirmDialog('确定删除站点「' + name + '」？此操作不可撤销', () =>
          delSite(btn.dataset.id)
        );
        break;
      }
      case 'move-up':
        await reorder(btn.dataset.type, btn.dataset.id, -1);
        break;
      case 'move-down':
        await reorder(btn.dataset.type, btn.dataset.id, 1);
        break;
      default:
        break;
    }
  });
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavSpy();
  bindEvents();
  bindSearch();
  bindDnD();
  loadState();
  setTimeout(() => {
    void loadSettings();
  }, 1200);
});

// 便于调试:控制台访问当前树
window.__menavAdmin = { getState: () => state };
