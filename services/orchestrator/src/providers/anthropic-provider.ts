import { AIProvider } from './ai-provider.js';
import { Subject, TutorInput, TutorResponse, prepareOverlayText, stripForTts, type TutorStreamStep } from '@screentutor/shared';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildUserPrompt, TUTOR_SYSTEM_PROMPT } from '../prompts/tutor-system-prompt.js';
import { JsonArrayItemStreamer } from './json-field-stream.js';
import { oneLine, TutorStepStreamer } from './step-stream.js';

/**
 * Structured-output schema for every tutor turn. Property order matters: the
 * subject (one word) comes first, then the steps, each a spoken line and its
 * drawing tags together, so every step is complete — and can be narrated — as
 * soon as it is written, long before the whole answer is.
 */
export const TUTOR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string', enum: [...Subject.options] },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          spoken: { type: 'string' },
          visual: { type: 'string' },
        },
        required: ['spoken', 'visual'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
    concept: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['subject', 'steps', 'summary', 'concept', 'confidence'],
  additionalProperties: false,
} as const;

/** Server-side refusal fallback, routed by refusal category. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FAST_MODE_BETA = 'fast-mode-2026-02-01';

/**
 * Latency knobs that depend on the model:
 * - speed "fast": Opus fast mode (same model, ~2.5x output speed, premium price)
 * - thinking "off": Sonnet 5.5 uses `between_tools`, Haiku 5.5 `disabled`;
 *   Opus 5.5 cannot turn thinking off, so it keeps adaptive thinking.
 */
export function speedOptions(
  model: string,
  speed: 'standard' | 'fast',
  thinking: 'adaptive' | 'off'
): Record<string, unknown> {
  const betas: string[] = [];
  const options: Record<string, unknown> = {};
  const isOpus = /opus-(5|4-8)/.test(model);
  const isSonnet55 = model.startsWith('claude-sonnet-5-5');
  const isHaiku55 = model.startsWith('claude-haiku-5-5');

  if (speed === 'fast' && isOpus) {
    betas.push(FAST_MODE_BETA);
    options.speed = 'fast';
  }
  if (thinking === 'off') {
    if (isSonnet55) options.thinking = { type: 'between_tools' };
    else if (isHaiku55) options.thinking = { type: 'disabled' };
  }
  // Haiku 5.5 has no server-side refusal fallback; sending one is a 400.
  if (!isHaiku55) {
    betas.push(FALLBACK_BETA);
    options.fallbacks = 'default';
  }
  if (betas.length > 0) options.betas = betas;
  return options;
}

type MediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private anthropic: Anthropic;

  constructor(private apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async analyzeScreenAndQuestion(
    input: TutorInput,
    onStep?: (step: TutorStreamStep) => void,
    systemPromptOverride?: string
  ): Promise<TutorResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API Key not configured.');
    }

    const promptText = buildUserPrompt({
      question: input.question,
      learnerMemory: input.learnerMemory,
      recentTurns: input.recentTurns,
      screenMetadata: input.screenMetadata,
      appMetadata: input.appMetadata,
    });

    const content: Anthropic.ContentBlockParam[] = [];
    const image = parseDataUrl(input.screenshotBase64);
    if (image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.data },
      });
    }
    content.push({ type: 'text', text: promptText });

    try {
      const finalMessage = await this.streamOnce(content, systemPromptOverride, config.CLAUDE_SPEED, onStep).catch(
        (err) => {
          // Fast mode has its own rate limit; on a 429 retry once at standard speed.
          // (A 429 is rejected before any output, so no step has been streamed yet.)
          if (config.CLAUDE_SPEED === 'fast' && err instanceof Anthropic.RateLimitError) {
            console.warn('[Tutor] Fast mode rate-limited, retrying at standard speed.');
            return this.streamOnce(content, systemPromptOverride, 'standard', onStep);
          }
          throw err;
        }
      );
      logUsage(finalMessage.usage);

      if (finalMessage.stop_reason === 'refusal') {
        throw new Error('Claude declined to answer this request.');
      }
      if (finalMessage.stop_reason === 'max_tokens') {
        throw new Error(`Claude response hit max_tokens (${config.CLAUDE_MAX_TOKENS}) before finishing.`);
      }

      const textResponse = finalMessage.content
        .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const parsed = JSON.parse(textResponse);

      // One line per step, in the same order the steps were streamed.
      const steps: Array<{ spoken?: unknown; visual?: unknown }> = Array.isArray(parsed.steps) ? parsed.steps : [];
      delete parsed.steps;
      const rawSpoken = steps.map((s) => oneLine(s.spoken)).join('\n');
      const rawVisual = steps.map((s) => oneLine(s.visual)).join('\n');
      const prepared = prepareOverlayText(rawSpoken, rawVisual);

      parsed.overlayText = prepared.overlayText;
      parsed.visualText = prepared.displayText;
      parsed.spokenText = stripForTts(rawSpoken);
      parsed.spokenExplanation = parsed.spokenText;
      parsed.pointTarget = prepared.pointTarget;
      if (input.screenMetadata?.screenNumber != null && parsed.pointTarget) {
        parsed.pointTarget.screenNumber = input.screenMetadata.screenNumber;
      }
      parsed.drawings = [];

      if (!/\[DRAW:/i.test(prepared.overlayText)) {
        console.warn(
          '[Tutor] Response overlayText has no [DRAW:*] tags — shapes may not render. visualText length:',
          rawVisual.length
        );
      } else {
        console.log('[Tutor] overlayText includes spatial tags (DRAW/POINT)');
      }
      parsed.concept = parsed.concept || 'General Explanation';
      parsed.confidence = parsed.confidence ?? 1.0;
      parsed.summary = parsed.summary || prepared.displayText.slice(0, 80) || 'Explanation';
      parsed.mode = parsed.mode || input.mode;
      // A subject the request asked for wins over what the model reported.
      parsed.subject = input.subject ?? (Subject.safeParse(parsed.subject).success ? parsed.subject : 'general');
      parsed.provider = 'claude';
      parsed.timestamp = new Date().toISOString();
      parsed.rawModelText = textResponse;

      TutorResponse.parse(parsed);
      return parsed as TutorResponse;
    } catch (error) {
      console.error('Claude request or validation failed:', error);
      throw error;
    }
  }

  private async streamOnce(
    content: Anthropic.ContentBlockParam[],
    systemPromptOverride: string | undefined,
    speed: 'standard' | 'fast',
    onStep?: (step: TutorStreamStep) => void
  ) {
    // Typed loosely: speedOptions adds fields (speed, string `fallbacks`) newer than this SDK's types.
    const params: any = {
      model: config.CLAUDE_MODEL,
      max_tokens: config.CLAUDE_MAX_TOKENS,
      system: buildSystemBlocks(systemPromptOverride),
      messages: [{ role: 'user', content }],
      output_config: {
        effort: config.CLAUDE_EFFORT,
        format: { type: 'json_schema', schema: TUTOR_OUTPUT_SCHEMA },
      },
      ...speedOptions(config.CLAUDE_MODEL, speed, config.CLAUDE_THINKING),
    };
    const stream = this.anthropic.beta.messages.stream(params);
    if (onStep) {
      const steps = new TutorStepStreamer(onStep);
      const items = new JsonArrayItemStreamer('steps', (item) => steps.push(item));
      stream.on('text', (textDelta) => items.push(textDelta));
    }
    return stream.finalMessage();
  }
}

/**
 * Base prompt and per-agent override as separate blocks, each a cache breakpoint:
 * the base prefix is shared by every agent, the override is stable per agent.
 * Nothing volatile (question, screenshot, memory) goes in the system prompt.
 */
export function buildSystemBlocks(systemPromptOverride?: string): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: 'text', text: TUTOR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  ];
  if (systemPromptOverride) {
    blocks.push({ type: 'text', text: systemPromptOverride, cache_control: { type: 'ephemeral' } });
  }
  return blocks;
}

export function parseDataUrl(dataUrl?: string): { mediaType: MediaType; data: string } | null {
  const match = dataUrl ? /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(dataUrl) : null;
  if (!match) return null;
  return { mediaType: match[1] as MediaType, data: match[2] };
}

function logUsage(usage: Anthropic.Beta.Messages.BetaUsage): void {
  console.log(
    `[Tutor] tokens in=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} out=${usage.output_tokens}`
  );
}
