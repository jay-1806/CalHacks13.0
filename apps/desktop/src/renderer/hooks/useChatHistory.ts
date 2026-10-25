import { useState, useCallback, useRef } from 'react';
import { applySyncActiveTurn, type TutorResponse } from '@screentutor/shared';

import type { StoredExplanation } from '../types/explanation';

export type AiPhase = 'scanning' | 'thinking' | 'outputting' | 'done' | 'error';

export interface ChatTurn {
  id: string;
  userText: string;
  aiPhase: AiPhase;
  reference?: string;
  explanation?: StoredExplanation;
  error?: string;
}

function getTurnReference(response: TutorResponse): string {
  if (response.summary && response.summary !== 'Thinking...') {
    return response.summary;
  }
  return 'Explanation delivered';
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

  const startTurn = useCallback((userText: string) => {
    const id = crypto.randomUUID();
    const turn: ChatTurn = { id, userText, aiPhase: 'scanning' };
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

  /** Mark the active turn failed (e.g. capture blocked) so the composer unlocks. */
  const failActiveTurn = useCallback((message: string) => {
    const id = activeTurnIdRef.current;
    if (!id) return;
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === id ? { ...turn, aiPhase: 'error' as const, error: message } : turn
      )
    );
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

    setTurns((prev) => {
      const synced = applySyncActiveTurn(prev, id, {
        error: params.error,
        isScanning: params.isScanning,
        isLoading: params.isLoading,
        isStreaming: params.isStreaming,
        isResponseReady: params.isResponseReady,
        responseDelivered: params.responseDelivered,
        hasResponse: Boolean(params.response),
      });

      // Attach explanation/reference only when this sync reaches done with a response.
      if (!params.response || !params.isResponseReady || !params.responseDelivered) {
        return synced;
      }

      return synced.map((turn) => {
        if (turn.id !== id || turn.aiPhase !== 'done') return turn;
        return {
          ...turn,
          reference: getTurnReference(params.response!),
          explanation: buildExplanation(params.response!) ?? turn.explanation,
        };
      });
    });
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

  return {
    turns,
    activeTurnId,
    startTurn,
    resetTurns,
    failActiveTurn,
    syncActiveTurn,
    updateTurnExplanation,
    setTurnExplanation,
  };
}
