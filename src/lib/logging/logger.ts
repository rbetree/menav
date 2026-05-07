/** @param {unknown} value */
function parseBooleanEnv(value) {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'y' ||
    normalized === 'on'
  );
}

function isVerbose() {
  return parseBooleanEnv(process.env.MENAV_VERBOSE) || parseBooleanEnv(process.env.DEBUG);
}

function isColorEnabled() {
  if (process.env.NO_COLOR) return false;
  if (parseBooleanEnv(process.env.FORCE_COLOR)) return true;
  return Boolean(
    (process.stdout && process.stdout.isTTY) || (process.stderr && process.stderr.isTTY)
  );
}

/** @param {string} text @param {number} [ansiCode] */
function colorize(text, ansiCode) {
  if (!ansiCode || !isColorEnabled()) return text;
  return `\x1b[${ansiCode}m${text}\x1b[0m`;
}

/** @param {Record<string, unknown> | null | undefined} meta */
function formatMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const entries = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`);

  if (entries.length === 0) return '';
  return ` (${entries.join(', ')})`;
}

/** @param {string} level */
function formatPrefix(level) {
  const base = `[${level}]`;
  if (level === 'ERROR') return colorize(base, 31);
  if (level === 'WARN') return colorize(base, 33);
  if (level === 'OK') return colorize(base, 32);
  return base;
}

/**
 * @param {string} level
 * @param {string} scope
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
function writeLine(level, scope, message, meta) {
  const prefix = formatPrefix(level);
  const scopePart = scope ? ` ${scope}:` : '';
  const line = `${prefix}${scopePart} ${message}${formatMeta(meta)}`;

  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** @param {string} [scope] */
function createLogger(scope) {
  const normalized = scope ? String(scope) : '';
  return {
    info: (message, meta) => writeLine('INFO', normalized, message, meta),
    warn: (message, meta) => writeLine('WARN', normalized, message, meta),
    error: (message, meta) => writeLine('ERROR', normalized, message, meta),
    ok: (message, meta) => writeLine('OK', normalized, message, meta),
  };
}

function startTimer() {
  const startedAt = process.hrtime.bigint();
  return () => Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

module.exports = {
  createLogger,
  formatMeta,
  formatPrefix,
  isColorEnabled,
  isVerbose,
  parseBooleanEnv,
  startTimer,
};
