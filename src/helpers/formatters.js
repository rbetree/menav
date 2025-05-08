/**
 * Handlebars格式化助手函数
 * 提供日期、文本等格式化功能
 */

/**
 * 格式化日期
 * @param {Date|string} date 日期对象或日期字符串
 * @param {string} format 格式化模式
 * @returns {string} 格式化后的日期字符串
 * @example {{formatDate date "YYYY-MM-DD"}}
 */
function formatDate(date, format) {
  if (!date) return '';
  
  // 将字符串转换为日期对象
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (!(dateObj instanceof Date) || isNaN(dateObj)) {
    return '';
  }
  
  // 获取日期组件
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const seconds = dateObj.getSeconds();
  
  // 格式化日期字符串
  if (!format) format = 'YYYY-MM-DD';
  
  return format
    .replace('YYYY', year)
    .replace('MM', month.toString().padStart(2, '0'))
    .replace('DD', day.toString().padStart(2, '0'))
    .replace('HH', hours.toString().padStart(2, '0'))
    .replace('mm', minutes.toString().padStart(2, '0'))
    .replace('ss', seconds.toString().padStart(2, '0'));
}

/**
 * 限制文本长度，超出部分显示省略号
 * @param {string} text 输入文本
 * @param {number} length 最大长度
 * @returns {string} 处理后的文本
 * @example {{limit description 100}}
 */
function limit(text, length) {
  if (!text) return '';
  
  text = String(text);
  
  if (text.length <= length) {
    return text;
  }
  
  return text.substring(0, length) + '...';
}

/**
 * 转换文本为小写
 * @param {string} text 输入文本
 * @returns {string} 小写文本
 * @example {{toLowerCase title}}
 */
function toLowerCase(text) {
  if (!text) return '';
  return String(text).toLowerCase();
}

/**
 * 转换文本为大写
 * @param {string} text 输入文本
 * @returns {string} 大写文本
 * @example {{toUpperCase code}}
 */
function toUpperCase(text) {
  if (!text) return '';
  return String(text).toUpperCase();
}

/**
 * 将对象转换为JSON字符串（用于调试）
 * @param {any} obj 要转换的对象
 * @returns {string} JSON字符串
 * @example {{json this}}
 */
function json(obj) {
  return JSON.stringify(obj, null, 2);
}

// 导出所有格式化助手函数
module.exports = {
  formatDate,
  limit,
  toLowerCase,
  toUpperCase,
  json
}; 