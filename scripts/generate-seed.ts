import fs from 'node:fs';
import { loadConfig } from '../src/lib/config/index.ts';
import { createSeed } from './lib/seed.ts';

/** 引导种子包含配置、导航、正文、图片和当前衍生缓存；不向 D1 或仓库发送数据。 */
function main(): void {
  const json = JSON.stringify(createSeed(loadConfig())) + '\n';
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output 需要文件路径');
    fs.writeFileSync(output, json, 'utf8');
    process.stderr.write('种子已生成：' + output + '\n');
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) main();
