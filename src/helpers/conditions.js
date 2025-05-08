/**
 * Handlebars条件判断助手函数
 * 提供各种条件判断功能
 */

/**
 * 比较两个值是否相等
 * @param {any} v1 比较值1
 * @param {any} v2 比较值2
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#ifEquals type "article"}}文章{{else}}页面{{/ifEquals}}
 */
function ifEquals(v1, v2, options) {
  return v1 === v2 ? options.fn(this) : options.inverse(this);
}

/**
 * 比较两个值是否不相等
 * @param {any} v1 比较值1
 * @param {any} v2 比较值2
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#ifNotEquals status "completed"}}进行中{{else}}已完成{{/ifNotEquals}}
 */
function ifNotEquals(v1, v2, options) {
  return v1 !== v2 ? options.fn(this) : options.inverse(this);
}

/**
 * 通用条件比较
 * @param {any} v1 比较值1
 * @param {string} operator 比较运算符 ('==', '===', '!=', '!==', '<', '<=', '>', '>=')
 * @param {any} v2 比较值2
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#ifCond count '>' 0}}有内容{{else}}无内容{{/ifCond}}
 */
function ifCond(v1, operator, v2, options) {
  switch (operator) {
    case '==':
      return (v1 == v2) ? options.fn(this) : options.inverse(this);
    case '===':
      return (v1 === v2) ? options.fn(this) : options.inverse(this);
    case '!=':
      return (v1 != v2) ? options.fn(this) : options.inverse(this);
    case '!==':
      return (v1 !== v2) ? options.fn(this) : options.inverse(this);
    case '<':
      return (v1 < v2) ? options.fn(this) : options.inverse(this);
    case '<=':
      return (v1 <= v2) ? options.fn(this) : options.inverse(this);
    case '>':
      return (v1 > v2) ? options.fn(this) : options.inverse(this);
    case '>=':
      return (v1 >= v2) ? options.fn(this) : options.inverse(this);
    case '&&':
      return (v1 && v2) ? options.fn(this) : options.inverse(this);
    case '||':
      return (v1 || v2) ? options.fn(this) : options.inverse(this);
    default:
      return options.inverse(this);
  }
}

/**
 * 检查值是否为空（null、undefined、空字符串、空数组或空对象）
 * @param {any} value 要检查的值
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#isEmpty items}}无内容{{else}}有内容{{/isEmpty}}
 */
function isEmpty(value, options) {
  if (value === null || value === undefined) {
    return options.fn(this);
  }
  
  if (typeof value === 'string' && value.trim() === '') {
    return options.fn(this);
  }
  
  if (Array.isArray(value) && value.length === 0) {
    return options.fn(this);
  }
  
  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return options.fn(this);
  }
  
  return options.inverse(this);
}

/**
 * 检查值是否非空
 * @param {any} value 要检查的值
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#isNotEmpty items}}有内容{{else}}无内容{{/isNotEmpty}}
 */
function isNotEmpty(value, options) {
  return isEmpty(value, { 
    fn: options.inverse,
    inverse: options.fn
  });
}

/**
 * 条件与操作
 * @param {any} a 条件A
 * @param {any} b 条件B
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#and isPremium isActive}}高级活跃用户{{else}}其他用户{{/and}}
 */
function and(a, b, options) {
  return (a && b) ? options.fn(this) : options.inverse(this);
}

/**
 * 条件或操作
 * @param {any} a 条件A
 * @param {any} b 条件B
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#or isPremium isAdmin}}有权限{{else}}无权限{{/or}}
 */
function or(a, b, options) {
  return (a || b) ? options.fn(this) : options.inverse(this);
}

/**
 * 多个条件的或操作
 * 使用方式：{{#or (ifEquals a b) (ifEquals c d)}}满足条件{{else}}不满足条件{{/or}}
 * @param {...any} args 多个条件值
 * @returns {boolean} 条件结果
 */
function orHelper() {
  // 最后一个参数是options对象
  const options = arguments[arguments.length - 1];
  
  // 检查是否至少有一个为true的参数
  for (let i = 0; i < arguments.length - 1; i++) {
    if (arguments[i]) {
      return options.fn(this);
    }
  }
  
  return options.inverse(this);
}

/**
 * 条件非操作
 * @param {any} value 条件值
 * @param {object} options Handlebars选项
 * @returns {string} 渲染结果
 * @example {{#not isDisabled}}启用{{else}}禁用{{/not}}
 */
function not(value, options) {
  return !value ? options.fn(this) : options.inverse(this);
}

// 导出所有条件判断助手函数
module.exports = {
  ifEquals,
  ifNotEquals,
  ifCond,
  isEmpty,
  isNotEmpty,
  and,
  or,
  orHelper,
  not
}; 