/**
 * Handlebars助手函数中心
 * 
 * 导入并重导出所有助手函数，方便在generator中统一注册
 */

const formatters = require('./formatters');
const conditions = require('./conditions');
const utils = require('./utils');

/**
 * 注册所有助手函数到Handlebars实例
 * @param {Handlebars} handlebars Handlebars实例
 */
function registerAllHelpers(handlebars) {
  // 注册格式化助手函数
  Object.entries(formatters).forEach(([name, helper]) => {
    handlebars.registerHelper(name, helper);
  });
  
  // 注册条件判断助手函数
  Object.entries(conditions).forEach(([name, helper]) => {
    handlebars.registerHelper(name, helper);
  });
  
  // 注册工具类助手函数
  Object.entries(utils).forEach(([name, helper]) => {
    handlebars.registerHelper(name, helper);
  });
  
  // 注册HTML转义函数（作为助手函数，方便在模板中调用）
  handlebars.registerHelper('escapeHtml', function(text) {
    if (text === undefined || text === null) {
      return '';
    }
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  });
  
  // 注册非转义助手函数（安全输出HTML）
  handlebars.registerHelper('safeHtml', function(text) {
    if (text === undefined || text === null) {
      return '';
    }
    return new handlebars.SafeString(text);
  });
}

// 导出所有助手函数和注册函数
module.exports = {
  formatters,
  conditions,
  utils,
  registerAllHelpers
}; 