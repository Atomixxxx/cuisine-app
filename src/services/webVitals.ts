import type { Metric } from 'web-vitals';
import { logger } from './logger';

function reportMetric(metric: Metric): void {
  logger.info(`[WebVital] ${metric.name}`, {
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
  });

  // Send to analytics if configured
  if (typeof window !== 'undefined' && window.__ANALYTICS_ENDPOINT__) {
    navigator.sendBeacon?.(
      window.__ANALYTICS_ENDPOINT__,
      JSON.stringify({
        type: 'web-vital',
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        url: window.location.pathname,
        timestamp: Date.now(),
      }),
    );
  }
}

export async function initWebVitals(): Promise<void> {
  try {
    const { onCLS, onLCP, onFCP, onTTFB, onINP } = await import('web-vitals');
    onCLS(reportMetric);
    onLCP(reportMetric);
    onFCP(reportMetric);
    onTTFB(reportMetric);
    onINP(reportMetric);
    logger.info('Web Vitals monitoring initialized');
  } catch (error) {
    logger.warn('Web Vitals init failed', { error });
  }
}

declare global {
  interface Window {
    __ANALYTICS_ENDPOINT__?: string;
  }
}
