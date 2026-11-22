import fs from 'node:fs';

type ConfigRules = {
  stripJsonComments: (input: string) => string;
  stripTrailingCommas: (input: string) => string;
  parseJsonc: (input: string) => Record<string, unknown>;
  isPlaceholderValue: (value: unknown) => boolean;
  getD1Binding: (
    section: Record<string, unknown> | undefined
  ) => Record<string, unknown> | undefined;
  getVars: (section: Record<string, unknown> | undefined) => Record<string, unknown>;
  readEnvFile: (filePath: string) => Record<string, string>;
};

// 与 workers/scripts/check-config.mjs 共用同一套 JSONC 解析与字段规则。
const rules = require('../../workers/scripts/config-rules.cjs') as ConfigRules;

export const stripJsonComments = rules.stripJsonComments;
export const stripTrailingCommas = rules.stripTrailingCommas;
export const parseJsonc = rules.parseJsonc;
export const isPlaceholderValue = rules.isPlaceholderValue;
export const getD1Binding = rules.getD1Binding;
export const getVars = rules.getVars;
export const readEnvFile = rules.readEnvFile;

export function readJsonc(filePath: string): Record<string, unknown> {
  return parseJsonc(fs.readFileSync(filePath, 'utf8'));
}

export function isLocalConfigName(configName: string): boolean {
  return configName.trim() === 'wrangler.local.jsonc';
}

export function isTestConfigName(configName: string): boolean {
  return configName.trim() === 'wrangler.test.jsonc';
}

export function getEnvSection(
  config: Record<string, unknown>,
  envName: string
): Record<string, unknown> | undefined {
  const env = config.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) return undefined;
  const section = (env as Record<string, unknown>)[envName];
  if (!section || typeof section !== 'object' || Array.isArray(section)) return undefined;
  return section as Record<string, unknown>;
}

/** 测试配置只认 env.staging；其余配置使用顶层。 */
export function getEffectiveConfig(
  config: Record<string, unknown>,
  configName: string
): Record<string, unknown> | undefined {
  if (isTestConfigName(configName)) return getEnvSection(config, 'staging');
  return config;
}

/** routes 为可选；存在时必须是 wrangler 支持的字符串或路由对象。 */
export function validateRoutes(routes: unknown): string[] {
  if (routes === undefined) return [];
  if (!Array.isArray(routes)) return ['routes 必须是数组'];
  const errors: string[] = [];
  routes.forEach((route, index) => {
    if (typeof route === 'string') {
      if (!route.trim()) errors.push(`routes[${index}] 为空字符串`);
      return;
    }
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      errors.push(`routes[${index}] 必须是字符串或对象`);
      return;
    }
    const item = route as Record<string, unknown>;
    if (typeof item.pattern !== 'string' || !item.pattern.trim()) {
      errors.push(`routes[${index}].pattern 未填写`);
    }
    if (item.custom_domain !== undefined && typeof item.custom_domain !== 'boolean') {
      errors.push(`routes[${index}].custom_domain 必须是布尔值`);
    }
    if (
      item.zone_name !== undefined &&
      (typeof item.zone_name !== 'string' || !item.zone_name.trim())
    ) {
      errors.push(`routes[${index}].zone_name 未填写`);
    }
    if (item.zone_id !== undefined && (typeof item.zone_id !== 'string' || !item.zone_id.trim())) {
      errors.push(`routes[${index}].zone_id 未填写`);
    }
    const hasZone =
      (typeof item.zone_name === 'string' && Boolean(item.zone_name.trim())) ||
      (typeof item.zone_id === 'string' && Boolean(item.zone_id.trim()));
    if (item.custom_domain !== true && !hasZone) {
      errors.push(`routes[${index}] 需指定 custom_domain: true、zone_name 或 zone_id`);
    }
  });
  return errors;
}
