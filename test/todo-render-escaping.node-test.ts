const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'HomeDashboard.astro'),
  'utf8'
);

function extractMethod(name) {
  const pattern = new RegExp(`${name}:\\s*function\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n      \\},`);
  const match = source.match(pattern);
  assert.ok(match, `HomeDashboard 应包含 ${name} 方法`);
  return match[1];
}

function createFakeDocument() {
  const container = { innerHTML: '' };
  return {
    container,
    createElement() {
      return {
        _text: '',
        set textContent(value) {
          this._text = String(value);
        },
        get innerHTML() {
          // 模拟浏览器：文本节点写入 innerHTML 时转义 < > &，但不转义引号
          return this._text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
      };
    },
    getElementById(id) {
      return id === 'todo-list' ? container : null;
    },
    querySelector() {
      return null;
    },
  };
}

test('Todo 渲染：标题含引号时转义为 &quot;，不会逃出 title 属性', () => {
  const fakeDocument = createFakeDocument();
  const escapeHtml = new Function(
    'document',
    `return function (text) {${extractMethod('escapeHtml')}};`
  )(fakeDocument);
  const render = new Function('document', `return function () {${extractMethod('render')}};`)(
    fakeDocument
  );

  const app = {
    todos: [{ text: '他说 "你好" <script>alert(1)</script>', done: false }],
    escapeHtml,
    render,
  };
  app.render();

  const html = fakeDocument.container.innerHTML;
  assert.ok(html.includes('title="他说 &quot;你好&quot; &lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.ok(!html.includes('"你好"'));
  assert.ok(!html.includes('<script>'));
});
