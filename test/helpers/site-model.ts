const { buildSiteModel } = require('../../src/lib/site-model/index.ts');
const { collectSiteExternalData } = require('../../src/lib/site-model/external-data.ts');
const { createRenderContext } = require('../../src/lib/view-data/render-context.ts');
const { generateFontCss, generateFontLinks } = require('../../src/lib/html/fonts.ts');

const GLOBAL_KEYS = new Set([
  'site',
  'navigation',
  'pages',
  'homePageId',
  'renderContext',
  'fonts',
  'profile',
  'social',
  'icons',
  'rss',
  'github',
  'theme',
  'security',
]);

function clonePage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function toResolvedConfig(input) {
  if (input && input.pages && input.renderContext && input.homePageId) return input;

  const pages = { ...(input.pages || {}) };
  Object.entries(input).forEach(([key, value]) => {
    if (GLOBAL_KEYS.has(key)) return;
    if (value && typeof value === 'object' && !Array.isArray(value)) pages[key] = clonePage(value);
  });

  const navigation = Array.isArray(input.navigation) ? input.navigation : [];
  const homePageId = input.homePageId || (navigation[0] ? String(navigation[0].id) : 'home');
  const config = {
    ...input,
    pages,
    homePageId,
  };
  config.renderContext = input.renderContext || createRenderContext(config);
  return config;
}

function buildTestSiteModel(input, options = {}) {
  const config = toResolvedConfig(input);
  return buildSiteModel({
    config,
    externalData:
      options.externalData === undefined ? collectSiteExternalData(config) : options.externalData,
    now: options.now,
    version: options.version,
  });
}

function prepareTestPageData(pageId, input, options = {}) {
  const model = buildTestSiteModel(input, options);
  const page = model.pages.find((entry) => entry.id === pageId);
  if (!page) throw new Error('测试页面不存在：' + pageId);
  return { data: page.data, templateName: page.templateName || 'page' };
}

function prepareTestSiteRenderData(input, options = {}) {
  const model = buildTestSiteModel(input, options);
  return {
    config: model.config,
    pages: model.pages,
    navigationData: model.navigationData,
    renderContext: model.renderContext,
    fontLinks: generateFontLinks(model.config),
    fontCss: generateFontCss(model.config),
    currentYear: model.meta.generatedAt.getFullYear(),
    runtimeConfigJson: model.runtimeConfigJson,
    model,
  };
}

module.exports = {
  buildTestSiteModel,
  prepareTestPageData,
  prepareTestSiteRenderData,
  toResolvedConfig,
};
