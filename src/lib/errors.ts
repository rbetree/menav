class ConfigError extends Error {
  /** @param {string} message @param {string[]} [suggestions] */
  constructor(message, suggestions = []) {
    super(message);
    this.name = 'ConfigError';
    this.suggestions = suggestions;
  }
}

class TemplateError extends Error {
  /** @param {string} message @param {string | null} [templatePath] */
  constructor(message, templatePath = null) {
    super(message);
    this.name = 'TemplateError';
    this.templatePath = templatePath;
  }
}

class BuildError extends Error {
  /** @param {string} message @param {Record<string, unknown>} [context] */
  constructor(message, context = {}) {
    super(message);
    this.name = 'BuildError';
    this.context = context;
  }
}

class FileError extends Error {
  /** @param {string} message @param {string | null} [filePath] @param {string[]} [suggestions] */
  constructor(message, filePath = null, suggestions = []) {
    super(message);
    this.name = 'FileError';
    this.filePath = filePath;
    this.suggestions = suggestions;
  }
}

/**
 * @param {Error & {
 *   filePath?: string | null,
 *   templatePath?: string | null,
 *   context?: Record<string, unknown>,
 *   suggestions?: string[]
 * }} error
 * @param {number} [exitCode]
 */
function handleError(error, exitCode = 1) {
  const { formatPrefix, isVerbose } = require('./logging/logger.ts');

  console.error(`\n${formatPrefix('ERROR')} ${error.name}: ${error.message}`);

  if (error.filePath || error.templatePath) {
    const location = error.filePath || error.templatePath;
    console.error(`位置: ${location}`);
  }

  if (error.context && Object.keys(error.context).length > 0) {
    console.error('上下文:');
    for (const [key, value] of Object.entries(error.context)) {
      console.error(`  ${key}: ${value}`);
    }
  }

  if (error.suggestions && error.suggestions.length > 0) {
    console.error('建议:');
    error.suggestions.forEach((suggestion, index) => {
      console.error(`  ${index + 1}) ${suggestion}`);
    });
  }

  if (process.env.DEBUG) {
    console.error('\n堆栈:');
    console.error(error.stack || String(error));
  } else if (isVerbose() && error.stack) {
    console.error('\n堆栈:');
    console.error(error.stack);
  } else {
    console.error('\n提示: DEBUG=1 查看堆栈');
  }

  console.error();
  process.exit(exitCode);
}

/**
 * @template {unknown[]} TArgs
 * @template TResult
 * @param {(...args: TArgs) => Promise<TResult> | TResult} fn
 */
function wrapAsyncError(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (
        error instanceof ConfigError ||
        error instanceof TemplateError ||
        error instanceof BuildError ||
        error instanceof FileError
      ) {
        handleError(error);
      }

      const unknownError = error instanceof Error ? error : new Error(String(error));
      handleError(
        new BuildError(unknownError.message || '未知错误', {
          原始错误类型: unknownError.name || 'Error',
        })
      );
    }
  };
}

module.exports = {
  ConfigError,
  TemplateError,
  BuildError,
  FileError,
  handleError,
  wrapAsyncError,
};
