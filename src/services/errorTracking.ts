import { logger } from './logger';

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  section?: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

const errorLog: ErrorReport[] = [];
const MAX_ERRORS = 50;

export function reportError(error: Error, context?: { section?: string; componentStack?: string }): void {
  const report: ErrorReport = {
    message: error.message,
    stack: error.stack,
    componentStack: context?.componentStack,
    section: context?.section,
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  errorLog.push(report);

  if (errorLog.length > MAX_ERRORS) {
    errorLog.shift();
  }

  logger.error(`[ErrorTracking] ${error.message}`, {
    section: context?.section,
    stack: error.stack?.split('\n').slice(0, 5).join('\n'),
  });

  // Future: send to Sentry
  // Sentry.captureException(error, { extra: context });
}

export function reportUnhandledError(event: ErrorEvent): void {
  reportError(new Error(event.message), {
    section: 'global',
  });
}

export function reportUnhandledRejection(event: PromiseRejectionEvent): void {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  reportError(error, { section: 'unhandled-promise' });
}

export function initErrorTracking(): void {
  window.addEventListener('error', reportUnhandledError);
  window.addEventListener('unhandledrejection', reportUnhandledRejection);
  logger.info('Error tracking initialized');
}

export function getErrorLog(): readonly ErrorReport[] {
  return errorLog;
}
