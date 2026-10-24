import { describe, it, expect } from 'vitest';
import { buildUserPrompt, formatSessionHistoryForPrompt } from '../prompts/tutor-system-prompt.js';
import type { SessionTurn } from '@screentutor/shared';

const sampleTurns: SessionTurn[] = [
  {
    sessionId: 's1',
    userId: 'u1',
    timestamp: '2026-06-21T00:00:00.000Z',
    mode: 'explain',
    question: 'What is the distributive property?',
    concept: 'distributive_property',
    responseSummary: 'Multiply the outer term by each term inside the parentheses.',
    pointTargetValid: true,
    provider: 'claude',
  },
  {
    sessionId: 's1',
    userId: 'u1',
    timestamp: '2026-06-21T00:01:00.000Z',
    mode: 'hint',
    question: 'Can you give me a hint for the next step?',
    concept: 'distributive_property',
    responseSummary: 'Focus on the sign between the terms inside the parentheses.',
    hintLevel: 1,
    pointTargetValid: false,
    provider: 'claude',
  },
];

describe('recent session turns in Claude prompt', () => {
  it('formats session turns as compact history lines', () => {
    const formatted = formatSessionHistoryForPrompt(sampleTurns);
    expect(formatted).toContain('1. [explain]');
    expect(formatted).toContain('Question: "What is the distributive property?"');
    expect(formatted).toContain('Concept: distributive_property');
    expect(formatted).toContain('2. [hint]');
  });

  it('includes recent turns and continuity instructions in buildUserPrompt', () => {
    const prompt = buildUserPrompt({
      question: 'Why did we multiply by negative two?',
      mode: 'explain',
      recentTurns: sampleTurns,
    });

    expect(prompt).toContain('Recent conversation in this session (oldest first):');
    expect(prompt).toContain('What is the distributive property?');
    expect(prompt).toContain('as we saw before');
    expect(prompt).toContain('Why did we multiply by negative two?');
  });

  it('omits history section when there are no prior turns', () => {
    const prompt = buildUserPrompt({
      question: 'Explain this step.',
      mode: 'explain',
    });

    expect(prompt).not.toContain('Recent conversation in this session');
  });

  it('includes coordinate guide from screenMetadata alongside session history', () => {
    const prompt = buildUserPrompt({
      question: 'Point to the hypotenuse.',
      mode: 'explain',
      recentTurns: sampleTurns,
      screenMetadata: {
        imageWidth: 1920,
        imageHeight: 1080,
        screenNumber: 1,
      },
    });

    expect(prompt).toContain('COORDINATE SYSTEM');
    expect(prompt).toContain('1920×1080');
    expect(prompt).toContain('Recent conversation in this session');
  });
});
