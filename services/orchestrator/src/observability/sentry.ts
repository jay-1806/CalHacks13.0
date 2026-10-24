import * as Sentry from '@sentry/node';
import { config } from '../config.js';
import { RedactionService } from '@screentutor/shared';

export function initOrchestratorSentry() {
  const enabled = config.SENTRY_ENABLED;
  const dsn = config.SENTRY_DSN;

  if (enabled && dsn) {
    Sentry.init({
      dsn,
      enabled: true,
      environment: config.SENTRY_ENVIRONMENT || 'development',
      tracesSampleRate: 1.0,
      beforeSend(event) {
        return scrubSentryEvent(event);
      }
    });
    console.log('[Sentry Orchestrator] Initialized Sentry in orchestrator backend');
  } else {
    console.log('[Sentry Orchestrator] Sentry is disabled in orchestrator backend');
  }
}

export function scrubSentryEvent(event: any): any {
  return RedactionService.redactMetadata(event);
}
