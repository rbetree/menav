/**
 * Handlebars通用工具类助手函数
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
  const options = args.pop(); // 最后一个参数是Handlebars的options对象
  
  // 过滤掉非数组参数
  const validArrays = args.filter(arg => Array.isArray(arg));
  
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
  const options = args.pop(); // 最后一个参数是Handlebars的options对象
  
  if (args.length < 1) {
    return {};
  }
  
  const obj = args[0];
  const keys = args.slice(1);
  
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  
  const result = {};
  
  keys.forEach(key => {
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

// 导出所有工具类助手函数
module.exports = {
  slice,
  concat,
  size,
  first,
  last,
  range,
  pick,
  keys
}; 