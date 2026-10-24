import { config } from '../config.js';
import crypto from 'crypto';
import { RedactionService } from '@screentutor/shared';
import { context, trace, SpanKind, SpanStatusCode, type Attributes, type Context, type Span, type Tracer } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

export interface ObservabilityService {
  startTrace(name: string, metadata?: Record<string, any>): string;
  addSpan(traceId: string, name: string, metadata?: Record<string, any>): string;
  recordEvent(traceId: string, eventName: string, metadata?: Record<string, any>): void;
  recordEvaluation(traceId: string, evalName: string, score: number, metadata?: Record<string, any>): void;
  endTrace(traceId: string, metadata?: Record<string, any>): void;
  isConfigured(): boolean;
}

export class NoopObservabilityService implements ObservabilityService {
  isConfigured(): boolean {
    return false;
  }

  startTrace(name: string, metadata?: Record<string, any>): string {
    return crypto.randomBytes(16).toString('hex');
  }

  addSpan(traceId: string, name: string, metadata?: Record<string, any>): string {
    return crypto.randomBytes(8).toString('hex');
  }

  recordEvent(traceId: string, eventName: string, metadata?: Record<string, any>): void {}

  recordEvaluation(traceId: string, evalName: string, score: number, metadata?: Record<string, any>): void {}

  endTrace(traceId: string, metadata?: Record<string, any>): void {}
}

interface OtlpOptions {
  /** OTLP/HTTP base URL; traces go to `${endpoint}/v1/traces` */
  endpoint: string;
  /** Extra exporter headers, e.g. { Authorization: 'ApiKey ...' } for Elastic */
  headers?: Record<string, string>;
  serviceName?: string;
  environment?: string;
}

interface ActiveTrace {
  root: Span;
  current?: Span;
  ctx: Context;
}

/**
 * Exports tutor traces over OTLP/HTTP (protobuf) — Elastic Observability's
 * managed OTLP endpoint, or any OTel collector. Each pipeline step is a child
 * span that ends when the next one starts, so step latencies are real.
 *
 * Uses its own provider (never registered globally) so it does not interfere
 * with Sentry's OpenTelemetry setup.
 */
export class OtlpObservabilityService implements ObservabilityService {
  private provider: BasicTracerProvider;
  private tracer: Tracer;
  private traces = new Map<string, ActiveTrace>();

  constructor(private options: OtlpOptions, exporter?: SpanExporter) {
    const spanExporter =
      exporter ??
      new OTLPTraceExporter({
        url: `${options.endpoint.replace(/\/+$/, '')}/v1/traces`,
        headers: options.headers,
      });
    this.provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        'service.name': options.serviceName ?? 'screentutor-orchestrator',
        'deployment.environment': options.environment ?? config.NODE_ENV,
      }),
      spanProcessors: [exporter ? new SimpleSpanProcessor(spanExporter) : new BatchSpanProcessor(spanExporter)],
    });
    this.tracer = this.provider.getTracer('screentutor-traces');
  }

  isConfigured(): boolean {
    return !!this.options.endpoint;
  }

  startTrace(name: string, metadata?: Record<string, any>): string {
    const root = this.tracer.startSpan(name, { kind: SpanKind.SERVER, attributes: toAttributes(this.scrub(metadata)) });
    const traceId = root.spanContext().traceId;
    this.traces.set(traceId, { root, ctx: trace.setSpan(context.active(), root) });
    return traceId;
  }

  addSpan(traceId: string, name: string, metadata?: Record<string, any>): string {
    const active = this.traces.get(traceId);
    if (!active) return '';
    active.current?.end();
    const span = this.tracer.startSpan(name, { attributes: toAttributes(this.scrub(metadata)) }, active.ctx);
    active.current = span;
    return span.spanContext().spanId;
  }

  recordEvent(traceId: string, eventName: string, metadata?: Record<string, any>): void {
    const active = this.traces.get(traceId);
    if (!active) return;
    (active.current ?? active.root).addEvent(eventName, toAttributes(this.scrub(metadata)));
  }

  recordEvaluation(traceId: string, evalName: string, score: number, metadata?: Record<string, any>): void {
    const active = this.traces.get(traceId);
    if (!active) return;
    active.root.setAttribute(`eval.${evalName}`, score);
    active.root.addEvent(`evaluation.${evalName}`, { score, ...toAttributes(this.scrub(metadata)) });
  }

  endTrace(traceId: string, metadata?: Record<string, any>): void {
    const active = this.traces.get(traceId);
    if (!active) return;
    this.traces.delete(traceId);
    const attrs = this.scrub(metadata);
    active.root.setAttributes(toAttributes(attrs));
    if (attrs.errorType) {
      active.root.setStatus({ code: SpanStatusCode.ERROR, message: String(attrs.errorMessage ?? attrs.errorType) });
    }
    active.current?.end();
    active.root.end();
  }

  /** Flush buffered spans (call on shutdown). */
  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }

  private scrub(metadata?: Record<string, any>): Record<string, any> {
    return metadata ? RedactionService.redactMetadata(metadata) : {};
  }
}

function toAttributes(metadata: Record<string, any>): Attributes {
  const attrs: Attributes = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    attrs[key] = typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
  }
  return attrs;
}
