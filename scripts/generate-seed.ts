// 种子导出(形态二引导式隔离,需求 R3):读取仓库 YAML,复用根 loadConfig 解析,
// 产出生成 SeedInput JSON(含 settings/page/category 层级),输出到 stdout。
// 用法(node -r ./register-ts.cjs ./scripts/generate-seed.ts > workers/.seed.json):
// 再经 Worker 受保护 POST /api/seed 写入 D1(见 workers/src/routes/seed.ts)。
import { loadConfig } from '../src/lib/config/index.ts';

type SeedSite = {
  name: string;
  url: string;
  description?: string;
  icon?: string;
  faviconUrl?: string;
  external?: boolean;
};
type SeedCategory = { label: string; sites?: SeedSite[]; categories?: SeedCategory[] };
type SeedPage = {
  id: string;
  label: string;
  template?: string;
  hidden?: boolean;
  categories?: SeedCategory[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- config 内部为宽松结构
function siteToSeed(node: any): SeedSite {
  const name = String(node?.name ?? '').trim();
  const url = String(node?.url ?? '').trim();
  if (!name || !url) return { name: '', url: '' };
  return {
    name,
    url,
    ...(node.description ? { description: String(node.description) } : {}),
    ...(node.icon ? { icon: String(node.icon) } : {}),
    ...(node.faviconUrl ? { faviconUrl: String(node.faviconUrl) } : {}),
    ...(node.external === false ? { external: false } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function catToSeed(node: any): SeedCategory {
  const label = String(node?.name ?? '').trim() || '未命名';
  const sites = [
    ...(Array.isArray(node?.sites) ? node.sites : []),
    ...(Array.isArray(node?.items) ? node.items : []),
  ]
    .map(siteToSeed)
    .filter((s) => s.name && s.url);
  const children = [
    ...(Array.isArray(node?.subcategories) ? node.subcategories : []),
    ...(Array.isArray(node?.groups) ? node.groups : []),
    ...(Array.isArray(node?.subgroups) ? node.subgroups : []),
  ].map(catToSeed);
  return {
    label,
    ...(sites.length ? { sites } : {}),
    ...(children.length ? { categories: children } : {}),
  };
}

function main(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = loadConfig() as any;
  const nav = Array.isArray(config.navigation) ? config.navigation : [];
  const seed = {
    settings: {
      site: JSON.stringify(config.site ?? {}),
      navigation: JSON.stringify(nav),
    },
    pages: nav.map((n: { id?: string; name?: string; hidden?: boolean }, i: number) => {
      const pid = String(n.id ?? '').trim();
      const page = pid ? config.pages?.[pid] : undefined;
      const cats = Array.isArray(page?.categories) ? page.categories.map(catToSeed) : [];
      return {
        id: String(n.id ?? '').trim() || `page-${i}`,
        label: String(n.name ?? page?.title ?? n.id ?? '').trim() || '未命名',
        ...(page?.template ? { template: String(page.template) } : {}),
        ...(n.hidden ? { hidden: true } : {}),
        ...(cats.length ? { categories: cats } : {}),
      };
    }),
  };
  process.stdout.write(JSON.stringify(seed) + '\n');
}

main();