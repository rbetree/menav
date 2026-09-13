'use strict';

/* ============================================================
   menav 动态后台管理前端(形态二)
   纯原生 JS,无任何 UI 框架 / 构建步骤。
   - 渲染 页面 → 分类(可嵌套) → 站点 树
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
const collapsed = new Set(); // 'p:<id>' / 'c:<id>',折叠状态记忆
const nodeIndex = { pages: [], categories: [], sites: [] };

/* ---------- 小工具 ---------- */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(msg, kind = 'info') {
  const box = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' is-' + kind : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function showStatus(kind, text, opts) {
  const el = document.getElementById('status');
  const icon = el.querySelector('.status-icon');
  const txt = el.querySelector('.status-text');
  el.className = 'status-notice' + (kind === 'error' ? ' is-error' : '');
  const icons = { loading: '⏳', error: '⚠️', empty: '🗂️', offline: '📡' };
  icon.textContent = icons[kind] || 'ℹ️';
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
  document.getElementById('tree-root').innerHTML = '';
}

function hideStatus() {
  document.getElementById('status').hidden = true;
}

/* ---------- API 封装 ---------- */
/* 404 意味着该条目已被删除或不存在(常见于编辑窗口打开期间数据被其他端改动),统一提示并刷新 */
function isNotFound(r) {
  return !r.ok && !r.auth && r.status === 404;
}

async function api(method, path, body) {
  const opts = { method, credentials: 'include', headers: {} };
  const mutation = method !== 'GET' && path !== '/api/rebuild';
  if (mutation && mutationPending)
    return { ok: false, status: 409, error: 'busy', detail: '请等待当前保存完成' };
  if (mutation) {
    const etag = modalEtag || stateEtag;
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
async function loadState() {
  showStatus('loading', '正在加载站点模型…');
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
  renderTree();
  await loadPublishStatus();
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
function renderTree() {
  const fresh = rebuildIndex();
  nodeIndex.pages = fresh.pages;
  nodeIndex.categories = fresh.categories;
  nodeIndex.sites = fresh.sites;

  const root = document.getElementById('tree-root');
  if (state.pages.length === 0) {
    root.innerHTML =
      '<div class="status-notice"><span class="status-icon">🗂️</span><span class="status-text">还没有任何页面,点击右上角「新增页面」开始。</span></div>';
    return;
  }
  root.innerHTML = state.pages.map((p) => renderPage(p)).join('');
}

function renderPage(p) {
  const cKey = 'p:' + p.id;
  const isCollapsed = collapsed.has(cKey);
  return (
    '<section class="page-block" data-type="page" data-id="' +
    esc(p.id) +
    '">' +
    '<div class="page-header">' +
    '<button type="button" class="collapse-btn' +
    (isCollapsed ? ' collapsed' : '') +
    '" data-action="toggle" data-target="' +
    cKey +
    '" aria-label="折叠"><span class="collapse-caret">▾</span></button>' +
    '<span class="page-label">' +
    esc(p.label) +
    '</span>' +
    (p.hidden ? '<span class="badge badge-hidden">隐藏</span>' : '') +
    '<div class="node-actions">' +
    '<span class="action-label">页面</span>' +
    moveBtns('pages', p, state.pages) +
    '<button type="button" class="btn btn-sm" data-action="add-cat" data-page-id="' +
    esc(p.id) +
    '">+分类</button>' +
    '<button type="button" class="btn btn-sm" data-action="edit-page" data-id="' +
    esc(p.id) +
    '">编辑</button>' +
    '<button type="button" class="btn btn-sm btn-danger" data-action="del-page" data-id="' +
    esc(p.id) +
    '">删除</button>' +
    '</div>' +
    '</div>' +
    (isCollapsed ? '' : catList(p, p.categories || [], null)) +
    '</section>'
  );
}

function catList(page, cats, parentId) {
  if (!cats.length) return '';
  return (
    '<div class="cat-list">' +
    cats.map((c) => renderCategory(page, c, parentId)).join('') +
    '</div>'
  );
}

function renderCategory(page, c, parentId) {
  const cKey = 'c:' + c.id;
  const isCollapsed = collapsed.has(cKey);
  const hasKids = (c.categories && c.categories.length > 0) || (c.sites && c.sites.length > 0);
  const children =
    catList(page, c.categories || [], c.id) +
    '<div class="site-list">' +
    (c.sites && c.sites.length
      ? c.sites.map((s) => renderSite(c, s)).join('')
      : '<div class="empty-hint">暂无站点</div>') +
    '</div>';
  return (
    '<div class="cat-item" data-type="category" data-id="' +
    esc(c.id) +
    '">' +
    '<div class="cat-header">' +
    (hasKids
      ? '<button type="button" class="collapse-btn' +
        (isCollapsed ? ' collapsed' : '') +
        '" data-action="toggle" data-target="' +
        cKey +
        '" aria-label="折叠"><span class="collapse-caret">▾</span></button>'
      : '<span class="collapse-btn" aria-hidden="true" style="visibility:hidden"></span>') +
    '<span class="cat-label">' +
    esc(c.label) +
    '</span>' +
    (c.foldable ? '<span class="badge badge-foldable">可折叠</span>' : '') +
    '<div class="node-actions">' +
    '<span class="action-label">分类</span>' +
    moveBtns('categories', c, categorySiblings(page, parentId)) +
    '<button type="button" class="btn btn-sm" data-action="add-subcat" data-page-id="' +
    esc(page.id) +
    '" data-parent-id="' +
    esc(c.id) +
    '">+分类</button>' +
    '<button type="button" class="btn btn-sm" data-action="add-site" data-category-id="' +
    esc(c.id) +
    '">+站点</button>' +
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
    (isCollapsed ? '' : children) +
    '</div>'
  );
}

function renderSite(c, s) {
  return (
    '<div class="site-row" data-type="site" data-id="' +
    esc(s.id) +
    '">' +
    faviconHtml(s) +
    '<div class="site-info">' +
    '<div class="site-name">' +
    esc(s.name) +
    '</div>' +
    '<div class="site-url" title="' +
    esc(s.url) +
    '">' +
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
  if (imgSrc) {
    return (
      '<span class="site-favicon"><img src="' +
      esc(imgSrc) +
      '" alt="" loading="lazy" onerror="this.remove()" /></span>'
    );
  }
  return '<span class="site-favicon">' + esc((s.name || '?').charAt(0).toUpperCase()) + '</span>';
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
    '" title="上移"' +
    (up ? '' : ' disabled') +
    '>↑</button>' +
    '<button type="button" class="btn btn-icon btn-sm" data-action="move-down" data-type="' +
    type +
    '" data-id="' +
    esc(node.id) +
    '" title="下移"' +
    (down ? '' : ' disabled') +
    '>↓</button>'
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
  const items = next.map((n, sort) => ({ id: n.id, sort }));
  const r = await api('POST', '/api/reorder', { type, items });
  if (r.ok) {
    toast('已保存排序', 'success');
    await loadState();
  } else {
    toast(writeErr(r), 'error');
  }
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
  document.getElementById('theme-toggle').inert = true;
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
  document.getElementById('theme-toggle').inert = false;
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
function textField(name, label, value, placeholder, hint) {
  return (
    '<div class="form-field"><label for="f-' +
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

function textareaField(name, label, value, placeholder, hint) {
  return (
    '<div class="form-field"><label for="f-' +
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

function selectField(name, label, options, selected, hint) {
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
    '<div class="form-field"><label for="f-' +
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

function checkField(name, label, checked) {
  return (
    '<div class="form-field form-check"><input id="f-' +
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

/* ---------- 页面 CRUD 表单 ---------- */
function openPageForm(p) {
  const isEdit = !!p;
  openModal(
    isEdit ? '编辑页面' : '新增页面',
    '<form id="node-form">' +
      textField('label', '页面名称', p ? p.label : '', '例如:首页', '必填') +
      selectField(
        'template',
        '页面模板',
        [
          { value: '', label: '默认导航页' },
          { value: 'page', label: '导航页' },
          { value: 'content', label: '正文页' },
          { value: 'bookmarks', label: '书签' },
          { value: 'articles', label: '文章' },
          { value: 'projects', label: '项目' },
        ],
        p?.template || ''
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
      textareaField(
        'markdown',
        '正文（Markdown）',
        p?.metadata?.content?.markdown || '',
        '',
        '选择正文页时显示此内容'
      ) +
      checkField('hidden', '在导航中隐藏（链接和搜索仍可访问）', p ? !!p.hidden : false) +
      formActions(isEdit ? '保存' : '新增')
  );
  const form = document.getElementById('node-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(form, async () => {
      const payload = {
        label: document.getElementById('f-label').value.trim(),
        template: document.getElementById('f-template').value,
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
      if (payload.template === 'content')
        payload.metadata.content = { markdown: document.getElementById('f-markdown').value };
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
        await loadState();
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
    '<form id="node-form">' +
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
        await loadState();
      } else {
        setFormError(writeErr(r));
      }
    });
  });
}

/* 同一页面内的可选父分类(排除自身与子孙,避免循环) */
function buildParentOptions(page, editCat) {
  const excluded = new Set();
  if (editCat) for (const id of descendantIds(editCat)) excluded.add(id);
  const options = [{ value: '', label: '(无 — 顶层)' }];
  const walk = (cats) => {
    for (const c of cats) {
      if (excluded.has(c.id)) continue;
      options.push({ value: c.id, label: c.label });
      walk(c.categories || []);
    }
  };
  walk(page.categories || []);
  return options;
}

/* ---------- 站点 CRUD 表单 ---------- */
function openSiteForm(opts) {
  // opts: { categoryId, edit? }
  const isEdit = !!opts.edit;
  const s = opts.edit;
  openModal(
    isEdit ? '编辑站点' : '新增站点',
    '<form id="node-form">' +
      textField('name', '站点名称', s ? s.name : '', '例如:GitHub', '必填') +
      textField('url', '网址', s ? s.url : '', 'https://…', '必填') +
      textField('description', '描述', s && s.description ? s.description : '', '一行简介(可选)') +
      textField(
        'faviconUrl',
        '图标地址',
        s && s.faviconUrl ? s.faviconUrl : '',
        'https://…/favicon.ico(可选)'
      ) +
      textField('icon', '图标(类/emoji)', s && s.icon ? s.icon : '', '可选') +
      checkField('external', '外部链接(新标签页打开)', s ? !!s.external : true) +
      formActions(isEdit ? '保存' : '新增')
  );
  const form = document.getElementById('node-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWithGuard(form, async () => {
      const name = document.getElementById('f-name').value.trim();
      const url = document.getElementById('f-url').value.trim();
      if (!name || !url) {
        setFormError('名称与网址都是必填项');
        return;
      }
      const payload = {
        name,
        url,
        description: document.getElementById('f-description').value.trim(),
        faviconUrl: document.getElementById('f-faviconUrl').value.trim(),
        icon: document.getElementById('f-icon').value.trim(),
        external: document.getElementById('f-external').checked,
      };
      const r = isEdit
        ? await api('PUT', '/api/sites/' + s.id, payload)
        : await api('POST', '/api/sites', { categoryId: opts.categoryId, ...payload });
      if (r.ok) {
        toast(isEdit ? '站点已更新' : '站点已新增', 'success');
        closeModal();
        await loadState();
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
  if (r.error === 'revision_conflict')
    return '内容已在其他窗口更新。本次未保存，请保留输入，关闭弹窗并刷新后重新编辑。';
  if (r.status === 404) {
    setTimeout(() => loadState(), 1200);
    return '该条目不存在或已被删除，即将刷新';
  }
  if (typeof r.detail === 'string') return r.detail;
  return r.error ? '保存失败:' + r.error : '保存失败:未知错误';
}

/* ---------- 删除确认(含级联询问) ---------- */
function openConfirmDialog(message, onConfirm) {
  openModal(
    '确认操作',
    '<div style="margin-bottom:0.5rem">' +
      esc(message).replace(/\n/g, '<br>') +
      '</div>' +
      '<div class="form-actions"><button type="button" class="btn" data-action="modal-close">取消</button>' +
      '<button type="button" class="btn btn-danger" id="confirm-btn">确认删除</button></div>'
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
  let msg = '该节点下仍有内容,无法直接删除:';
  if (r.count != null) msg += '预计 ' + r.count + ' 个子项。';
  if (detail.childCount != null) msg += '子分类 ' + detail.childCount + ' 个;';
  if (detail.siteCount != null) msg += '直接站点 ' + detail.siteCount + ' 个。';
  msg += '\n是否级联删除整棵子树(含全部后代与站点)?';
  openConfirmDialog(msg, onForce);
}

/* ---------- 删除实现 ---------- */
async function delPage(id) {
  const r = await api('DELETE', '/api/pages/' + id);
  if (r.ok) {
    toast('页面已删除', 'success');
    await loadState();
  } else if (r.status === 409 && r.count !== undefined) {
    openCascadeConfirm(r, async () => {
      const f = await api('DELETE', '/api/pages/' + id + '?force=1');
      if (f.ok) {
        toast('页面及子树已删除', 'success');
        await loadState();
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
    await loadState();
  } else if (r.status === 409 && r.detail && typeof r.detail === 'object') {
    openCascadeConfirm(r, async () => {
      const f = await api('DELETE', '/api/categories/' + id + '?force=1');
      if (f.ok) {
        toast('分类及子树已删除', 'success');
        await loadState();
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
    await loadState();
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

async function loadPublishStatus() {
  clearTimeout(statusTimer);
  const panel = document.getElementById('publish-status');
  const r = await api('GET', '/api/publish-status');
  if (!r.ok) {
    panel.textContent = '发布状态暂不可用：' + writeErr(r);
    statusTimer = setTimeout(loadPublishStatus, 15000);
    return;
  }
  const labels = {
    dispatching: '正在创建构建',
    building: '构建中',
    published: '已发布',
    failed: '发布失败',
  };
  let message = '内容版本 ' + r.revision + ' · 已发布版本 ' + r.publishedRevision;
  message += r.pending ? ' · 有待发布修改' : ' · 已是最新';
  if (!r.wired) message += ' · 尚未配置发布服务';
  if (r.job) message += ' · ' + labels[r.job.status] + (r.job.error ? '：' + r.job.error : '');
  panel.textContent = message;
  if (r.job?.status === 'published' && r.job.url) {
    const link = document.createElement('a');
    link.href = r.job.url;
    link.textContent = '查看本次发布';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    panel.append(' · ', link);
  }
  statusTimer = setTimeout(
    loadPublishStatus,
    r.job && ['building', 'dispatching'].includes(r.job.status) ? 10000 : 60000
  );
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
    '系统配置',
    '<p class="field-hint">以下配置来自当前站点数据。导入初始数据会替换全部页面和配置，建议先导出备份。</p>' +
      '<div class="form-actions"><button type="button" class="btn" data-action="export">导出备份</button><button type="button" class="btn" data-action="seed">导入初始数据</button></div>' +
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
}

function openSeedImport() {
  const replacing = state.pages.length > 0;
  openModal(
    '导入初始数据',
    '<form id="seed-form">' +
      '<p class="field-hint">选择初始数据 JSON 或此前导出的备份文件（最多 16 MB）。导入成功后需要发布才能更新公开站。</p>' +
      '<div class="form-field"><label for="seed-file">数据文件</label><input id="seed-file" type="file" accept=".json,application/json" required></div>' +
      '<p id="seed-preview" role="status"></p>' +
      (replacing ? checkField('reset', '确认替换全部现有页面、站点和配置', false) : '') +
      formActions('导入') +
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
        setFormError('请先确认替换现有数据');
        return;
      }
      const r = await api('POST', '/api/seed' + (replacing ? '?reset=1' : ''), seed);
      if (!r.ok) {
        setFormError(writeErr(r));
        return;
      }
      toast('已导入 ' + r.pages + ' 个页面、' + r.sites + ' 个站点', 'success');
      closeModal();
      await loadState();
    });
  });
}

/* ---------- 书签导入 ---------- */
function openImport() {
  openModal(
    '导入书签',
    '<form id="import-form">' +
      '<div class="import-drop" id="import-drop">📥 点击下方按钮,或拖拽文件到此处</div>' +
      '<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">' +
      '<button type="button" class="btn" id="import-file-btn">选择 .html 文件</button>' +
      '</div>' +
      '<input type="file" id="import-file" accept=".html,.htm,text/html" hidden>' +
      textareaField(
        'bookmark',
        '或手动粘贴书签 HTML(Netscape 格式)',
        '',
        '粘贴导出文件内容',
        '支持 Chrome / Firefox / Safari 导出的书签 HTML，最多 8 MB。导入会替换书签页面现有内容，其他页面保持不变。'
      ) +
      formActions('开始导入')
  );
  const drop = document.getElementById('import-drop');
  const fileInput = document.getElementById('import-file');
  const fileBtn = document.getElementById('import-file-btn');
  const textarea = document.getElementById('f-bookmark');

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
  fileBtn.addEventListener('click', () => fileInput.click());
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
        toast('请先粘贴书签 HTML 或选择文件', 'error');
        return;
      }
      const r = await api('POST', '/api/bookmarks', { html });
      if (r.ok) {
        // M12:汇报实际导入数量,让用户验证落点;解析为空已被后端 422 拦截
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
        await loadState();
      } else {
        toast(writeErr(r), 'error');
      }
    });
  });
}

/* ---------- 主题切换 ---------- */
function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('admin-theme');
  if (saved === 'light') document.documentElement.classList.add('light-theme');
  updateThemeIcon();
  btn.addEventListener('click', () => {
    const light = document.documentElement.classList.toggle('light-theme');
    localStorage.setItem('admin-theme', light ? 'light' : 'dark');
    updateThemeIcon();
  });
  function updateThemeIcon() {
    btn.textContent = document.documentElement.classList.contains('light-theme') ? '🌙' : '☀️';
  }
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
      case 'publish':
        await publish();
        break;
      case 'import':
      case 'open-import':
        openImport();
        break;
      case 'settings':
      case 'open-settings':
        await openSettings();
        break;
      case 'seed':
        openSeedImport();
        break;
      case 'export':
        await exportSnapshot();
        break;
      case 'add-page':
        openPageForm(null);
        break;
      case 'edit-page':
        openPageForm(state.pages.find((p) => p.id === btn.dataset.id));
        break;
      case 'del-page':
        {
          const msg = '确定删除页面及其内容?(若含子项将询问级联)';
          openConfirmDialog(msg, () => delPage(btn.dataset.id));
        }
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
        // M10:销毁性操作必须确认(与 del-page 对齐)
        const entry = nodeIndex.categories.find((x) => x.node.id === btn.dataset.id);
        const name = entry ? entry.node.label : '';
        openConfirmDialog('确定删除分类「' + name + '」?(若含子项将询问级联)', () =>
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
        // M10:销毁性操作必须确认(与 del-page 对齐)
        const entry = nodeIndex.sites.find((x) => x.node.id === btn.dataset.id);
        const name = entry ? entry.node.name : '';
        openConfirmDialog('确定删除站点「' + name + '」?此操作不可撤销', () =>
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
  bindEvents();
  loadState();
});

// 便于调试:控制台访问当前树
window.__menavAdmin = { getState: () => state };
