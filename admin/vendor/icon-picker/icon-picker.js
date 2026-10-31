/*
 * MeNav 图标选择器
 * 基于 AppoloDev/vanilla-icon-picker 1.4.2（MIT，Copyright (c) 2021 Appolo）改造：
 * 图标源本地化、改为分批渲染、样式跟随管理台主题。
 * https://github.com/AppoloDev/vanilla-icon-picker
 *
 * 用法：
 *   const picker = new MenavIconPicker({ sources: [{ label: '实心', url: './icons/fa6-solid.json' }] });
 *   picker.open(document.querySelector('#icon-input'));
 * 选中后写入 input.value 并派发 change 事件。
 */
(function (global) {
  'use strict';

  var BATCH = 120;
  var sourceCache = new Map();
  var assetsReady = null;

  function ensureAssets() {
    if (assetsReady) return assetsReady;
    assetsReady = Promise.all(
      ['./vendor/fontawesome/css/all.min.css', './vendor/icon-picker/icon-picker.css'].map(
        function (href) {
          return new Promise(function (resolve, reject) {
            if (document.querySelector('link[data-menav-icons="' + href + '"]')) return resolve();
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.menavIcons = href;
            link.addEventListener('load', resolve);
            link.addEventListener('error', function () {
              reject(new Error('样式加载失败：' + href));
            });
            document.head.appendChild(link);
          });
        }
      )
    );
    return assetsReady;
  }

  function loadSource(url) {
    if (!sourceCache.has(url)) {
      sourceCache.set(
        url,
        fetch(url).then(function (response) {
          if (!response.ok) throw new Error('图标数据加载失败（' + response.status + '）');
          return response.json();
        })
      );
    }
    return sourceCache.get(url);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function MenavIconPicker(options) {
    this.options = Object.assign(
      { sources: [], placeholder: '搜索图标名，例如 home、github' },
      options
    );
    this.overlay = null;
    this.grid = null;
    this.entries = [];
    this.filtered = [];
    this.rendered = 0;
    this.sourceKey = 'all';
    this.onClose = null;
    this._onKeydown = this._onKeydown.bind(this);
  }

  MenavIconPicker.prototype.preload = function () {
    return ensureAssets().catch(function () {});
  };

  MenavIconPicker.prototype.open = function (input, opts) {
    var self = this;
    if (!input) return;
    this.input = input;
    this.current = String(input.value || '').trim();
    this.title = (opts && opts.title) || '选择图标';

    ensureAssets()
      .then(function () {
        return Promise.all(
          self.options.sources.map(function (source) {
            return loadSource(source.url).then(function (data) {
              return {
                key: data.prefix,
                label: source.label,
                classPrefix: data.classPrefix,
                icons: Object.keys(data.icons || {}),
              };
            });
          })
        );
      })
      .then(function (sources) {
        self.sources = sources;
        self.entries = [];
        sources.forEach(function (source) {
          source.icons.forEach(function (name) {
            self.entries.push({
              name: name,
              value: source.classPrefix + name,
              source: source.key,
            });
          });
        });
        self._build();
        self._apply();
      })
      .catch(function (error) {
        self._showError(error.message || String(error));
      });
  };

  MenavIconPicker.prototype._build = function () {
    var self = this;
    this.close();

    var overlay = document.createElement('div');
    overlay.className = 'mip-overlay';
    overlay.innerHTML =
      '<div class="mip-panel" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(this.title) +
      '">' +
      '<header class="mip-header"><h2>' +
      escapeHtml(this.title) +
      '</h2>' +
      '<button type="button" class="mip-close" aria-label="关闭" data-mip="close">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '</button></header>' +
      '<div class="mip-toolbar">' +
      '<input type="search" class="mip-search" placeholder="' +
      escapeHtml(this.options.placeholder) +
      '" aria-label="搜索图标">' +
      '<div class="mip-tabs" role="tablist"></div>' +
      '</div>' +
      '<div class="mip-grid" tabindex="-1"></div>' +
      '<footer class="mip-footer">' +
      '<span class="mip-current"></span>' +
      '<div class="mip-footer-actions">' +
      '<button type="button" class="mip-btn" data-mip="clear">清除</button>' +
      '<button type="button" class="mip-btn mip-btn-primary" data-mip="close">完成</button>' +
      '</div></footer></div>';

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.grid = overlay.querySelector('.mip-grid');
    this.search = overlay.querySelector('.mip-search');
    this.currentLabel = overlay.querySelector('.mip-current');

    var tabs = overlay.querySelector('.mip-tabs');
    // 打开时直接落在当前图标所属的库，避免选中项藏在别的分组里
    var currentEntry = this.entries.find(function (entry) {
      return entry.value === self.current;
    });
    this.sourceKey = currentEntry ? currentEntry.source : 'all';
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'mip-tab' + (this.sourceKey === 'all' ? ' is-active' : '');
    all.dataset.source = 'all';
    all.textContent = '全部';
    tabs.appendChild(all);
    this.sources.forEach(function (source) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'mip-tab' + (self.sourceKey === source.key ? ' is-active' : '');
      tab.dataset.source = source.key;
      tab.textContent = source.label;
      tabs.appendChild(tab);
    });

    overlay.addEventListener('click', function (event) {
      var action = event.target.closest('[data-mip]');
      if (action) {
        if (action.dataset.mip === 'close') self.close();
        if (action.dataset.mip === 'clear') self._clear();
        return;
      }
      if (event.target === overlay) self.close();
    });

    tabs.addEventListener('click', function (event) {
      var tab = event.target.closest('.mip-tab');
      if (!tab) return;
      tabs.querySelectorAll('.mip-tab').forEach(function (node) {
        node.classList.toggle('is-active', node === tab);
      });
      self.sourceKey = tab.dataset.source;
      self._apply();
      self.search.focus();
    });

    this.search.addEventListener('input', function () {
      self._apply();
    });

    this.grid.addEventListener('click', function (event) {
      var button = event.target.closest('.mip-icon');
      if (!button) return;
      self._select(button.dataset.value);
    });

    this.grid.addEventListener('scroll', function () {
      if (self.grid.scrollTop + self.grid.clientHeight >= self.grid.scrollHeight - 240) {
        self._fill();
      }
    });

    document.addEventListener('keydown', this._onKeydown);
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
      self.search.focus();
    });
  };

  MenavIconPicker.prototype._onKeydown = function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  MenavIconPicker.prototype._apply = function () {
    var term = this.search.value.trim().toLowerCase();
    var sourceKey = this.sourceKey;
    this.filtered = this.entries.filter(function (entry) {
      if (sourceKey !== 'all' && entry.source !== sourceKey) return false;
      return !term || entry.name.indexOf(term) !== -1;
    });
    this.rendered = 0;
    this.grid.innerHTML = '';
    if (!this.filtered.length) {
      this.grid.innerHTML = '<p class="mip-empty">没有匹配的图标</p>';
      return;
    }
    this._fill();
    var self = this;
    var target = this.filtered.findIndex(function (entry) {
      return entry.value === self.current;
    });
    if (target >= this.rendered) {
      while (this.rendered <= target) this._append();
    }
    this._syncSelected();
    this._updateCurrent();
    var selectedNode = this.grid.querySelector('.mip-icon.is-selected');
    // 用容器自身滚动，避免 scrollIntoView 连带滚动背后的页面
    this.grid.scrollTop = selectedNode
      ? Math.max(0, selectedNode.offsetTop - this.grid.clientHeight / 2)
      : 0;
  };

  /* 首屏或窗口很高时，一批填不满可视区就继续补，否则剩余图标永远滚不到 */
  MenavIconPicker.prototype._fill = function () {
    do {
      this._append();
    } while (
      this.rendered < this.filtered.length &&
      this.grid.scrollHeight <= this.grid.clientHeight
    );
  };

  MenavIconPicker.prototype._append = function () {
    if (this.rendered >= this.filtered.length) return;
    var end = Math.min(this.rendered + BATCH, this.filtered.length);
    var html = '';
    for (var i = this.rendered; i < end; i += 1) {
      var entry = this.filtered[i];
      var selected = entry.value === this.current ? ' is-selected' : '';
      html +=
        '<button type="button" class="mip-icon' +
        selected +
        '" data-value="' +
        escapeHtml(entry.value) +
        '" title="' +
        escapeHtml(entry.name) +
        '" aria-label="' +
        escapeHtml(entry.name) +
        '"><i class="' +
        escapeHtml(entry.value) +
        '" aria-hidden="true"></i></button>';
    }
    this.grid.insertAdjacentHTML('beforeend', html);
    this.rendered = end;
  };

  MenavIconPicker.prototype._syncSelected = function () {
    var current = this.current;
    this.grid.querySelectorAll('.mip-icon').forEach(function (node) {
      node.classList.toggle('is-selected', node.dataset.value === current);
    });
  };

  MenavIconPicker.prototype._updateCurrent = function () {
    this.currentLabel.textContent = this.current ? '当前：' + this.current : '未选择';
    this.currentLabel.classList.toggle('is-empty', !this.current);
  };

  MenavIconPicker.prototype._select = function (value) {
    this.current = value || '';
    this.input.value = this.current;
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
    this.close();
  };

  MenavIconPicker.prototype._clear = function () {
    this._select('');
  };

  MenavIconPicker.prototype._showError = function (message) {
    var overlay = document.createElement('div');
    overlay.className = 'mip-overlay is-open';
    overlay.innerHTML =
      '<div class="mip-panel mip-panel-error" role="dialog" aria-modal="true">' +
      '<header class="mip-header"><h2>图标加载失败</h2></header>' +
      '<p class="mip-error"></p>' +
      '<footer class="mip-footer"><div class="mip-footer-actions">' +
      '<button type="button" class="mip-btn mip-btn-primary" data-mip-error="close">关闭</button>' +
      '</div></footer></div>';
    overlay.querySelector('.mip-error').textContent = message;
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-mip-error]')) overlay.remove();
    });
    document.body.appendChild(overlay);
  };

  MenavIconPicker.prototype.close = function () {
    document.removeEventListener('keydown', this._onKeydown);
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.onClose) this.onClose();
  };

  global.MenavIconPicker = MenavIconPicker;
})(window);
