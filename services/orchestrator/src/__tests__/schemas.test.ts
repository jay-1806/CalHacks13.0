import { describe, it, expect } from 'vitest';
import { TutorInput, DrawingCommand } from '@screentutor/shared';

describe('Zod Schemas', () => {
  it('should parse valid TutorInput', () => {
    const valid = {
      userId: 'user1',
      sessionId: 'session1',
      mode: 'explain',
      question: 'What is this?',
      screenMetadata: { width: 1920, height: 1080 }
    };
    const parsed = TutorInput.parse(valid);
    expect(parsed.mode).toBe('explain');
  });

  it('should reject invalid mode', () => {
    const invalid = {
      userId: 'u1',
      sessionId: 's1',
      mode: 'invalid_mode',
      question: 'q'
    };
    expect(() => TutorInput.parse(invalid)).toThrow();
  });

  it('should parse valid DrawingCommand', () => {
    const cmd = {
      id: 'd1',
      type: 'circle',
      coordinates: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
      confidence: 0.9
    };
    expect(DrawingCommand.parse(cmd).type).toBe('circle');
  });
});
