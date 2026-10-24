import { useState, useCallback, useRef } from 'react';
import type { TutorMode, TutorResponse } from '@screentutor/shared';

import type { StoredExplanation } from '../types/explanation';

export type AiPhase = 'scanning' | 'thinking' | 'outputting' | 'done' | 'error';

export interface ChatTurn {
  id: string;
  userText: string;
  mode: TutorMode;
  aiPhase: AiPhase;
  reference?: string;
  explanation?: StoredExplanation;
  error?: string;
}

const MODE_LABELS: Record<TutorMode, string> = {
  explain: 'Explanation',
  hint: 'Hint',
  mistake: 'Mistake check',
  quiz: 'Quiz',
  review: 'Review',
  research: 'Research',
  codrive: 'Co-drive',
};

function getTurnReference(response: TutorResponse, mode: TutorMode): string {
  if (response.summary && response.summary !== 'Thinking...') {
    return response.summary;
  }
  return `${MODE_LABELS[mode]} delivered`;
}

function buildExplanation(response: TutorResponse): StoredExplanation | undefined {
  const pt = response.pointTarget;
  if (!pt || pt.x === null || pt.y === null) return undefined;

  const text =
    response.overlayText ||
    response.visualText ||
    response.spokenText ||
    response.spokenExplanation ||
    '';
  if (!text.trim()) return undefined;

  return {
    text,
    anchorX: 0,
    anchorY: 0,
    dragOffsetX: 0,
    dragOffsetY: 0,
    visible: true,
  };
}

export function useChatHistory() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);

  const startTurn = useCallback((userText: string, mode: TutorMode) => {
    const id = crypto.randomUUID();
    const turn: ChatTurn = { id, userText, mode, aiPhase: 'scanning' };
    setTurns(prev => [...prev, turn]);
    setActiveTurnId(id);
    activeTurnIdRef.current = id;
    return id;
  }, []);

  const resetTurns = useCallback(() => {
    setTurns([]);
    setActiveTurnId(null);
    activeTurnIdRef.current = null;
  }, []);

  const syncActiveTurn = useCallback((params: {
    isScanning: boolean;
    isLoading: boolean;
    isStreaming: boolean;
    isSpeaking: boolean;
    isResponseReady: boolean;
    responseDelivered: boolean;
    response: TutorResponse | null;
    error: string | null;
  }) => {
    const id = activeTurnIdRef.current;
    if (!id) return;

    setTurns(prev => prev.map(turn => {
      if (turn.id !== id) return turn;

      if (params.error) {
        return { ...turn, aiPhase: 'error' as const, error: params.error };
      }

      if (params.isScanning) {
        return { ...turn, aiPhase: 'scanning' as const };
      }

      if (!params.isResponseReady) {
        return { ...turn, aiPhase: 'thinking' as const };
      }

      if (!params.responseDelivered) {
        return { ...turn, aiPhase: 'outputting' as const };
      }

      if (params.response) {
        return {
          ...turn,
          aiPhase: 'done' as const,
          reference: getTurnReference(params.response, turn.mode),
          explanation: buildExplanation(params.response) ?? turn.explanation,
        };
      }

      return turn;
    }));
  }, []);

  const updateTurnExplanation = useCallback((turnId: string, patch: Partial<StoredExplanation>) => {
    setTurns(prev => prev.map(turn => {
      if (turn.id !== turnId) return turn;
      const base = turn.explanation ?? {
        text: patch.text ?? '',
        anchorX: patch.anchorX ?? 0,
        anchorY: patch.anchorY ?? 0,
        dragOffsetX: 0,
        dragOffsetY: 0,
        visible: patch.visible ?? true,
      };
      return {
        ...turn,
        explanation: { ...base, ...patch },
      };
    }));
  }, []);

  const setTurnExplanation = useCallback((turnId: string, explanation: StoredExplanation) => {
    setTurns(prev => prev.map(turn => {
      if (turn.id !== turnId) return turn;
      return { ...turn, explanation };
    }));
  }, []);

  return { turns, activeTurnId, startTurn, resetTurns, syncActiveTurn, updateTurnExplanation, setTurnExplanation };
}
