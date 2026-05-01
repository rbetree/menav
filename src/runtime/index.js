// 运行时入口（由构建阶段打包输出 public/script.js，再由 Astro 复制到 dist/script.js）
const { menavUpdateAppHeight } = require('./shared');

// 让页面在不同视口（含移动端地址栏变化）下保持正确高度
menavUpdateAppHeight();
window.addEventListener('resize', menavUpdateAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', menavUpdateAppHeight);
}

// 扩展契约：先初始化 window.MeNav，再挂载 nested API 与应用逻辑
require('./menav');
require('./nested');
require('./app');

// tooltip 独立模块：内部会按需监听 DOMContentLoaded
require('./tooltip');
