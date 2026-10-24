import * as Sentry from '@sentry/react';

let isSentryInitialized = false;

export async function initRendererSentry() {
  if (isSentryInitialized) return;
  try {
    const config = await window.electronAPI.getSentryConfig();
    if (config.enabled && config.dsn) {
      Sentry.init({
        dsn: config.dsn,
        enabled: true,
        environment: 'renderer',
        tracesSampleRate: 1.0,
        beforeSend(event) {
          return scrubSentryEvent(event);
        }
      });
      isSentryInitialized = true;
      console.log('[Sentry Renderer] Initialized successfully');
    } else {
      console.log('[Sentry Renderer] Disabled or DSN missing');
    }
  } catch (err) {
    console.error('Failed to initialize Sentry in renderer:', err);
  }
}

import { RedactionService } from '@screentutor/shared';

export function scrubSentryEvent(event: any): any {
  return RedactionService.redactMetadata(event);
}

const activeSpans = new Map<string, any>();

export const performanceTracker = {
  startSpan(name: string) {
    try {
      if (activeSpans.has(name)) {
        activeSpans.get(name).end();
        activeSpans.delete(name);
      }
      
      const span = Sentry.startInactiveSpan({ name });
      activeSpans.set(name, span);
      console.log(`[Performance Span] Started: ${name}`);
    } catch (e) {
      console.warn(`[Performance Tracker] Failed to start span ${name}:`, e);
    }
  },

  endSpan(name: string) {
    try {
      const span = activeSpans.get(name);
      if (span) {
        span.end();
        activeSpans.delete(name);
        console.log(`[Performance Span] Ended: ${name}`);
      }
    } catch (e) {
      console.warn(`[Performance Tracker] Failed to end span ${name}:`, e);
    }
  }
};
