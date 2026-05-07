type ErrorSuggestion = string;
type ErrorContext = Record<string, unknown>;
type MaybeString = string | null;

type ErrorWithMetadata = Error & {
  filePath?: MaybeString;
  templatePath?: MaybeString;
  context?: ErrorContext;
  suggestions?: ErrorSuggestion[];
};

class ConfigError extends Error {
  suggestions: ErrorSuggestion[];

  constructor(message: string, suggestions: ErrorSuggestion[] = []) {
    super(message);
    this.name = 'ConfigError';
    this.suggestions = suggestions;
  }
}

class TemplateError extends Error {
  templatePath: MaybeString;

  constructor(message: string, templatePath: MaybeString = null) {
    super(message);
    this.name = 'TemplateError';
    this.templatePath = templatePath;
  }
}

class BuildError extends Error {
  context: ErrorContext;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);
    this.name = 'BuildError';
    this.context = context;
  }
}

class FileError extends Error {
  filePath: MaybeString;
  suggestions: ErrorSuggestion[];

  constructor(message: string, filePath: MaybeString = null, suggestions: ErrorSuggestion[] = []) {
    super(message);
    this.name = 'FileError';
    this.filePath = filePath;
    this.suggestions = suggestions;
  }
}

function handleError(error: ErrorWithMetadata, exitCode = 1): never {
  const logger = require('./logging/logger.ts') as {
    formatPrefix: (level: 'INFO' | 'WARN' | 'ERROR' | 'OK') => string;
    isVerbose: () => boolean;
  };

  console.error(`\n${logger.formatPrefix('ERROR')} ${error.name}: ${error.message}`);

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
    error.suggestions.forEach((suggestion: string, index: number) => {
      console.error(`  ${index + 1}) ${suggestion}`);
    });
  }

  if (process.env.DEBUG) {
    console.error('\n堆栈:');
    console.error(error.stack || String(error));
  } else if (logger.isVerbose() && error.stack) {
    console.error('\n堆栈:');
    console.error(error.stack);
  } else {
    console.error('\n提示: DEBUG=1 查看堆栈');
  }

  console.error();
  process.exit(exitCode);
}

function wrapAsyncError<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      const knownError =
        error instanceof ConfigError ||
        error instanceof TemplateError ||
        error instanceof BuildError ||
        error instanceof FileError
          ? error
          : null;

      if (knownError) {
        return handleError(knownError);
      }

      const unknownError = error instanceof Error ? error : new Error(String(error));
      return handleError(
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
