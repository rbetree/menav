/**
 * 通用工具函数
 * 提供数组处理、字符串处理等实用功能
 */

/**
 * 数组或字符串切片操作
 * @param {Array|string} array 要处理的数组或字符串
 * @param {number} start 起始索引
 * @param {number} [end] 结束索引（可选）
 * @returns {Array|string} 切片结果
 * @example {{slice array 0 5}}
 */
function slice(array, start, end) {
  if (!array) return [];

  if (typeof array === 'string') {
    return end ? array.slice(start, end) : array.slice(start);
  }

  if (Array.isArray(array)) {
    return end ? array.slice(start, end) : array.slice(start);
  }

  return [];
}

/**
 * 合并数组
 * @param {...Array} arrays 要合并的数组
 * @returns {Array} 合并后的数组
 * @example {{concat array1 array2 array3}}
 */
function concat() {
  const args = Array.from(arguments);
  args.pop();

  // 过滤掉非数组参数
  const validArrays = args.filter((arg) => Array.isArray(arg));

  if (validArrays.length === 0) {
    return [];
  }

  return Array.prototype.concat.apply([], validArrays);
}

/**
 * 获取数组或对象的长度/大小
 * @param {Array|Object|string} value 要计算长度的值
 * @returns {number} 长度或大小
 * @example {{size array}}
 */
function size(value) {
  if (!value) return 0;

  if (Array.isArray(value) || typeof value === 'string') {
    return value.length;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length;
  }

  return 0;
}

/**
 * 获取数组的第一个元素
 * @param {Array} array 数组
 * @returns {any} 第一个元素
 * @example {{first items}}
 */
function first(array) {
  if (!array || !Array.isArray(array) || array.length === 0) {
    return undefined;
  }

  return array[0];
}

/**
 * 获取数组的最后一个元素
 * @param {Array} array 数组
 * @returns {any} 最后一个元素
 * @example {{last items}}
 */
function last(array) {
  if (!array || !Array.isArray(array) || array.length === 0) {
    return undefined;
  }

  return array[array.length - 1];
}

/**
 * 创建一个连续范围的数组（用于循环）
 * @param {number} start 起始值
 * @param {number} end 结束值
 * @param {number} [step=1] 步长
 * @returns {Array} 范围数组
 * @example {{#each (range 1 5)}}{{this}}{{/each}}
 */
function range(start, end, step = 1) {
  const result = [];

  if (typeof start !== 'number' || typeof end !== 'number') {
    return result;
  }

  if (step <= 0) {
    step = 1;
  }

  for (let i = start; i <= end; i += step) {
    result.push(i);
  }

  return result;
}

/**
 * 从对象中选择指定的属性（创建新对象）
 * @param {Object} object 源对象
 * @param {...string} keys 要选择的属性键
 * @returns {Object} 包含选定属性的新对象
 * @example {{json (pick user "name" "email")}}
 */
function pick() {
  const args = Array.from(arguments);
  args.pop();

  if (args.length < 1) {
    return {};
  }

  const obj = args[0];
  const keys = args.slice(1);

  if (!obj || typeof obj !== 'object') {
    return {};
  }

  const result = {};

  keys.forEach((key) => {
    if (obj.hasOwnProperty(key)) {
      result[key] = obj[key];
    }
  });

  return result;
}

/**
 * 将对象的所有键转换为数组
 * @param {Object} object 输入对象
 * @returns {Array} 键数组
 * @example {{#each (keys obj)}}{{this}}{{/each}}
 */
function keys(object) {
  if (!object || typeof object !== 'object') {
    return [];
  }

  return Object.keys(object);
}

/**
 * 对字符串进行URL组件编码（encodeURIComponent）
 * @param {string} text 输入文本
 * @returns {string} 编码后的字符串
 * @example {{encodeURIComponent url}}
 */
function encodeURIComponentHelper(text) {
  if (text === undefined || text === null) return '';
  try {
    return encodeURIComponent(String(text));
  } catch (e) {
    return '';
  }
}

/**
 * 数学加法运算助手函数
 * @param {number} a 第一个数
 * @param {number} b 第二个数
 * @returns {number} 两数之和
 * @example {{add level 1}}
 */
function add(a, b) {
  const numA = parseInt(a, 10) || 0;
  const numB = parseInt(b, 10) || 0;
  return numA + numB;
}

/**
 * 根据 icons.region 配置生成 favicon URL
 * @param {string} url 站点 URL
 * @param {Object} options 兼容旧调用形态的配置对象
 * @returns {string} favicon URL
 * @example {{faviconV2Url url}}
 */
function faviconV2Url(url, options) {
  if (!url) return '';

  const region = options.data.root.icons?.region || 'com';
  const domain = region === 'cn' ? 't3.gstatic.cn' : 't3.gstatic.com';

  try {
    const encodedUrl = encodeURIComponent(String(url));
    // drop_404_icon=true：缺失 favicon 时返回空 404，避免“小地球”占位图并可靠触发 <img onerror> 回退
    return `https://${domain}/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodedUrl}&size=32&drop_404_icon=true`;
  } catch (e) {
    return '';
  }
}

/**
 * 根据 icons.region 配置生成 favicon 回退 URL
 * @param {string} url 站点 URL
 * @param {Object} options 兼容旧调用形态的配置对象
 * @returns {string} favicon 回退 URL
 * @example {{faviconFallbackUrl url}}
 */
function faviconFallbackUrl(url, options) {
  if (!url) return '';

  const region = options.data.root.icons?.region || 'com';
  const domain = region === 'cn' ? 't3.gstatic.com' : 't3.gstatic.cn';

  try {
    const encodedUrl = encodeURIComponent(String(url));
    // drop_404_icon=true：缺失 favicon 时返回空 404，避免“小地球”占位图并可靠触发 <img onerror> 回退
    return `https://${domain}/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodedUrl}&size=32&drop_404_icon=true`;
  } catch (e) {
    return '';
  }
}

/**
 * 安全 URL 输出：用于 href 等场景，防止 javascript: 等危险 scheme 变成可点击链接
 * - 默认允许：http/https/mailto/tel + 相对链接（# / ./ ../ ?）
 * - 允许通过 site.security.allowedSchemes 扩展白名单（例如 obsidian/vscode）
 * @param {string} url 输入 URL
 * @param {Object} options 兼容旧调用形态的配置对象
 * @returns {string} 安全的 URL（不安全时返回 #）
 * @example <a href="{{safeUrl url}}">...</a>
 */
function safeUrl(url, options) {
  const raw = String(url || '').trim();
  if (!raw) return '#';

  // 允许相对链接
  if (
    raw.startsWith('#') ||
    raw.startsWith('/') ||
    raw.startsWith('./') ||
    raw.startsWith('../') ||
    raw.startsWith('?')
  ) {
    return raw;
  }

  // 拒绝协议相对 URL（//example.com），避免绕过策略
  if (raw.startsWith('//')) {
    console.warn(`[WARN] 已拦截不安全 URL（协议相对形式）：${raw}`);
    return '#';
  }

  const allowedFromConfig =
    options &&
    options.data &&
    options.data.root &&
    options.data.root.site &&
    options.data.root.site.security &&
    options.data.root.site.security.allowedSchemes;

  const allowedSchemes =
    Array.isArray(allowedFromConfig) && allowedFromConfig.length > 0
      ? allowedFromConfig
          .map((s) =>
            String(s || '')
              .trim()
              .toLowerCase()
              .replace(/:$/, '')
          )
          .filter(Boolean)
      : ['http', 'https', 'mailto', 'tel'];

  try {
    const parsed = new URL(raw);
    const scheme = String(parsed.protocol || '')
      .toLowerCase()
      .replace(/:$/, '');
    if (allowedSchemes.includes(scheme)) return raw;
    console.warn(`[WARN] 已拦截不安全 URL scheme：${raw}`);
    return '#';
  } catch (e) {
    console.warn(`[WARN] 已拦截无法解析的 URL：${raw}`);
    return '#';
  }
}

// 导出所有工具类助手函数
module.exports = {
  slice,
  concat,
  size,
  first,
  last,
  range,
  pick,
  keys,
  encodeURIComponent: encodeURIComponentHelper,
  add,
  faviconV2Url,
  faviconFallbackUrl,
  safeUrl,
};
