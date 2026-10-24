import { describe, it, expect } from 'vitest';
import { JsonStringFieldStreamer } from '../providers/json-field-stream.js';

function collect(field: string, chunks: string[]): { text: string; finished: boolean } {
  let text = '';
  const streamer = new JsonStringFieldStreamer(field, (chars) => {
    text += chars;
  });
  for (const chunk of chunks) streamer.push(chunk);
  return { text, finished: streamer.finished };
}

describe('JsonStringFieldStreamer', () => {
  const json = JSON.stringify({
    spokenText: 'Line one says "hi".\nLine two \\ done — π',
    visualText: '[DRAW:clear] x',
  });

  it('emits the decoded field value when given the whole object', () => {
    const { text, finished } = collect('spokenText', [json]);
    expect(text).toBe('Line one says "hi".\nLine two \\ done — π');
    expect(finished).toBe(true);
  });

  it('produces the same text when the JSON arrives one character at a time', () => {
    const { text } = collect('spokenText', json.split(''));
    expect(text).toBe(JSON.parse(json).spokenText);
  });

  it('handles the key split across chunks and \\u escapes split mid-sequence', () => {
    const { text } = collect('spokenText', ['{"spo', 'kenText"', ' : "a\\u00', 'e9b', '", "x": 1}']);
    expect(text).toBe('aéb');
  });

  it('ignores other fields and stops at the closing quote', () => {
    const { text } = collect('visualText', [json]);
    expect(text).toBe('[DRAW:clear] x');
  });

  it('emits nothing when the field never appears', () => {
    const { text, finished } = collect('spokenText', ['{"summary": "s"}']);
    expect(text).toBe('');
    expect(finished).toBe(false);
  });
});
