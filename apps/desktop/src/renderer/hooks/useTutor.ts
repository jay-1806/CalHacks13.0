import { useState, useCallback, useRef } from 'react';
import { TutorResponse, isWindowTitleDenied, getDenyReason, parseFirstPointTag, type TutorStreamStep } from '@screentutor/shared';
import { askTutor } from '../api/client';
import { ttsProvider } from '../api/tts';
import * as Sentry from '@sentry/react';
import { performanceTracker } from '../sentry';

/** Returned when a privacy/denylist block prevents analysis */
export const PRIVACY_BLOCKED_MESSAGE =
  'Screen analysis was blocked for privacy. This window contains sensitive content.';

export interface UseTutorOptions {
  /** Each finished step of the answer, as soon as it is written (not for cached answers) */
  onStreamStep?: (step: TutorStreamStep) => void;
}

export function useTutor(options: UseTutorOptions = {}) {
  const onStreamStepRef = useRef(options.onStreamStep);
  onStreamStepRef.current = options.onStreamStep;
  const [response, setResponse] = useState<TutorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isResponseReady, setIsResponseReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyBlockedReason, setPrivacyBlockedReason] = useState<string | null>(null);

  const askQuestion = useCallback(async (
    question: string,
    screenshotBase64?: string,
    screenMetadata?: any,
    demoLessonId?: string,
    devOverrideRedaction?: boolean,
  ) => {
    setIsLoading(true);
    setIsStreaming(true);
    setIsResponseReady(false);
    setError(null);
    setPrivacyBlockedReason(null);
    setResponse(null);
    ttsProvider.stop();
    // Open the voice socket while the model is thinking, not after it answers.
    ttsProvider.warm?.();

    try {
      const privacyMode = await window.electronAPI.getPrivacyMode();

      // ── Privacy mode: block everything ──────────────────────────────────
      if (privacyMode) {
        setPrivacyBlockedReason('Privacy mode is active. Disable it to use screen analysis.');
        setError('Privacy mode is active. Disable it to use screen analysis.');
        setIsStreaming(false);
        return null;
      }

      // ── Active window denylist check BEFORE any screenshot is taken ──────
      const activeTitle = await window.electronAPI.getActiveWindowTitle();
      if (activeTitle && isWindowTitleDenied(activeTitle)) {
        const term = getDenyReason(activeTitle);
        const reason = `Screen analysis was blocked for privacy. The active window matches the denylist (reason: "${term}").`;
        setPrivacyBlockedReason(reason);
        setError(PRIVACY_BLOCKED_MESSAGE);
        setIsStreaming(false);
        return null;
      }

      const input = {
        userId: 'user_123',
        sessionId: 'session_123',
        question,
        screenshotBase64,
        screenMetadata,
        privacyMode,
        appMetadata: activeTitle ? { windowTitle: activeTitle } : undefined,
        demoLessonId,
        devOverrideRedaction,
      };

      performanceTracker.startSpan('screenshot_to_orchestrator');
      
      const API_BASE = 'http://localhost:4317';
      const fetchResponse = await fetch(`${API_BASE}/api/tutor/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!fetchResponse.ok) {
        throw new Error(`API error: ${fetchResponse.statusText}`);
      }

      performanceTracker.endSpan('screenshot_to_orchestrator');
      performanceTracker.startSpan('point_parse_to_overlay');

      const reader = fetchResponse.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let res: TutorResponse | null = null;
      let gotFirstToken = false;
      let streamedSteps = 0;

      const timeoutTimer = setTimeout(() => {
        if (!gotFirstToken) {
          reader?.cancel().catch(() => {});
          setError('Tutor server is taking too long to respond. Please make sure the backend is running.');
          setIsLoading(false);
          setIsStreaming(false);
        }
      }, 25000);

      try {
        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.substring(6);
              try {
                const parsedData = JSON.parse(dataStr);
                if (parsedData.type === 'step') {
                  gotFirstToken = true;
                  const step = parsedData as TutorStreamStep & { type: string };
                  if (streamedSteps === 0) {
                    // Show the overlay on step 1's target now, before the rest is written.
                    const first = parseFirstPointTag(step.overlay);
                    window.electronAPI.flyToPoint(
                      first.x ?? 0.5,
                      first.y ?? 0.5,
                      screenMetadata?.screenNumber,
                      step.overlay
                    );
                  }
                  streamedSteps++;
                  onStreamStepRef.current?.({ index: step.index, spoken: step.spoken, overlay: step.overlay });
                } else if (parsedData.type === 'done') {
                  gotFirstToken = true;
                  res = JSON.parse(parsedData.fullText) as TutorResponse;

                  if (res.drawings && res.drawings.length > 0) {
                    window.electronAPI.sendDrawings(res.drawings);
                  }

                  if (streamedSteps > 0) {
                    // Already on screen and being narrated: just keep the full text.
                    window.electronAPI.updateOverlayText(res.overlayText || res.visualText || '');
                  } else if (res.pointTarget) {
                    const targetX = res.pointTarget.x !== null ? res.pointTarget.x : 0.5;
                    const targetY = res.pointTarget.y !== null ? res.pointTarget.y : 0.5;
                    window.electronAPI.flyToPoint(
                      targetX,
                      targetY,
                      res.pointTarget.screenNumber,
                      res.overlayText || res.visualText || ''
                    );
                  }

                  setResponse(res);
                  setIsResponseReady(true);
                }
              } catch (e) {
                console.error('Error parsing SSE line:', trimmed, e);
              }
            }
            }
          }
        }
      } finally {
        clearTimeout(timeoutTimer);
      }

      performanceTracker.endSpan('point_parse_to_overlay');
      return res;
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message || 'An error occurred while talking to the orchestrator.');
      return null;
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, []);

  const clearResponse = useCallback(() => {
    setResponse(null);
    setIsResponseReady(false);
    setError(null);
    setPrivacyBlockedReason(null);
    window.electronAPI.clearOverlay();
  }, []);

  return { response, isLoading, isStreaming, isResponseReady, error, privacyBlockedReason, askQuestion, clearResponse };
}
