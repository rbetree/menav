// 从 Font Awesome 免费版的元数据生成管理台图标选择器所需的图标清单。
// 只保留图标名，不包含 SVG：选择器用 <i class="fas fa-xxx"> 预览，与公开站渲染一致。
// 用法：node scripts/build-icon-data.mjs <fontawesome 包目录>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STYLES = [
  ['solid', 'fa6-solid', 'fas fa-'],
  ['regular', 'fa6-regular', 'far fa-'],
  ['brands', 'fa6-brands', 'fab fa-'],
];

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sourceDir =
  process.argv[2] ?? path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free');
const metadataPath = path.join(sourceDir, 'metadata', 'icon-families.json');
const outputDir = path.join(root, 'admin', 'icons');

const families = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
fs.mkdirSync(outputDir, { recursive: true });

for (const [style, prefix, classPrefix] of STYLES) {
  const icons = Object.keys(families)
    .filter((name) => families[name].svgs?.classic?.[style])
    .sort();
  const payload = {
    prefix,
    iconFormat: 'i',
    classPrefix,
    icons: Object.fromEntries(icons.map((name) => [name, {}])),
  };
  fs.writeFileSync(path.join(outputDir, `${prefix}.json`), JSON.stringify(payload));
  console.log(`${prefix}: ${icons.length} 个图标`);
}
