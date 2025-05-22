# MeNav Handlebars 助手函数说明文档

## 目录

- [助手函数概述](#助手函数概述)
- [助手函数分类](#助手函数分类)
  - [格式化函数](#格式化函数)
  - [条件判断函数](#条件判断函数)
  - [工具函数](#工具函数)
  - [核心函数](#核心函数)
- [使用方法](#使用方法)
- [函数详解](#函数详解)
- [扩展指南](#扩展指南)
- [最佳实践](#最佳实践)

## 助手函数概述

MeNav 项目使用 Handlebars 助手函数扩展模板功能，使模板更加强大和灵活。助手函数可用于：

- 数据格式化（日期、文本等）
- 条件判断和逻辑控制
- 数组与对象操作
- HTML 安全处理

所有助手函数都在 `src/helpers/` 目录下定义，并通过 `src/helpers/index.js` 统一注册到 Handlebars 实例。

## 助手函数分类

MeNav 的助手函数分为四类：

### 格式化函数

位置：`src/helpers/formatters.js`

提供各种数据格式化功能，包括：

- 日期格式化
- 文本长度限制
- 大小写转换
- 调试数据显示

### 条件判断函数

位置：`src/helpers/conditions.js`

提供条件判断与逻辑操作功能，包括：

- 相等与不等判断
- 通用比较操作
- 空值检查
- 逻辑运算（与、或、非）

### 工具函数

位置：`src/helpers/utils.js`

提供各种实用工具功能，包括：

- 数组与字符串操作
- 集合长度计算
- 范围数组生成
- 对象属性选择

### 核心函数

位置：`src/helpers/index.js`

提供基础的 HTML 处理功能：

- HTML 转义
- 安全输出 HTML

## 使用方法

在 Handlebars 模板中使用助手函数有多种方式：

### 1. 内联表达式

用于生成内容的助手函数：

```handlebars
{{formatDate created "YYYY-MM-DD"}}
{{limit description 100}}
{{json data}}
```

### 2. 块级表达式

用于控制结构的助手函数：

```handlebars
{{#ifEquals type "article"}}
    <span class="badge">文章</span>
{{else}}
    <span class="badge">页面</span>
{{/ifEquals}}

{{#each (range 1 5)}}
    <span>{{this}}</span>
{{/each}}
```

### 3. 助手函数组合

多个助手函数可以组合使用：

```handlebars
{{#each (slice items 0 5)}}
    <li>{{toUpperCase name}}</li>
{{/each}}
```

## 函数详解

### 格式化函数

#### formatDate

格式化日期：

```handlebars
{{formatDate date "YYYY-MM-DD"}}  {{!-- 2023-05-15 --}}
{{formatDate date "YYYY年MM月DD日"}}  {{!-- 2023年05月15日 --}}
{{formatDate date "YYYY-MM-DD HH:mm:ss"}}  {{!-- 2023-05-15 14:30:00 --}}
```

支持的格式：
- `YYYY`: 四位年份
- `MM`: 两位月份
- `DD`: 两位日期
- `HH`: 两位小时（24小时制）
- `mm`: 两位分钟
- `ss`: 两位秒数

#### limit

限制文本长度，超出部分显示省略号：

```handlebars
{{limit "这是一段很长的文本内容" 5}}  {{!-- 这是一段... --}}
```

#### toLowerCase / toUpperCase

转换文本大小写：

```handlebars
{{toLowerCase "Hello"}}  {{!-- hello --}}
{{toUpperCase "world"}}  {{!-- WORLD --}}
```

#### json

将对象转换为 JSON 字符串（用于调试）：

```handlebars
{{json this}}
```

### 条件判断函数

#### ifEquals / ifNotEquals

比较两个值是否相等/不相等：

```handlebars
{{#ifEquals status "active"}}
    当前状态：活跃
{{else}}
    当前状态：非活跃
{{/ifEquals}}
```

#### ifCond

通用条件比较：

```handlebars
{{#ifCond count ">" 0}}
    有 {{count}} 个项目
{{else}}
    没有项目
{{/ifCond}}
```

支持的运算符：
- `==`, `===`, `!=`, `!==`
- `<`, `<=`, `>`, `>=`
- `&&`, `||`

#### isEmpty / isNotEmpty

检查值是否为空：

```handlebars
{{#isEmpty items}}
    <p>暂无数据</p>
{{else}}
    <ul>
        {{#each items}}
            <li>{{this}}</li>
        {{/each}}
    </ul>
{{/isEmpty}}
```

#### and / or / not

逻辑操作：

```handlebars
{{#and isPremium isActive}}
    高级活跃用户
{{/and}}

{{#or isPremium isAdmin}}
    有访问权限
{{/or}}

{{#not isDisabled}}
    此功能可用
{{/not}}
```

### 工具函数

#### slice

数组或字符串切片：

```handlebars
{{#each (slice array 0 3)}}
    <li>{{this}}</li>
{{/each}}
```

#### concat

合并数组：

```handlebars
{{#each (concat array1 array2)}}
    <li>{{this}}</li>
{{/each}}
```

#### size

获取数组、字符串或对象的长度/大小：

```handlebars
总共 {{size items}} 个项目
```

#### first / last

获取数组的第一个/最后一个元素：

```handlebars
第一项: {{first items}}
最后一项: {{last items}}
```

#### range

创建一个连续范围的数组：

```handlebars
{{#each (range 1 5)}}
    <span>{{this}}</span>
{{/each}}
```

#### pick

从对象中选择指定的属性：

```handlebars
{{json (pick user "name" "email")}}
```

#### keys

将对象的所有键转换为数组：

```handlebars
{{#each (keys object)}}
    <li>{{this}}</li>
{{/each}}
```

### 核心函数

#### escapeHtml

转义 HTML 特殊字符：

```handlebars
{{escapeHtml content}}
```

#### safeHtml

安全输出 HTML（不转义）：

```handlebars
{{safeHtml htmlContent}}
```

## 扩展指南

### 添加新的助手函数

1. 选择适当的分类文件（`formatters.js`、`conditions.js` 或 `utils.js`）
2. 添加新的函数并导出
3. 函数会自动通过 `index.js` 中的 `registerAllHelpers` 注册

示例：添加一个新的格式化函数到 `formatters.js`：

```javascript
/**
 * 将数字格式化为带千位分隔符的字符串
 * @param {number} number 要格式化的数字
 * @returns {string} 格式化后的字符串
 * @example {{formatNumber 1000000}} -> 1,000,000
 */
function formatNumber(number) {
  if (typeof number !== 'number') return '';
  return number.toLocaleString();
}

// 在导出中添加新函数
module.exports = {
  formatDate,
  limit,
  toLowerCase,
  toUpperCase,
  json,
  formatNumber // 添加新函数
};
```

### 添加新的分类

如果需要添加新的分类：

1. 在 `src/helpers/` 创建新的 JS 文件
2. 在 `index.js` 中导入并注册新的助手函数集

```javascript
const newHelpers = require('./new-helpers');

function registerAllHelpers(handlebars) {
  // 现有注册代码...
  
  // 注册新的助手函数
  Object.entries(newHelpers).forEach(([name, helper]) => {
    handlebars.registerHelper(name, helper);
  });
}
```

## 最佳实践

1. **文档化函数** - 使用 JSDoc 风格为所有函数添加文档注释
   - 描述函数功能
   - 列出参数和返回值
   - 提供使用示例

2. **参数校验** - 增加参数类型和有效性检查
   - 检查必要参数是否存在
   - 验证参数类型
   - 为无效输入提供默认值或空结果

3. **命名规范**
   - 使用描述性名称，清晰表达函数用途
   - 遵循现有命名风格（如 `kebab-case`）
   - 保持命名一致性（如条件判断函数以 `is` 或 `if` 开头）

4. **避免副作用** - 助手函数应为纯函数，不修改传入的数据

5. **保持简单** - 每个助手函数应只完成一个明确的任务 