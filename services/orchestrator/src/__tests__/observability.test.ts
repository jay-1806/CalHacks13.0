import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NoopObservabilityService, OtlpObservabilityService } from '../observability/observability-service.js';
import { TutorOrchestrator } from '../orchestrator/tutor-orchestrator.js';
import { InMemoryService } from '../memory/in-memory.js';
import { FakeTutorProvider } from './fake-provider.js';
import type { TutorInput } from '@screentutor/shared';

describe('NoopObservabilityService', () => {
  it('handles tracing without emitting OTLP logs', () => {
    const obs = new NoopObservabilityService();
    expect(obs.isConfigured()).toBe(false);

    const traceId = obs.startTrace('trace-noop');
    expect(traceId.length).toBe(32);
    expect(obs.addSpan(traceId, 'span-noop').length).toBe(16);
  });
});

describe('OtlpObservabilityService (Elastic)', () => {
  let exporter: InMemorySpanExporter;
  let obs: OtlpObservabilityService;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    obs = new OtlpObservabilityService({ endpoint: 'https://example.ingest.elastic.cloud:443' }, exporter);
  });

  it('scrubs passwords, api keys, and accessibility trees before export', () => {
    const traceId = obs.startTrace('trace-secure', {
      apiKey: 'secret_anthropic_key',
      password: 'mypassword123',
      windowTitle: 'Super Password Manager',
      accessibilityTree: { nodes: [{ id: '1', role: 'button', name: 'Submit' }] },
      mode: 'quiz',
    });
    obs.endTrace(traceId);

    const [root] = exporter.getFinishedSpans();
    expect(root.attributes.apiKey).toBe('[REDACTED]');
    expect(root.attributes.password).toBe('[REDACTED]');
    expect(root.attributes.windowTitlePresent).toBe(true);
    expect(root.attributes.accessibilityTreeNodesCount).toBe(1);
    expect(root.attributes.mode).toBe('quiz');
    expect(JSON.stringify(root.attributes)).not.toContain('mypassword123');
  });

  it('exports each step as a child span that ends when the next step starts', () => {
    const traceId = obs.startTrace('TutorRequestReceived');
    obs.addSpan(traceId, 'MemoryFetch');
    obs.recordEvent(traceId, 'MemoryFetched', { recentTurnsCount: 2 });
    obs.addSpan(traceId, 'ClaudeModelCall');
    obs.recordEvaluation(traceId, 'point_tag_valid', 1, { passed: true });
    obs.endTrace(traceId, { latencyMs: 42 });

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'TutorRequestReceived')!;
    const memory = spans.find((s) => s.name === 'MemoryFetch')!;
    const model = spans.find((s) => s.name === 'ClaudeModelCall')!;

    expect(spans).toHaveLength(3);
    expect(root.spanContext().traceId).toBe(traceId);
    expect(memory.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(model.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(memory.events.map((e) => e.name)).toEqual(['MemoryFetched']);
    expect(root.attributes['eval.point_tag_valid']).toBe(1);
    expect(root.attributes.latencyMs).toBe(42);
  });

  it('marks the root span as an error when the trace ends with an error', () => {
    const traceId = obs.startTrace('TutorRequestReceived');
    obs.endTrace(traceId, { errorType: 'Error', errorMessage: 'boom' });
    expect(exporter.getFinishedSpans()[0].status.code).toBe(2); // SpanStatusCode.ERROR
  });
});

describe('TutorOrchestrator Evaluations Integration', () => {
  let orchestrator: TutorOrchestrator;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    const memory = new InMemoryService();
    exporter = new InMemorySpanExporter();
    orchestrator = new TutorOrchestrator(
      new FakeTutorProvider(),
      memory,
      new OtlpObservabilityService({ endpoint: 'https://example.ingest.elastic.cloud:443' }, exporter)
    );
  });

  it('runs evaluations, populates response metadata and exports the trace', async () => {
    const input: TutorInput = {
      userId: 'user_123',
      sessionId: 'sess_123',
      mode: 'explain',
      question: 'Explain this step',
    };

    const response = await orchestrator.handleQuestion(input);
    expect(response.observability!.traceId).toBeDefined();
    expect(response.observability!.latencyMs).toBeGreaterThanOrEqual(0);

    const evals = response.observability!.evaluations;
    expect(evals.point_tag_valid.passed).toBe(true);
    expect(evals.has_drawings.passed).toBe(true);
    expect(evals.steps_aligned.passed).toBe(true);
    expect(evals.safety_redaction_passed.passed).toBe(true);

    const names = exporter.getFinishedSpans().map((s) => s.name);
    expect(names).toContain('TutorRequestReceived');
    expect(names).toContain('ClaudeModelCall');
  });
});
