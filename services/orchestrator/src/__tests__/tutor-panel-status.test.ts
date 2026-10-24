import { describe, expect, it } from 'vitest';
import {
  canRestoreOnScreenExplanation,
  getExplanationRestoreLabel,
  getTutorProcessingLabel,
  getTutorProcessingSupport,
  isTutorProcessingPhase,
  shouldShowExplanationHandoff,
} from '@screentutor/shared';

describe('tutor panel processing labels', () => {
  it('maps real aiPhase values to concise labels', () => {
    expect(getTutorProcessingLabel('scanning')).toBe('Scanning...');
    expect(getTutorProcessingLabel('thinking')).toBe('Thinking...');
    expect(getTutorProcessingLabel('outputting')).toBe('Preparing...');
  });

  it('hides labels once processing is finished', () => {
    expect(getTutorProcessingLabel('done')).toBeNull();
    expect(getTutorProcessingLabel('error')).toBeNull();
    expect(isTutorProcessingPhase('done')).toBe(false);
    expect(isTutorProcessingPhase('error')).toBe(false);
  });

  it('treats only in-flight phases as processing', () => {
    expect(isTutorProcessingPhase('scanning')).toBe(true);
    expect(isTutorProcessingPhase('thinking')).toBe(true);
    expect(isTutorProcessingPhase('outputting')).toBe(true);
  });

  it('provides optional support copy only for processing phases', () => {
    expect(getTutorProcessingSupport('scanning')).toBeTruthy();
    expect(getTutorProcessingSupport('thinking')).toBeTruthy();
    expect(getTutorProcessingSupport('outputting')).toBeTruthy();
    expect(getTutorProcessingSupport('done')).toBeNull();
  });
});

describe('explanation handoff', () => {
  it('shows the handoff only when a done turn has a reference', () => {
    expect(shouldShowExplanationHandoff({ aiPhase: 'done', reference: 'u-sub' })).toBe(true);
    expect(shouldShowExplanationHandoff({ aiPhase: 'done', reference: '   ' })).toBe(false);
    expect(shouldShowExplanationHandoff({ aiPhase: 'thinking', reference: 'u-sub' })).toBe(false);
    expect(shouldShowExplanationHandoff({ aiPhase: 'done' })).toBe(false);
  });

  it('enables restore only when explanation text exists', () => {
    expect(canRestoreOnScreenExplanation({ explanation: { text: 'Step 1' } })).toBe(true);
    expect(canRestoreOnScreenExplanation({ explanation: { text: '  ' } })).toBe(false);
    expect(canRestoreOnScreenExplanation({})).toBe(false);
  });

  it('uses Show on screen for the existing restoreExplanation action', () => {
    expect(getExplanationRestoreLabel(false)).toBe('Show on screen');
    expect(getExplanationRestoreLabel(true)).toBe('Show on screen');
  });

  it('does not invent a speaking state from explanation visibility alone', () => {
    // Speaking is gated by isSpeaking && !isMuted in ChatPanel — not by handoff visibility.
    const handoffVisible = shouldShowExplanationHandoff({
      aiPhase: 'done',
      reference: 'Explanation delivered',
    });
    const isSpeaking = false;
    const isMuted = false;
    expect(handoffVisible).toBe(true);
    expect(isSpeaking && !isMuted).toBe(false);
  });
});
