import * as Sentry from '@sentry/node';
import { RedactionService } from '@screentutor/shared';

export function initSentry() {
  const enabled = process.env.SENTRY_ENABLED === 'true';
  const dsn = process.env.SENTRY_DSN || '';

  if (enabled && dsn) {
    Sentry.init({
      dsn,
      enabled: true,
      environment: process.env.SENTRY_ENVIRONMENT || 'development',
      tracesSampleRate: 1.0,
      beforeSend(event) {
        return scrubSentryEvent(event);
      }
    });
    console.log('[Sentry Main] Initialized Sentry in main process');
  } else {
    console.log('[Sentry Main] Sentry is disabled in main process');
  }
}

export function scrubSentryEvent(event: any): any {
  return RedactionService.redactMetadata(event);
}
