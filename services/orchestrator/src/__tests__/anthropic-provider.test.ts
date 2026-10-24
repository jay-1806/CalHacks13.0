import { describe, it, expect } from 'vitest';
import { buildSystemBlocks, parseDataUrl, TUTOR_OUTPUT_SCHEMA } from '../providers/anthropic-provider.js';
import { TUTOR_SYSTEM_PROMPT } from '../prompts/tutor-system-prompt.js';

describe('ClaudeProvider request helpers', () => {
  it('caches the base prompt and the agent override as separate breakpoints', () => {
    const blocks = buildSystemBlocks('## Math override');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe(TUTOR_SYSTEM_PROMPT);
    expect(blocks.every((b) => b.cache_control?.type === 'ephemeral')).toBe(true);
    expect(buildSystemBlocks()).toHaveLength(1);
  });

  it('keeps the system prompt byte-stable across calls (cache prefix)', () => {
    expect(JSON.stringify(buildSystemBlocks('o'))).toBe(JSON.stringify(buildSystemBlocks('o')));
  });

  it('parses JPEG and PNG data URLs and rejects anything else', () => {
    expect(parseDataUrl('data:image/jpeg;base64,AAAA')).toEqual({ mediaType: 'image/jpeg', data: 'AAAA' });
    expect(parseDataUrl('data:image/png;base64,BBBB')).toEqual({ mediaType: 'image/png', data: 'BBBB' });
    expect(parseDataUrl('data:text/plain;base64,CCCC')).toBeNull();
    expect(parseDataUrl(undefined)).toBeNull();
  });

  it('asks for spokenText first so it can stream before the rest of the answer', () => {
    expect(Object.keys(TUTOR_OUTPUT_SCHEMA.properties)[0]).toBe('spokenText');
    expect(TUTOR_OUTPUT_SCHEMA.additionalProperties).toBe(false);
  });
});
