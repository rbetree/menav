type LogMeta = Record<string, unknown>;
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OK';
type LogMethod = (message: string, meta?: LogMeta) => void;

interface Logger {
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  ok: LogMethod;
}

function parseBooleanEnv(value: unknown): boolean {
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

function isVerbose(): boolean {
  return parseBooleanEnv(process.env.MENAV_VERBOSE) || parseBooleanEnv(process.env.DEBUG);
}

function isColorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (parseBooleanEnv(process.env.FORCE_COLOR)) return true;
  return Boolean(
    (process.stdout && process.stdout.isTTY) || (process.stderr && process.stderr.isTTY)
  );
}

function colorize(text: string, ansiCode?: number): string {
  if (!ansiCode || !isColorEnabled()) return text;
  return `\x1b[${ansiCode}m${text}\x1b[0m`;
}

function formatMeta(meta?: LogMeta | null): string {
  if (!meta || typeof meta !== 'object') return '';
  const entries = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`);

  if (entries.length === 0) return '';
  return ` (${entries.join(', ')})`;
}

function formatPrefix(level: LogLevel): string {
  const base = `[${level}]`;
  if (level === 'ERROR') return colorize(base, 31);
  if (level === 'WARN') return colorize(base, 33);
  if (level === 'OK') return colorize(base, 32);
  return base;
}

function writeLine(level: LogLevel, scope: string, message: string, meta?: LogMeta): void {
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

function createLogger(scope?: string): Logger {
  const normalized = scope ? String(scope) : '';
  return {
    info: (message: string, meta?: LogMeta) => writeLine('INFO', normalized, message, meta),
    warn: (message: string, meta?: LogMeta) => writeLine('WARN', normalized, message, meta),
    error: (message: string, meta?: LogMeta) => writeLine('ERROR', normalized, message, meta),
    ok: (message: string, meta?: LogMeta) => writeLine('OK', normalized, message, meta),
  };
}

function startTimer(): () => number {
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
