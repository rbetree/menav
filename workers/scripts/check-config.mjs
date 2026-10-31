import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/check-config.mjs <配置文件>');
  process.exit(2);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch {
  console.error(`找不到 ${file}。请从 wrangler.example.jsonc 复制并填写自己的 Cloudflare 资源。`);
  process.exit(1);
}

if (text.includes('REPLACE_WITH_')) {
  console.error(`${file} 仍包含占位符。请先填写 D1、Access 与 Pages 的真实值再部署。`);
  process.exit(1);
}
