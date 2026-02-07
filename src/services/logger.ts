type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    message,
    context,
  };

  const prefix = `[CuisineControl][${entry.level}] ${entry.message}`;
  if (entry.context) {
    // Keep browser logs machine-readable while still easy to scan.
    console[level](prefix, entry);
  } else {
    console[level](prefix);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};
