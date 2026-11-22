'use strict';

/** 去掉 JSONC 的行注释与块注释，保留字符串内容。 */
function stripJsonComments(input) {
  let out = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    out += char;
  }

  return out;
}

function stripTrailingCommas(input) {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function parseJsonc(input) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(input)));
}

function isPlaceholderValue(value) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.includes('REPLACE_WITH') || trimmed.includes('<');
}

function getD1Binding(section) {
  const bindings = section && section.d1_databases;
  if (!Array.isArray(bindings)) return undefined;
  const first = bindings[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return undefined;
  return first;
}

function getVars(section) {
  const vars = section && section.vars;
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return {};
  return vars;
}

function readEnvFile(filePath) {
  const fs = require('node:fs');
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

module.exports = {
  getD1Binding,
  getVars,
  isPlaceholderValue,
  parseJsonc,
  readEnvFile,
  stripJsonComments,
  stripTrailingCommas,
};
