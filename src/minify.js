const fs = require('fs-extra');
const path = require('path');
const terser = require('terser');
const htmlMinifier = require('html-minifier-terser');
const CleanCSS = require('clean-css');

// --- 核心配置 ---
const TARGET_DIR = 'dist';
const INDEX_HTML = path.join(TARGET_DIR, 'index.html');
const FAVICON_ICO = path.join(TARGET_DIR, 'favicon.ico');

const cleanCss = new CleanCSS({});

// 正则表达式用于匹配 index.html 中对外部 JS、CSS 和 Favicon 的引用
const JS_REGEX = /<script\s+(?:type="text\/javascript"\s+)?src="([^"]+\.js)"\s*><\/script>/gi;
const CSS_LINK_REGEX = /<link\s+rel="stylesheet"\s+href="([^"]+\.css)"(?:\s+\/)?\s*>/gi;
const FAVICON_REGEX = /(<link\s+[^>]*?rel="(?:icon|shortcut\s+icon)"[^>]*?href="([^"]+\.ico)"[^>]*?>)/gi;

// 正则表达式用于匹配 CSS 文件中的 url() 引用 (仅针对字体)
const CSS_URL_REGEX = /url\(['"]?([^'"\)]+\.(?:ttf|woff2))['"]?\)/gi;

const MIME_MAP = {
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
};

/**
 * 将二进制文件转换为 Base64 Data URI
 */
async function convertAssetToBase64(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_MAP[ext];

    if (!mimeType) return null;

    try {
        const buffer = await fs.readFile(filePath);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error(`❌ Base64 转换失败: ${filePath}`, error.message);
        return null;
    }
}

/**
 * 混淆/压缩 JS 代码
 */
async function minifyJsCode(code) {
    const result = await terser.minify(code, {
        compress: true,
        mangle: true,
        output: { comments: false },
    });
    if (result.error) {
        console.error('❌ JS 混淆失败:', result.error);
        return null;
    }
    return result.code;
}

/**
 * 优化 CSS 代码 (替换字体引用, 压缩)
 */
function minifyCssCode(css, base64Assets) {
    // 1. 替换 CSS 中的字体文件引用为 Base64 Data URI
    let modifiedCss = css.replace(CSS_URL_REGEX, (match, urlPath) => {
        const fullPath = path.join(TARGET_DIR, urlPath);
        const base64Uri = base64Assets.get(fullPath);

        if (base64Uri) {
            return `url('${base64Uri}')`;
        }
        return match; // 保留原引用
    });

    // 2. 压缩修改后的 CSS 代码
    const result = cleanCss.minify(modifiedCss);

    if (result.errors.length > 0) {
        console.error('❌ CSS 优化失败:', result.errors);
        return null;
    }
    return result.styles;
}

/**
 * 核心合并与优化 HTML 文件
 */
async function embedAndMinifyHtml(filePath, externalJsCss, faviconBase64) {
    let html = await fs.readFile(filePath, 'utf8');

    // 1. 替换外部 JS 文件引用为内联代码
    html = html.replace(JS_REGEX, (match, srcPath) => {
        const fullPath = path.join(path.dirname(filePath), srcPath);
        const code = externalJsCss.get(fullPath);
        return code ? `<script>${code}</script>` : match;
    });

    // 2. 替换外部 CSS 文件引用为内联代码
    html = html.replace(CSS_LINK_REGEX, (match, hrefPath) => {
        const fullPath = path.join(path.dirname(filePath), hrefPath);
        const code = externalJsCss.get(fullPath);
        return code ? `<style>${code}</style>` : match;
    });

    // 3. 替换 Favicon 引用为 Base64 Data URI
    if (faviconBase64) {
        html = html.replace(FAVICON_REGEX, (match, tag, hrefPath) => {
            if (path.basename(hrefPath).toLowerCase() === 'favicon.ico') {
                return tag.replace(`href="${hrefPath}"`, `href="${faviconBase64}"`);
            }
            return match;
        });
    }

    // 4. 优化 HTML 本身 (包括内联 JS/CSS 再次压缩)
    const result = await htmlMinifier.minify(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyJS: true,
        minifyCSS: true,
    });

    await fs.writeFile(filePath, result);
    console.log(`\n✅ HTML 合并与优化完成: ${filePath}`);
}

/**
 * 主函数：遍历目录并执行操作
 */
async function runMinification() {
    console.log(`开始对目录进行原地处理: ${TARGET_DIR} ...`);

    if (!fs.existsSync(TARGET_DIR) || !fs.existsSync(INDEX_HTML)) {
        console.error(`错误：目标目录 ${TARGET_DIR} 或文件 ${INDEX_HTML} 不存在。`);
        return;
    }

    const base64Assets = new Map(); // {fullPath: Base64URI}
    const externalJsCss = new Map(); // {fullPath: minifiedCode}
    const assetsToDelete = [];

    // --- 1. 收集和处理所有外部资源 ---
    const files = await fs.readdir(TARGET_DIR, { withFileTypes: true });

    for (const dirent of files) {
        const fullPath = path.join(TARGET_DIR, dirent.name);
        if (!dirent.isFile()) continue;

        const ext = path.extname(dirent.name).toLowerCase();

        if (ext === '.ttf' || ext === '.woff2' || ext === '.ico') {
            // A. 字体 / 图标 (Base64 编码)
            const base64Uri = await convertAssetToBase64(fullPath);
            if (base64Uri) {
                base64Assets.set(fullPath, base64Uri);
                assetsToDelete.push(fullPath);
            }
        } else if (ext === '.js') {
            // B. JS (压缩后嵌入 HTML)
            const originalCode = await fs.readFile(fullPath, 'utf8');
            const minifiedCode = await minifyJsCode(originalCode);
            if (minifiedCode) {
                externalJsCss.set(fullPath, minifiedCode);
                assetsToDelete.push(fullPath);
            }
        } else if (ext === '.css') {
            // C. CSS (处理字体引用, 压缩后嵌入 HTML)
            const originalCode = await fs.readFile(fullPath, 'utf8');
            const minifiedCode = minifyCssCode(originalCode, base64Assets);
            if (minifiedCode) {
                externalJsCss.set(fullPath, minifiedCode);
                assetsToDelete.push(fullPath);
            }
        }
    }

    // --- 2. 处理 index.html：嵌入代码并压缩 ---
    const faviconBase64 = base64Assets.get(FAVICON_ICO) || null;
    await embedAndMinifyHtml(INDEX_HTML, externalJsCss, faviconBase64);

    // --- 3. 删除已合并的文件 ---
    const deletePromises = assetsToDelete.map(p => fs.remove(p));
    await Promise.all(deletePromises);
    console.log(`✨ 所有指定文件原地处理完毕！目录 ${TARGET_DIR} 已实现单文件打包。`);
}

runMinification().catch(err => {
    console.error('致命错误:', err);
});