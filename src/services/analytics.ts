import { logger } from './logger';

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: number;
}

const eventQueue: AnalyticsEvent[] = [];
const MAX_QUEUE_SIZE = 100;

export function trackEvent(name: string, properties?: Record<string, string | number | boolean>): void {
  const event: AnalyticsEvent = {
    name,
    properties,
    timestamp: Date.now(),
  };

  eventQueue.push(event);

  if (eventQueue.length > MAX_QUEUE_SIZE) {
    eventQueue.shift();
  }

  logger.debug(`[Analytics] ${name}`, properties);
}

// Predefined event helpers for type safety
export const analytics = {
  pageView: (page: string) => trackEvent('page_view', { page }),
  featureUsed: (feature: string) => trackEvent('feature_used', { feature }),
  recipeCreated: (method: 'manual' | 'ai' | 'photo') => trackEvent('recipe_created', { method }),
  invoiceScanned: () => trackEvent('invoice_scanned'),
  productScanned: () => trackEvent('product_scanned'),
  temperatureRecorded: (compliant: boolean) => trackEvent('temperature_recorded', { compliant }),
  orderCreated: () => trackEvent('order_created'),
  taskCompleted: () => trackEvent('task_completed'),
  backupPerformed: (type: 'manual' | 'auto') => trackEvent('backup_performed', { type }),
  cloudSyncCompleted: () => trackEvent('cloud_sync_completed'),
  aiAssistantUsed: () => trackEvent('ai_assistant_used'),
  onboardingCompleted: () => trackEvent('onboarding_completed'),
  error: (errorType: string, message: string) => trackEvent('error', { errorType, message }),
} as const;

export function getEventQueue(): readonly AnalyticsEvent[] {
  return eventQueue;
}

export function flushEventQueue(): AnalyticsEvent[] {
  return eventQueue.splice(0);
}
