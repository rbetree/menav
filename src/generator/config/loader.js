// Phase 6 删除：兼容旧导入路径，转发到 src/lib/config/loader.ts 和 resolver.ts

module.exports = {
  ...require('../../lib/config/loader.ts'),
  loadModularConfig: require('../../lib/config/resolver.ts').loadModularConfig,
};
