// Phase 6 删除：兼容旧导入路径，转发到 src/lib/config/normalizer.ts 和 validator.ts

module.exports = {
  ...require('../../lib/config/normalizer.ts'),
  ...require('../../lib/config/validator.ts'),
};
