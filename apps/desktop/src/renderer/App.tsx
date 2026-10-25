import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import ChatPanel from './components/ChatPanel';
import FloatingLauncher from './components/FloatingLauncher';
import WelcomeOnboarding from './components/WelcomeOnboarding';
import { useScreenCapture, getScreenMetadata } from './hooks/useScreenCapture';
import { useTutor } from './hooks/useTutor';
import { useChatHistory } from './hooks/useChatHistory';
import {
  buildNarrationSteps,
  estimateStepDurationMs,
  type TutorStreamStep,
  type TutorInput,
  nextStatusAfterDismiss,
  nextStatusAfterGetStarted,
  shouldAutoShowOnboarding,
  shouldMarkDismissOnWelcomeMinimize,
  type OnboardingStatus,
  VOICE_CHAT_MIN_VISIBLE_MS,
  DEMO_VOICE_DURATION_MS,
  DEMO_VOICE_QUESTION,
  applyVoiceStop,
  demoVoiceListenLabel,
  isVoiceActivityPhase,
  shouldAcceptVoiceCallback,
  shouldBeginVoiceTeaching,
  shouldBypassRealStt,
  shouldCompleteDemoListen,
  shouldHideChatForFirstStep,
  type VoicePhase,
  type VoiceStopReason,
} from '@screentutor/shared';
import { transcriptionProvider } from './api/transcription';
import { startSilentNarration, ttsProvider, type StepNarration } from './api/tts';
import { performanceTracker } from './sentry';
import { PANEL_WIDTH, PANEL_HEIGHT, COLLAPSED_SIZE } from './panelLayout';
import type { StoredExplanation } from './types/explanation';
import {
  hasAttemptedSessionAutoShow,
  loadOnboardingRecord,
  markSessionAutoShowAttempted,
  resetOnboardingPreference,
  saveOnboardingStatus,
} from './onboardingStorage';

type BuddyState = 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';

/** Saying one of these during a guided lesson means "I did it, go on". */
const SAID_DONE = /^\s*(done|next|next step|ok(ay)?|i did( it)?|did it|finished|ready)[.!\s]*$/i;

/** A narration in progress; `ended` once no more steps will be appended. */
interface LiveNarration {
  steps: string[];
  voice: StepNarration;
  ended: boolean;
}

/** How long the panel takes to shrink back into the launcher (matches .panel-motion.is-closing) */
const PANEL_EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
type PanelView = 'chat' | 'welcome';

export default function App() {
  const [buddyState, setBuddyState] = useState<BuddyState>('idle');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('chat');
  /** The panel is playing its closing animation; the window shrinks once it ends. */
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  /** Where the panel grows from and shrinks into: the launcher, in panel coordinates. */
  const [panelOrigin, setPanelOrigin] = useState('100% 100%');
  const [welcomeFromHelp, setWelcomeFromHelp] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>(
    () => loadOnboardingRecord().status
  );
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [canvasControlsOpen, setCanvasControlsOpen] = useState(false);
  const [focusInputToken, setFocusInputToken] = useState(0);
  const [question, setQuestion] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  /** Live STT draft shown as one Chat bubble while Listening (Part 6.6.3). */
  const [voiceDraft, setVoiceDraft] = useState('');
  const voiceDraftRef = useRef('');
  const [voicePreviewHint, setVoicePreviewHint] = useState<string | null>(null);
  const [escapeAvailable, setEscapeAvailable] = useState(false);
  const voiceDraftRevisionRef = useRef(0);
  /** Keep Chat open until the first streamed teaching step is ready (Voice path). */
  const keepChatUntilFirstStepRef = useRef(false);
  const chatOpenedAtRef = useRef(0);
  const streamStepGateRef = useRef(Promise.resolve());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [revealedSpokenText, setRevealedSpokenText] = useState('');
  const [responseDelivered, setResponseDelivered] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('screentutor_muted') === 'true';
  });
  const [activeLessonId, setActiveLessonId] = useState<string | undefined>(undefined);

  const { screenshot, pendingRegion, screenshotForQuestion, clearScreenshot, startRegionSelect, isSelectingRegion } =
    useScreenCapture();
  const screenshotForQuestionRef = useRef(screenshotForQuestion);
  screenshotForQuestionRef.current = screenshotForQuestion;
  /** Set below to handleStreamStep; passed to useTutor before that function exists. */
  const streamStepRef = useRef<(step: TutorStreamStep) => void>(() => {});
  const { askQuestion, cancelAsk, response, isLoading, isStreaming, isResponseReady, error, clearResponse } = useTutor({
    onStreamStep: (step) => streamStepRef.current(step),
  });
  const {
    turns: chatTurns,
    activeTurnId,
    startTurn,
    resetTurns,
    failActiveTurn,
    syncActiveTurn,
    updateTurnExplanation,
    setTurnExplanation,
  } = useChatHistory();
  const [isScanning, setIsScanning] = useState(false);

  const activeLessonIdRef = useRef(activeLessonId);
  const screenshotRef = useRef(screenshot);
  const isRecordingRef = useRef(isRecordingVoice);
  const isPanelExpandedRef = useRef(isPanelExpanded);
  const wasSpeakingRef = useRef(false);
  const holdDictationRef = useRef(false);
  const voiceSessionRef = useRef<'idle' | 'starting' | 'active'>('idle');
  const pendingStopRef = useRef(false);
  /** Finalize listening (submit path) vs discard (Esc). */
  const pendingStopModeRef = useRef<'submit' | 'cancel'>('submit');
  const voicePhaseRef = useRef<VoicePhase>('idle');
  const voiceSessionIdRef = useRef(0);
  const previewSessionIdRef = useRef(0);
  const previewEditedRef = useRef(false);
  const previewTranscriptRef = useRef('');
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Demo Voice listen timer (Part 6.6.5) — cleared on Esc / supersede. */
  const demoVoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopInFlightRef = useRef(false);
  const beginVoiceTeachingRef = useRef<(transcript: string, sessionId: number) => Promise<void>>(
    async () => {}
  );
  const startVoiceRecordingRef = useRef<(options?: { showGlow?: boolean; fromHoldHotkey?: boolean }) => Promise<void>>(
    async () => {}
  );
  const stopVoiceRecordingRef = useRef<() => Promise<void>>(async () => {});
  const cancelVoiceListeningRef = useRef<() => Promise<void>>(async () => {});
  const stopActiveInteractionRef = useRef<(reason?: VoiceStopReason) => void>(() => {});
  const stopNarrationRef = useRef<() => void>(() => {});
  const stopWatchingForLearnerRef = useRef<() => void>(() => {});
  const handleAskRef = useRef<
    (
      questionText: string,
      options?: {
        keepChatUntilFirstStep?: boolean;
        preCaptured?: { base64: string; meta?: ReturnType<typeof getScreenMetadata> };
      }
    ) => Promise<void>
  >(async () => {});
  const handleMenuVoiceRef = useRef<() => void>(() => {});
  const handleMenuCaptureRef = useRef<() => Promise<void>>(async () => {});
  const handleMenuTextRef = useRef<() => void>(() => {});
  const activeTurnIdRef = useRef(activeTurnId);
  const visibleExplanationTurnIdRef = useRef<string | null>(null);
  /** Cancels a muted (timer-paced) narration, if one is running. */
  const silentNarrationRef = useRef<(() => void) | null>(null);
  /** The narration playing now: its steps so far and the voice (or silent pacing) playing them */
  const liveNarrationRef = useRef<LiveNarration | null>(null);
  /** This answer arrived as streamed steps (so it must not be narrated again when complete) */
  const answerStreamedRef = useRef(false);
  /** The guided lesson in progress, if the tutor is waiting for the learner to act */
  const guidedRef = useRef<{ goal: string; step: number; lastInstruction: string } | null>(null);
  /** What the learner should do now (shown in the chat panel), while their screen is watched */
  const [guidedAwaiting, setGuidedAwaiting] = useState<string | null>(null);
  /** Bumped to ignore a screen watch that was superseded */
  const guidedWatchRef = useRef(0);
  /** The question that started the current lesson */
  const lessonGoalRef = useRef('');
  const continueGuidedRef = useRef<() => Promise<void>>(async () => {});
  const responseRef = useRef(response);
  responseRef.current = response;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  /** The chat was tucked away while an answer is explained, and comes back when it ends. */
  const panelHiddenForAnswerRef = useRef(false);
  /** Invalidates in-flight placeTutorPanel / expand work on collapse or rapid re-open. */
  const panelLayoutRequestRef = useRef(0);
  const panelViewRef = useRef<PanelView>(panelView);
  const onboardingStatusRef = useRef(onboardingStatus);
  const wasExpandedBeforeWelcomeRef = useRef(false);
  const isLoadingRef = useRef(isLoading);
  const isStreamingRef = useRef(isStreaming);
  const isSpeakingRef = useRef(isSpeaking);
  const isScanningRef = useRef(isScanning);
  const isSelectingRegionRef = useRef(isSelectingRegion);
  const chatTurnsRef = useRef(chatTurns);

  useEffect(() => {
    activeLessonIdRef.current = activeLessonId;
    screenshotRef.current = screenshot;
    isRecordingRef.current = isRecordingVoice;
    isPanelExpandedRef.current = isPanelExpanded;
    activeTurnIdRef.current = activeTurnId;
    panelViewRef.current = panelView;
    onboardingStatusRef.current = onboardingStatus;
    isLoadingRef.current = isLoading;
    isStreamingRef.current = isStreaming;
    isSpeakingRef.current = isSpeaking;
    isScanningRef.current = isScanning;
    isSelectingRegionRef.current = isSelectingRegion;
    chatTurnsRef.current = chatTurns;
  }, [
    activeLessonId,
    screenshot,
    isRecordingVoice,
    isPanelExpanded,
    activeTurnId,
    panelView,
    onboardingStatus,
    isLoading,
    isStreaming,
    isSpeaking,
    isScanning,
    isSelectingRegion,
    chatTurns,
  ]);

  useEffect(() => {
    // Dev-only helper (electron-vite localhost). Never expose in packaged builds.
    if (typeof window === 'undefined') return;
    const host = window.location?.hostname;
    const isDevRenderer = host === 'localhost' || host === '127.0.0.1';
    if (!isDevRenderer) return;
    const w = window as Window & { __quickyResetOnboarding?: () => void };
    w.__quickyResetOnboarding = () => {
      resetOnboardingPreference();
      setOnboardingStatus('never');
      console.info(
        '[Quicky.AI] Onboarding keys only were reset (mute and other prefs preserved). Reload to see welcome.'
      );
    };
    return () => {
      delete w.__quickyResetOnboarding;
    };
  }, []);

  const getBusyFlags = useCallback(() => {
    const active = chatTurnsRef.current.find((t) => t.id === activeTurnIdRef.current);
    const isConversationBusy = active != null && !['done', 'error'].includes(active.aiPhase);
    return {
      isRecordingVoice: isRecordingRef.current,
      isSelectingRegion: isSelectingRegionRef.current,
      isLoading: isLoadingRef.current,
      isStreaming: isStreamingRef.current,
      isSpeaking: isSpeakingRef.current,
      isScanning: isScanningRef.current,
      isConversationBusy,
    };
  }, []);

  const expandPanelRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (screenshot?.isRegionCapture && screenshot.base64 && !isPanelExpandedRef.current) {
      void expandPanelRef.current();
    }
  }, [screenshot?.isRegionCapture, screenshot?.base64]);

  useEffect(() => {
    setResponseDelivered(false);
    wasSpeakingRef.current = false;
  }, [activeTurnId]);

  useEffect(() => {
    if (!isResponseReady) return;

    if (isSpeaking) {
      wasSpeakingRef.current = true;
      return;
    }

    if (wasSpeakingRef.current) {
      setResponseDelivered(true);
      return;
    }

    if (isMuted) {
      const text = response?.spokenText || response?.spokenExplanation || '';
      const ms = Math.max(2500, text.split('\n').reduce((sum, line) => sum + estimateStepDurationMs(line), 0));
      const timer = setTimeout(() => setResponseDelivered(true), ms);
      return () => clearTimeout(timer);
    }

    const fallback = setTimeout(() => setResponseDelivered(true), 8000);
    return () => clearTimeout(fallback);
  }, [isResponseReady, isSpeaking, isMuted, response]);

  const commandMenuOpenRef = useRef(commandMenuOpen);
  const canvasControlsOpenRef = useRef(canvasControlsOpen);
  commandMenuOpenRef.current = commandMenuOpen;
  canvasControlsOpenRef.current = canvasControlsOpen;

  const resizeBuddyAtAnchor = (width: number, height: number) => {
    window.electronAPI.setIgnoreMouseEvents(false);
    if (typeof window.electronAPI.setMainSizeAtAnchor === 'function') {
      window.electronAPI.setMainSizeAtAnchor(width, height);
    } else {
      window.electronAPI.setMainSize(width, height);
    }
  };

  const expandPanel = async () => {
    panelHiddenForAnswerRef.current = false;
    const requestId = ++panelLayoutRequestRef.current;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = false;
    // Claim Chat mode synchronously so a late menu-exit compact restore cannot
    // shrink the buddy window after placeTutorPanel (Part 6.5.2 race).
    isPanelExpandedRef.current = true;
    window.electronAPI.setIgnoreMouseEvents(false);

    // Apply final buddy bounds before mounting the panel — avoids a corner flash.
    if (typeof window.electronAPI.placeTutorPanel === 'function') {
      const placed = await window.electronAPI.placeTutorPanel({
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        requestId,
      });
      if (requestId !== panelLayoutRequestRef.current) return;
      if (!placed?.bounds) {
        // Fallback path if placement IPC fails.
        window.electronAPI.setMainSize(PANEL_WIDTH, PANEL_HEIGHT);
      } else if (placed.anchor) {
        const { bounds, anchor } = placed;
        const ox = Math.max(0, Math.min(bounds.width, anchor.cx - bounds.x));
        const oy = Math.max(0, Math.min(bounds.height, anchor.cy - bounds.y));
        setPanelOrigin(`${Math.round(ox)}px ${Math.round(oy)}px`);
      }
      if (process.env.NODE_ENV !== 'production' && placed?.bounds) {
        console.info('[Quicky.AI][chat-open]', {
          bounds: placed.bounds,
          expected: { width: PANEL_WIDTH, height: PANEL_HEIGHT },
        });
      }
    } else {
      window.electronAPI.setMainSize(PANEL_WIDTH, PANEL_HEIGHT);
    }

    if (requestId !== panelLayoutRequestRef.current) return;
    setIsPanelClosing(false);
    setIsPanelExpanded(true);
  };
  expandPanelRef.current = expandPanel;

  /**
   * Shrink the panel back into the launcher, then the window. Resolves once the
   * window is launcher-sized again (e.g. before a screenshot is taken).
   */
  const collapsePanel = (): Promise<void> => {
    // Cancel any in-flight expand so a late placeTutorPanel cannot resize after collapse
    // (and an expand during the closing animation cancels this collapse).
    const requestId = ++panelLayoutRequestRef.current;
    const wasOpen = isPanelExpandedRef.current;
    if (isRecordingRef.current) {
      clearDemoVoiceTimer();
      if (!shouldBypassRealStt()) {
        transcriptionProvider.stopSession().catch(console.error);
      }
      voiceSessionRef.current = 'idle';
      pendingStopRef.current = false;
      setIsRecordingVoice(false);
      holdDictationRef.current = false;
      window.electronAPI.setDictationGlow(false);
    }
    isPanelExpandedRef.current = false;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = false;

    const finish = () => {
      if (requestId !== panelLayoutRequestRef.current) return;
      setIsPanelClosing(false);
      setIsPanelExpanded(false);
      // Restore the user-chosen launcher position (panel drag must not change this).
      resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
    };
    if (!wasOpen || prefersReducedMotion()) {
      finish();
      return Promise.resolve();
    }
    setIsPanelClosing(true);
    return new Promise((resolve) =>
      setTimeout(() => {
        finish();
        resolve();
      }, PANEL_EXIT_MS)
    );
  };

  const persistOnboardingStatus = (status: OnboardingStatus) => {
    saveOnboardingStatus(status);
    onboardingStatusRef.current = status;
    setOnboardingStatus(status);
  };

  const openWelcome = async (fromHelp: boolean) => {
    if (panelViewRef.current === 'welcome') return;
    wasExpandedBeforeWelcomeRef.current = isPanelExpandedRef.current;
    setWelcomeFromHelp(fromHelp);
    setPanelView('welcome');
    panelViewRef.current = 'welcome';
    console.info(`[Quicky.AI] Welcome onboarding (${fromHelp ? 'help' : 'first-launch'})`);
    if (!isPanelExpandedRef.current) {
      await expandPanel();
    }
  };

  const handleWelcomeGetStarted = () => {
    const next = nextStatusAfterGetStarted(onboardingStatusRef.current);
    persistOnboardingStatus(next);
    const fromHelp = welcomeFromHelp;
    const restoreExpanded = fromHelp && wasExpandedBeforeWelcomeRef.current;
    setWelcomeFromHelp(false);
    setPanelView('chat');
    panelViewRef.current = 'chat';
    // First-run Start Learning → floating launcher (do not jump into Chat).
    // Help reopen preserves prior chat expansion when the user was already tutoring.
    if (restoreExpanded) {
      if (!isPanelExpandedRef.current) {
        void expandPanel().then(() => {
          if (isPanelExpandedRef.current) setFocusInputToken((n) => n + 1);
        });
      } else {
        setFocusInputToken((n) => n + 1);
      }
      return;
    }
    collapsePanel();
  };

  const handleWelcomeDismiss = (options?: { fromMinimize?: boolean }) => {
    const current = onboardingStatusRef.current;
    // Explicit first-run dismissal (Not now or minimize) so the guide does not reappear.
    if (current === 'never' || (options?.fromMinimize && shouldMarkDismissOnWelcomeMinimize(current))) {
      persistOnboardingStatus(nextStatusAfterDismiss(current));
    }

    const restoreExpanded = welcomeFromHelp && wasExpandedBeforeWelcomeRef.current && !options?.fromMinimize;
    setWelcomeFromHelp(false);
    setPanelView('chat');
    panelViewRef.current = 'chat';

    if (!restoreExpanded) {
      collapsePanel();
    }
    // Help reopen while chat was already open — return to chat, keep draft/history.
  };

  const handlePanelClose = () => {
    if (panelViewRef.current === 'welcome') {
      handleWelcomeDismiss({ fromMinimize: true });
      return;
    }
    collapsePanel();
  };

  // First-run Welcome lives inside the floating buddy panel (not a separate BrowserWindow).
  useEffect(() => {
    if (!shouldAutoShowOnboarding(onboardingStatus)) return;
    if (hasAttemptedSessionAutoShow()) return;
    markSessionAutoShowAttempted();
    void openWelcome(false);
  }, [onboardingStatus]);

  useEffect(() => {
    if (typeof window.electronAPI?.onOpenGettingStarted !== 'function') return;
    return window.electronAPI.onOpenGettingStarted(() => {
      void openWelcome(true);
    });
  }, []);

  /**
   * Canvas / command-menu buddy bounds are owned by FloatingLauncher via
   * setMainBounds + anchor-preserving offsets. Do not recenter with
   * setMainSizeAtAnchor here — edge clamping slides the visible launcher.
   */

  const handleMenuExitComplete = () => {
    // isPanelExpandedRef is set at the start of expandPanel (before await), so a
    // delayed exit callback cannot clip Chat into the compact launcher window.
    if (isPanelExpandedRef.current) return;
    if (commandMenuOpenRef.current || canvasControlsOpenRef.current) return;
    resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setCommandMenuOpen(open);
  };

  const clearVoicePreviewTimer = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setVoicePreviewHint(null);
  };

  const clearDemoVoiceTimer = () => {
    if (demoVoiceTimerRef.current) {
      clearTimeout(demoVoiceTimerRef.current);
      demoVoiceTimerRef.current = null;
    }
  };

  const syncEscapeActivity = useCallback((phase: VoicePhase) => {
    const active = isVoiceActivityPhase(phase);
    if (typeof window.electronAPI?.setEscapeActivityActive !== 'function') return;
    void window.electronAPI.setEscapeActivityActive(active).then((result) => {
      if (result && typeof result.escapeAvailable === 'boolean') {
        setEscapeAvailable(result.escapeAvailable);
      }
    });
  }, []);

  const setVoicePhase = useCallback(
    (phase: VoicePhase) => {
      voicePhaseRef.current = phase;
      syncEscapeActivity(phase);
    },
    [syncEscapeActivity]
  );

  /**
   * Transcript ready → capture unobstructed screen → open Chat with Processing →
   * tutor request. Chat stays until the first teaching step (Part 6.6.2).
   * No idle 2.5s pre-submit countdown.
   */
  const beginVoiceTeaching = async (transcript: string, sessionId: number) => {
    if (
      !shouldAcceptVoiceCallback({
        eventSessionId: sessionId,
        activeSessionId: voiceSessionIdRef.current,
        phase: voicePhaseRef.current === 'transcribing' ? 'transcribing' : voicePhaseRef.current,
      })
    ) {
      return;
    }
    if (voicePhaseRef.current === 'cancelled' || voicePhaseRef.current === 'stopped') return;

    const text = transcript.trim();
    if (!text) {
      setVoicePhase('error');
      setBuddyState('idle');
      setVoicePhase('idle');
      return;
    }

    if (guidedRef.current && SAID_DONE.test(text)) {
      setVoicePhase('idle');
      setBuddyState('thinking');
      await continueGuidedRef.current();
      return;
    }

    if (
      !shouldBeginVoiceTeaching({
        phase: voicePhaseRef.current,
        sessionId: voiceSessionIdRef.current,
        previewSessionId: sessionId,
        transcript: text,
        edited: false,
      })
    ) {
      return;
    }

    previewSessionIdRef.current = sessionId;
    previewEditedRef.current = false;
    previewTranscriptRef.current = text;
    clearVoicePreviewTimer();

    setVoicePhase('capturing');
    setBuddyState('thinking');
    setIsScanning(true);
    setVoicePreviewHint('Capturing your screen…');

    // Hide Chat before capture so the screenshot is the user's problem, not Quicky.
    if (isPanelExpandedRef.current) {
      await collapsePanel();
    } else {
      resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    let capBase64: string | undefined;
    let capMeta: ReturnType<typeof getScreenMetadata> | undefined;
    if (!activeLessonIdRef.current) {
      await clearPreviousAnswer();
      performanceTracker.startSpan('listening_to_screenshot');
      const capData = await screenshotForQuestionRef.current();
      performanceTracker.endSpan('listening_to_screenshot');
      if (
        !shouldAcceptVoiceCallback({
          eventSessionId: sessionId,
          activeSessionId: voiceSessionIdRef.current,
          phase: voicePhaseRef.current,
        })
      ) {
        setIsScanning(false);
        return;
      }
      if (!capData) {
        setIsScanning(false);
        startTurn(text);
        failActiveTurn('Screen capture was blocked or unavailable.');
        setBuddyState('privacy');
        setVoicePhase('error');
        setPanelView('chat');
        panelViewRef.current = 'chat';
        await expandPanel();
        setVoicePhase('idle');
        return;
      }
      capBase64 = capData.base64;
      capMeta = getScreenMetadata(capData);
    }
    setIsScanning(false);

    if (
      !shouldAcceptVoiceCallback({
        eventSessionId: sessionId,
        activeSessionId: voiceSessionIdRef.current,
        phase: voicePhaseRef.current,
      })
    ) {
      return;
    }

    startTurn(text);
    setQuestion('');
    setVoiceDraft('');
    voiceDraftRef.current = '';
    setPanelView('chat');
    panelViewRef.current = 'chat';
    setVoicePhase('chat_processing');
    setVoicePreviewHint('Processing your question…');
    keepChatUntilFirstStepRef.current = true;
    chatOpenedAtRef.current = Date.now();

    await expandPanel();
    if (
      !shouldAcceptVoiceCallback({
        eventSessionId: sessionId,
        activeSessionId: voiceSessionIdRef.current,
        phase: voicePhaseRef.current,
      })
    ) {
      keepChatUntilFirstStepRef.current = false;
      return;
    }

    // Run tutoring while Chat stays open (skip hidePanelForAnswer).
    await handleAskRef.current(text, {
      keepChatUntilFirstStep: true,
      preCaptured: capBase64 ? { base64: capBase64, meta: capMeta } : undefined,
    });
  };
  beginVoiceTeachingRef.current = beginVoiceTeaching;

  /**
   * Demo Voice completion (Part 6.6.5): hardcoded question + REAL screen capture + Claude.
   * No microphone / STT. Session guards prevent late submit after Esc.
   */
  const completeDemoVoice = async (sessionId: number) => {
    if (
      !shouldCompleteDemoListen({
        demoMode: shouldBypassRealStt(),
        eventSessionId: sessionId,
        activeSessionId: voiceSessionIdRef.current,
        phase: voicePhaseRef.current,
      })
    ) {
      return;
    }

    clearDemoVoiceTimer();
    holdDictationRef.current = false;
    voiceSessionRef.current = 'idle';
    pendingStopRef.current = false;
    setIsRecordingVoice(false);
    window.electronAPI.setDictationGlow(false);
    setVoicePhase('transcribing');
    setBuddyState('thinking');
    setVoicePreviewHint(null);
    setVoiceDraft('');
    voiceDraftRef.current = '';

    await beginVoiceTeachingRef.current(DEMO_VOICE_QUESTION, sessionId);
  };

  /** Single authoritative Stop for Esc / Stop Teaching / Cancel. Idempotent. */
  const stopActiveInteraction = useCallback(
    (reason: VoiceStopReason = 'user_escape') => {
      if (stopInFlightRef.current) return;
      const phase = voicePhaseRef.current;
      if (phase === 'idle' && !isRecordingRef.current && !isLoadingRef.current && !isStreamingRef.current && !isSpeakingRef.current) {
        // Idle Esc must not hijack the desktop.
        if (reason === 'user_escape' || reason === 'hotkey') return;
      }

      stopInFlightRef.current = true;
      try {
        const next = applyVoiceStop(phase, reason);
        voiceSessionIdRef.current += 1;
        setVoicePhase(next);

        clearVoicePreviewTimer();
        clearDemoVoiceTimer();
        previewEditedRef.current = true;

        if (voiceSessionRef.current !== 'idle') {
          pendingStopModeRef.current = 'cancel';
          pendingStopRef.current = true;
          voiceSessionRef.current = 'idle';
          if (!shouldBypassRealStt()) {
            void transcriptionProvider.cancelSession();
          }
        } else if (!shouldBypassRealStt()) {
          void transcriptionProvider.cancelSession();
        }

        setIsRecordingVoice(false);
        holdDictationRef.current = false;
        window.electronAPI.setDictationGlow(false);
        setVoiceDraft('');
        voiceDraftRef.current = '';
        voiceDraftRevisionRef.current = 0;
        setQuestion('');

        cancelAsk(reason === 'error' ? 'Something went wrong.' : 'Stopped.');
        stopNarrationRef.current();
        setIsSpeaking(false);
        // Stop pointer/TTS clock without erasing completed explanation boards.
        window.electronAPI.finishOverlayNarration({ preserve: true });
        stopWatchingForLearnerRef.current();

        if (isSelectingRegionRef.current) {
          window.electronAPI.cancelRegionSelect();
        }

        setIsScanning(false);
        setBuddyState('idle');
        keepChatUntilFirstStepRef.current = false;
        clearVoicePreviewTimer();
        setVoicePreviewHint(null);

        // Unlock composer if a turn was mid-flight; preserve completed explanation cards.
        if (next === 'stopped' || (next === 'cancelled' && activeTurnIdRef.current)) {
          failActiveTurn(next === 'stopped' ? 'Stopped.' : 'Cancelled.');
        }

        // Close Chat / restore compact at the saved launcher anchor — do not recenter.
        if (isPanelExpandedRef.current) {
          void collapsePanel();
        } else {
          resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
        }

        // Return Escape to the OS when activity ends.
        setVoicePhase('idle');
      } finally {
        stopInFlightRef.current = false;
      }
    },
    [cancelAsk, failActiveTurn, setVoicePhase]
  );

  const startVoiceRecording = async (options?: { showGlow?: boolean; fromHoldHotkey?: boolean }) => {
    if (voiceSessionRef.current !== 'idle') return;
    if (isVoiceActivityPhase(voicePhaseRef.current) && voicePhaseRef.current !== 'listening') {
      // Do not start a second Voice session while previewing/teaching.
      return;
    }

    voiceSessionRef.current = 'starting';
    pendingStopRef.current = false;
    pendingStopModeRef.current = 'submit';
    const sessionId = ++voiceSessionIdRef.current;
    setVoicePhase(shouldBypassRealStt() ? 'listening' : 'requesting_permission');

    const abandon = () => {
      clearDemoVoiceTimer();
      voiceSessionRef.current = 'idle';
      pendingStopRef.current = false;
      setIsRecordingVoice(false);
      setVoicePhase('idle');
    };

    const isPrivacy = await window.electronAPI.getPrivacyMode();
    if (isPrivacy) {
      abandon();
      setBuddyState('privacy');
      return;
    }

    if (sessionId !== voiceSessionIdRef.current) {
      abandon();
      return;
    }

    // ── Demo Voice (Part 6.6.5): simulated listen only — no mic / STT ─────────
    if (shouldBypassRealStt()) {
      if (options?.fromHoldHotkey) {
        holdDictationRef.current = true;
      }
      ttsProvider.stop();
      setIsSpeaking(false);
      setBuddyState('listening');
      setIsRecordingVoice(true);
      setVoicePhase('listening');
      setVoiceDraft('');
      voiceDraftRef.current = '';
      voiceDraftRevisionRef.current = 0;
      setQuestion('');
      setVoicePreviewHint(demoVoiceListenLabel(true));
      // Keep Chat closed during demo listen so capture is not covered by Quicky.
      window.electronAPI.setDictationGlow(false);
      voiceSessionRef.current = 'active';
      console.info('[DemoVoice] listening', { sessionId, ms: DEMO_VOICE_DURATION_MS });

      clearDemoVoiceTimer();
      demoVoiceTimerRef.current = setTimeout(() => {
        demoVoiceTimerRef.current = null;
        void completeDemoVoice(sessionId);
      }, DEMO_VOICE_DURATION_MS);

      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        const mode = pendingStopModeRef.current as 'submit' | 'cancel';
        if (mode === 'cancel') {
          await cancelVoiceListeningRef.current();
        } else {
          clearDemoVoiceTimer();
          void completeDemoVoice(sessionId);
        }
      }
      return;
    }

    // Permission request is deliberate and Voice-only (never at startup / onboarding).
    try {
      const status =
        typeof window.electronAPI.ensureMicrophoneAccess === 'function'
          ? await window.electronAPI.ensureMicrophoneAccess()
          : await window.electronAPI.getPermissionStatus();
      if (status.microphone === 'denied' || status.microphone === 'restricted') {
        console.warn('[Quicky.AI] Microphone permission denied — voice not started');
        abandon();
        setBuddyState('error');
        return;
      }
    } catch (err) {
      console.error('Microphone permission check failed:', err);
      abandon();
      setBuddyState('error');
      return;
    }

    if (sessionId !== voiceSessionIdRef.current) {
      abandon();
      return;
    }

    if (options?.fromHoldHotkey) {
      holdDictationRef.current = true;
    }

    ttsProvider.stop();
    setIsSpeaking(false);
    setBuddyState('listening');
    setIsRecordingVoice(true);
    setVoicePhase('listening');
    setVoiceDraft('');
    voiceDraftRef.current = '';
    voiceDraftRevisionRef.current = 0;
    setQuestion('');
    setVoicePreviewHint('Listening…');

    // Reveal Chat with a live draft while speaking (no overlapping second panel).
    setPanelView('chat');
    panelViewRef.current = 'chat';
    void expandPanel();

    // Never enable full-screen DictationGlow — one compact launcher pill only.
    window.electronAPI.setDictationGlow(false);

    try {
      await transcriptionProvider.startSession({
        onEndpoint: (reason) => {
          if (voiceSessionIdRef.current !== sessionId) return;
          if (voicePhaseRef.current !== 'listening') return;
          if (reason === 'no_speech') {
            console.info('[VoiceSTT] no speech detected — recovering to idle');
          }
          void stopVoiceRecordingRef.current();
        },
        onTranscript: (update) => {
          if (voiceSessionIdRef.current !== sessionId) return;
          if (voicePhaseRef.current !== 'listening' && voicePhaseRef.current !== 'finalizing') return;
          if (update.revision < voiceDraftRevisionRef.current) return;
          voiceDraftRevisionRef.current = update.revision;
          voiceDraftRef.current = update.text;
          setVoiceDraft(update.text);
          // Keep composer mirrored for accessibility; Chat draft bubble is primary.
          setQuestion(update.text);
        },
        onDiagnostics: (diag) => {
          if (voiceSessionIdRef.current !== sessionId) return;
          // Safe pipeline telemetry — never includes spoken content / tokens.
          const notable = [
            'listening',
            'socket_open',
            'connected',
            'mic_denied',
            'cartesia_quota_exceeded',
            'cartesia_unavailable',
            'turn_start',
            'socket_error',
          ];
          if (notable.includes(diag.stage) || (diag.frameCount > 0 && diag.frameCount % 20 === 0)) {
            console.info('[VoiceSTT]', {
              stage: diag.stage,
              pcm_frames_received: diag.frameCount,
              audio_frames_sent: diag.framesSent,
              input_rms: Number(diag.rms.toFixed(4)),
              input_peak: diag.peak != null ? Number(diag.peak.toFixed(4)) : undefined,
              audio_context: diag.audioContextState,
              sample_rate: diag.sampleRate,
              track: diag.trackReadyState,
              track_muted: diag.trackMuted,
              socket: diag.socketState,
              fallback: diag.usingFallback,
              cartesia_error: diag.cartesiaErrorCode,
              hasSpoken: diag.hasSpoken,
            });
          }
          if (diag.stage === 'cartesia_quota_exceeded') {
            setVoicePreviewHint('Listening… (local speech recognition)');
          }
          if (
            diag.stage === 'listening' &&
            diag.frameCount === 0 &&
            diag.audioContextState === 'suspended'
          ) {
            console.warn('[VoiceSTT] AudioContext still suspended — mic frames may not flow');
          }
        },
      });
      if (sessionId !== voiceSessionIdRef.current) {
        await transcriptionProvider.cancelSession();
        abandon();
        setIsRecordingVoice(false);
        setVoiceDraft('');
        window.electronAPI.setDictationGlow(false);
        return;
      }
      voiceSessionRef.current = 'active';
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        // Another handler may flip this to cancel while we awaited mic permission.
        const mode = pendingStopModeRef.current as 'submit' | 'cancel';
        if (mode === 'cancel') {
          await cancelVoiceListeningRef.current();
        } else {
          await stopVoiceRecordingAndSubmit();
        }
      }
    } catch (err) {
      console.error('Failed to start microphone recording:', err);
      voiceSessionRef.current = 'idle';
      setIsRecordingVoice(false);
      setVoiceDraft('');
      holdDictationRef.current = false;
      window.electronAPI.setDictationGlow(false);
      setVoicePreviewHint(null);
      setVoicePhase('error');
      setBuddyState('error');
      setVoicePhase('idle');
    }
  };

  const cancelVoiceListening = async () => {
    stopActiveInteraction('user_cancel');
  };

  const stopVoiceRecordingAndSubmit = async () => {
    if (voiceSessionRef.current === 'starting') {
      pendingStopModeRef.current = 'submit';
      pendingStopRef.current = true;
      return;
    }
    if (voiceSessionRef.current === 'idle') return;
    if (voicePhaseRef.current !== 'listening' && voicePhaseRef.current !== 'finalizing') return;

    const sessionId = voiceSessionIdRef.current;

    // Demo Voice: Voice-again finalizes early with the same hardcoded question.
    if (shouldBypassRealStt()) {
      clearDemoVoiceTimer();
      await completeDemoVoice(sessionId);
      return;
    }

    holdDictationRef.current = false;
    voiceSessionRef.current = 'idle';
    pendingStopRef.current = false;
    setVoicePhase('finalizing');
    setIsRecordingVoice(false);
    window.electronAPI.setDictationGlow(false);
    setBuddyState('thinking');
    setVoicePhase('transcribing');
    setVoicePreviewHint('Processing your question…');

    try {
      await transcriptionProvider.stopSession();
      if (
        !shouldAcceptVoiceCallback({
          eventSessionId: sessionId,
          activeSessionId: voiceSessionIdRef.current,
          phase: voicePhaseRef.current,
        })
      ) {
        return;
      }
      const transcript = (
        await transcriptionProvider.getFinalTranscript(activeLessonIdRef.current)
      ).trim() || voiceDraftRef.current.trim() || previewTranscriptRef.current.trim();
      if (
        !shouldAcceptVoiceCallback({
          eventSessionId: sessionId,
          activeSessionId: voiceSessionIdRef.current,
          phase: voicePhaseRef.current,
        })
      ) {
        return;
      }
      if (!transcript) {
        // No speech / empty recognition — exit Listening without starting tutoring.
        setVoiceDraft('');
        voiceDraftRef.current = '';
        setQuestion('');
        setVoicePreviewHint(null);
        setBuddyState('idle');
        setVoicePhase('idle');
        if (isPanelExpandedRef.current) {
          void collapsePanel();
        } else {
          resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
        }
        return;
      }
      voiceDraftRef.current = transcript;
      setVoiceDraft(transcript);
      await beginVoiceTeaching(transcript, sessionId);
    } catch (err) {
      console.error('Failed to stop/transcribe recording:', err);
      if (voiceSessionIdRef.current === sessionId) {
        setVoiceDraft('');
        setVoicePreviewHint(null);
        setVoicePhase('error');
        setBuddyState('error');
        setVoicePhase('idle');
      }
    }
  };

  startVoiceRecordingRef.current = startVoiceRecording;
  stopVoiceRecordingRef.current = stopVoiceRecordingAndSubmit;
  cancelVoiceListeningRef.current = cancelVoiceListening;
  stopActiveInteractionRef.current = stopActiveInteraction;

  useEffect(() => {
    // Skip when Vite serves this module outside Electron (e.g. IDE browser on :5173).
    if (typeof window.electronAPI?.setIgnoreMouseEvents !== 'function') return;

    window.electronAPI.setIgnoreMouseEvents(false);
    if (typeof window.electronAPI.setMainSizeAtAnchor === 'function') {
      window.electronAPI.setMainSizeAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
    } else {
      window.electronAPI.setMainSize(COLLAPSED_SIZE, COLLAPSED_SIZE);
    }

    const offHoldStart = window.electronAPI.onHoldDictationStart(async () => {
      if (voiceSessionRef.current !== 'idle') return;
      if (isVoiceActivityPhase(voicePhaseRef.current) && voicePhaseRef.current !== 'listening') return;

      performanceTracker.startSpan('total_interaction_latency');
      performanceTracker.startSpan('hotkey_to_listening');
      const starting = startVoiceRecordingRef.current({ showGlow: false, fromHoldHotkey: true });
      performanceTracker.endSpan('hotkey_to_listening');
      await starting;
    });

    const offHoldEnd = window.electronAPI.onHoldDictationEnd(async () => {
      await stopVoiceRecordingRef.current();
    });

    const offAction =
      typeof window.electronAPI.onActionHotkey === 'function'
        ? window.electronAPI.onActionHotkey((action) => {
            if (action === 'stop') {
              stopActiveInteractionRef.current('hotkey');
              return;
            }
            if (action === 'voice') {
              handleMenuVoiceRef.current();
              return;
            }
            if (action === 'capture') {
              void handleMenuCaptureRef.current();
              return;
            }
            if (action === 'text') {
              handleMenuTextRef.current();
            }
          })
        : () => {};

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      const phase = voicePhaseRef.current;
      const teaching =
        isLoadingRef.current || isStreamingRef.current || isSpeakingRef.current || isScanningRef.current;
      if (!isVoiceActivityPhase(phase) && !teaching && !isRecordingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      stopActiveInteractionRef.current('user_escape');
    };
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      offHoldStart();
      offHoldEnd();
      offAction();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window.electronAPI?.onExplanationReady !== 'function') return;

    window.electronAPI.onExplanationReady((data) => {
      const turnId = activeTurnIdRef.current;
      if (!turnId) return;
      visibleExplanationTurnIdRef.current = turnId;
      setTurnExplanation(turnId, {
        text: data.text,
        anchorX: data.anchorX,
        anchorY: data.anchorY,
        dragOffsetX: 0,
        dragOffsetY: 0,
        visible: true,
      });
    });

    window.electronAPI.onExplanationMinimized((data) => {
      const turnId = visibleExplanationTurnIdRef.current;
      if (!turnId) return;
      updateTurnExplanation(turnId, {
        anchorX: data.anchorX,
        anchorY: data.anchorY,
        dragOffsetX: data.dragOffsetX,
        dragOffsetY: data.dragOffsetY,
        text: data.text,
        visible: false,
      });
    });

    window.electronAPI.onExplanationUpdated((data) => {
      const turnId = visibleExplanationTurnIdRef.current;
      if (!turnId) return;
      updateTurnExplanation(turnId, {
        anchorX: data.anchorX,
        anchorY: data.anchorY,
        dragOffsetX: data.dragOffsetX,
        dragOffsetY: data.dragOffsetY,
        text: data.text,
        visible: true,
      });
    });
  }, [setTurnExplanation, updateTurnExplanation]);

  useEffect(() => {
    syncActiveTurn({
      isScanning,
      isLoading,
      isStreaming,
      isSpeaking,
      isResponseReady,
      responseDelivered,
      response,
      error,
    });
  }, [isScanning, isLoading, isStreaming, isSpeaking, isResponseReady, responseDelivered, response, error, syncActiveTurn]);

  /** Take the previous answer's drawings off screen so they aren't in the new question's screenshot. */
  const clearPreviousAnswer = async () => {
    window.electronAPI.clearOverlay();
    await new Promise((resolve) => setTimeout(resolve, 120)); // let the cleared overlay reach the screen
  };

  /** Tuck the chat away so the learner's attention is on the explanation (and it stays out of the screenshot). */
  const hidePanelForAnswer = async () => {
    if (!isPanelExpandedRef.current || panelViewRef.current !== 'chat') return;
    panelHiddenForAnswerRef.current = true;
    await collapsePanel();
  };

  /** Bring the chat back once the explanation is over, or the question failed. */
  const restorePanelAfterAnswer = () => {
    if (!panelHiddenForAnswerRef.current) return;
    panelHiddenForAnswerRef.current = false;
    if (!isPanelExpandedRef.current) void expandPanel();
  };

  const stopNarration = () => {
    silentNarrationRef.current?.();
    silentNarrationRef.current = null;
    liveNarrationRef.current = null;
    answerStreamedRef.current = false;
    ttsProvider.stop();
  };
  stopNarrationRef.current = stopNarration;

  const finishSyncedNarration = (spoken: string) => {
    silentNarrationRef.current = null;
    liveNarrationRef.current = null;
    setRevealedSpokenText(spoken);
    const answer = responseRef.current;
    if (answer?.nextAction === 'wait' && answer.awaiting) {
      // A guided lesson: the learner acts now. Marks stay up, the chat stays aside.
      window.electronAPI.finishOverlayNarration({ awaiting: answer.awaiting });
      waitForLearner(answer.awaiting);
      return;
    }
    clearGuidedLesson();
    window.electronAPI.finishOverlayNarration();
    setVoicePhase('idle');
    restorePanelAfterAnswer();
  };

  // ── Guided lessons ────────────────────────────────────────────────────────
  // The tutor asked the learner to do something (nextAction "wait"). Their screen
  // is watched; when it changes and settles (or they press Next / say "done"),
  // a fresh screenshot goes back with the lesson so the tutor can check and continue.

  /** The lesson to send with this question, if one is in progress; records a new goal otherwise. */
  const takeGuideForQuestion = (question: string): TutorInput['guide'] => {
    stopWatchingForLearner();
    const lesson = guidedRef.current;
    if (!lesson) {
      lessonGoalRef.current = question;
      return undefined;
    }
    return { goal: lesson.goal, step: lesson.step, lastInstruction: lesson.lastInstruction };
  };

  const waitForLearner = (awaiting: string) => {
    const previous = guidedRef.current;
    guidedRef.current = {
      goal: previous?.goal ?? lessonGoalRef.current,
      step: (previous?.step ?? 0) + 1,
      lastInstruction: awaiting,
    };
    setGuidedAwaiting(awaiting);
    setBuddyState('pointing');
    const watch = ++guidedWatchRef.current;
    void window.electronAPI.watchScreenChange().then((result) => {
      if (result === 'changed' && guidedWatchRef.current === watch && guidedRef.current) {
        void continueGuidedRef.current();
      }
    });
  };

  const stopWatchingForLearner = () => {
    guidedWatchRef.current++;
    window.electronAPI.stopWatchingScreen();
    setGuidedAwaiting(null);
  };
  stopWatchingForLearnerRef.current = stopWatchingForLearner;

  /** The learner did the step (screen changed, Next, or "done"): check it and continue. */
  const continueGuided = async () => {
    if (!guidedRef.current) return;
    const text = 'Done — next step';
    startTurn(text);
    await handleAsk("I've done that. Check my screen and guide me on.");
  };
  continueGuidedRef.current = continueGuided;

  const clearGuidedLesson = () => {
    stopWatchingForLearner();
    guidedRef.current = null;
  };

  /** End lesson (from the chat panel): stop waiting and clear the screen. */
  const endGuidedLesson = () => {
    clearGuidedLesson();
    window.electronAPI.clearOverlay();
    setBuddyState('idle');
    restorePanelAfterAnswer();
  };

  /**
   * One clock for everything: the voice. Starts a narration whose steps can keep
   * arriving (a streamed answer); each step's pointer, drawings and chat text
   * appear when that step actually starts being heard, so they can't drift.
   * The overlay gets `overlayText` now (step 1, or a whole cached answer).
   */
  const beginNarration = (spokenText: string, overlayText: string): LiveNarration => {
    stopNarration();
    setRevealedSpokenText('');
    window.electronAPI.startOverlayNarration({
      spokenText,
      overlayText,
      captureRegion: screenshotRef.current?.captureRegion ?? null,
    });

    const steps: string[] = [];
    const live: LiveNarration = { steps, ended: false, voice: null as unknown as StepNarration };
    const onStep = (index: number) => {
      window.electronAPI.overlayNarrationStep(index);
      setRevealedSpokenText(steps.slice(0, index + 1).filter(Boolean).join('\n'));
    };
    const onEnd = () => {
      if (liveNarrationRef.current !== live) return;
      finishSyncedNarration(steps.filter(Boolean).join('\n'));
    };

    if (isMutedRef.current) {
      const silent = startSilentNarration(estimateStepDurationMs, { onStep, onEnd });
      silentNarrationRef.current = silent.cancel;
      live.voice = silent;
    } else {
      live.voice = ttsProvider.startSteps({
        onStart: () => setIsSpeaking(true),
        onStep,
        onEnd: () => {
          onEnd();
          setIsSpeaking(false);
        },
      });
    }
    liveNarrationRef.current = live;
    return live;
  };

  const narrateStep = (live: LiveNarration, spoken: string) => {
    live.steps.push(spoken);
    live.voice.append(spoken);
  };

  const isVoiceTurnCancelled = () => {
    const phase: VoicePhase = voicePhaseRef.current;
    return phase === 'stopped' || phase === 'cancelled';
  };

  /** A step of the answer, as soon as Claude has written it: narrate it now. */
  const handleStreamStep = (step: TutorStreamStep) => {
    // Serialize so Voice Chat can hide before step-0 narration covers the question.
    streamStepGateRef.current = streamStepGateRef.current.then(async () => {
      if (isVoiceTurnCancelled()) return;

      if (step.index === 0 && keepChatUntilFirstStepRef.current) {
        const openedAt = chatOpenedAtRef.current;
        const now = Date.now();
        const wait = Math.max(0, VOICE_CHAT_MIN_VISIBLE_MS - (now - openedAt));
        if (
          !shouldHideChatForFirstStep({
            firstStepReady: true,
            chatOpenedAtMs: openedAt,
            nowMs: now,
            minVisibleMs: VOICE_CHAT_MIN_VISIBLE_MS,
            cancelled: false,
          }) &&
          wait > 0
        ) {
          await new Promise((r) => setTimeout(r, wait));
        }
        if (isVoiceTurnCancelled()) return;
        keepChatUntilFirstStepRef.current = false;
        setVoicePreviewHint(null);
        setVoicePhase('teaching');
        await hidePanelForAnswer();
        if (isVoiceTurnCancelled()) return;
      }

      const live = liveNarrationRef.current;
      if (step.index === 0) {
        narrateStep(beginNarration(step.spoken, step.overlay), step.spoken);
        answerStreamedRef.current = true;
      } else if (live && !live.ended) {
        window.electronAPI.appendOverlayNarrationStep({ spoken: step.spoken, overlay: step.overlay });
        narrateStep(live, step.spoken);
      }
    });
  };
  streamStepRef.current = handleStreamStep;

  // The answer is complete. A streamed one is already playing: no more steps are
  // coming. A cached one arrives whole: narrate all of it now.
  useEffect(() => {
    if (!response || isStreaming || !isResponseReady) return;

    const live = liveNarrationRef.current;
    if (answerStreamedRef.current) {
      // Still playing: no more steps are coming. (Stopped early, e.g. muted: leave it.)
      if (live && !live.ended) {
        live.ended = true;
        live.voice.end();
      }
      return;
    }

    const spoken = response.spokenText || response.spokenExplanation || '';
    const overlayText = response.overlayText || response.visualText || '';
    if (!spoken) {
      restorePanelAfterAnswer();
      return;
    }
    const whole = beginNarration(spoken, overlayText);
    buildNarrationSteps(spoken, overlayText).forEach((step) => narrateStep(whole, step.spoken));
    whole.ended = true;
    whole.voice.end();
  }, [response, isStreaming, isResponseReady]);

  // Muting mid-answer stops the voice and shows the rest of the explanation at once.
  useEffect(() => {
    if (!isMuted || !ttsProvider.isSpeaking()) return;
    const heard = liveNarrationRef.current?.steps.filter(Boolean).join('\n');
    ttsProvider.stop();
    setIsSpeaking(false);
    finishSyncedNarration(heard || response?.spokenText || response?.spokenExplanation || '');
  }, [isMuted]);

  useEffect(() => {
    if (!isStreaming && !response) {
      stopNarration();
      setIsSpeaking(false);
      setRevealedSpokenText('');
      window.electronAPI.finishOverlayNarration();
    }
  }, [response, isStreaming]);

  useEffect(() => {
    if (response && response.drawings && response.drawings.length > 0) {
      setBuddyState('pointing');
      const timer = setTimeout(() => {
        if (!ttsProvider.isSpeaking()) {
          setBuddyState('responding');
        }
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [response]);

  const handleAsk = async (
    questionText: string,
    options?: {
      keepChatUntilFirstStep?: boolean;
      preCaptured?: { base64: string; meta?: ReturnType<typeof getScreenMetadata> };
    }
  ) => {
    // Mid-lesson questions (and the "I did it" turns) carry the lesson; others start fresh.
    const guide = takeGuideForQuestion(questionText);
    clearVoicePreviewTimer();
    previewEditedRef.current = true;
    stopNarration();
    setIsSpeaking(false);
    setRevealedSpokenText('');
    window.electronAPI.finishOverlayNarration();
    setBuddyState('thinking');

    const keepChat = Boolean(options?.keepChatUntilFirstStep);
    if (keepChat) {
      keepChatUntilFirstStepRef.current = true;
      setVoicePhase('chat_processing');
    } else {
      keepChatUntilFirstStepRef.current = false;
      setVoicePhase('teaching');
    }

    try {
      if (!keepChat) {
        await hidePanelForAnswer();
      }
      setIsScanning(true);
      if (!keepChat) setVoicePhase('capturing');

      let capBase64: string | undefined = options?.preCaptured?.base64;
      let capMeta: ReturnType<typeof getScreenMetadata> | undefined = options?.preCaptured?.meta;

      if (!activeLessonId && !capBase64) {
        await clearPreviousAnswer();
        performanceTracker.startSpan('listening_to_screenshot');
        const capData = await screenshotForQuestion();
        performanceTracker.endSpan('listening_to_screenshot');
        setIsScanning(false);

        if (!capData) {
          failActiveTurn('Screen capture was blocked or unavailable.');
          setBuddyState('privacy');
          setVoicePhase('error');
          keepChatUntilFirstStepRef.current = false;
          if (keepChat) {
            setVoicePreviewHint(null);
          } else {
            restorePanelAfterAnswer();
          }
          performanceTracker.endSpan('total_interaction_latency');
          setVoicePhase('idle');
          return;
        }
        capBase64 = capData.base64;
        capMeta = getScreenMetadata(capData);
      } else {
        setIsScanning(false);
      }

      if (!keepChat) setVoicePhase('teaching');
      const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
      const res = await askQuestion(questionText, capBase64, capMeta, activeLessonId, devOverride, guide);
      if (voicePhaseRef.current === 'stopped' || voicePhaseRef.current === 'cancelled') {
        performanceTracker.endSpan('total_interaction_latency');
        return;
      }
      setBuddyState(res ? 'responding' : 'error');
      if (!res) {
        keepChatUntilFirstStepRef.current = false;
        setVoicePreviewHint(null);
        if (keepChat) {
          // Leave Chat open with the error turn so the user can recover.
        } else {
          restorePanelAfterAnswer();
        }
        setVoicePhase('error');
        setVoicePhase('idle');
      } else if (!keepChat) {
        setVoicePhase('teaching');
      }
      // keepChat: stay in chat_processing until first stream step hides Chat.
      performanceTracker.endSpan('total_interaction_latency');
    } catch {
      if (voicePhaseRef.current === 'stopped' || voicePhaseRef.current === 'cancelled') return;
      setBuddyState('error');
      setIsScanning(false);
      keepChatUntilFirstStepRef.current = false;
      setVoicePreviewHint(null);
      setVoicePhase('error');
      if (!keepChat) restorePanelAfterAnswer();
      performanceTracker.endSpan('total_interaction_latency');
      setVoicePhase('idle');
    }
  };
  handleAskRef.current = handleAsk;

  const handleQuestionChange = (value: string) => {
    setQuestion(value);
  };

  const handleStartRegionSelect = async () => {
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = false;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    if (isPanelExpandedRef.current) {
      collapsePanel();
    }
    await startRegionSelect();
  };

  const handleClearRegion = () => {
    clearScreenshot();
  };

  const handleMenuVoice = () => {
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);

    // While listening: Voice again finalizes (does not start a second recording).
    if (voiceSessionRef.current === 'active' || voicePhaseRef.current === 'listening') {
      void stopVoiceRecordingRef.current();
      return;
    }
    if (isVoiceActivityPhase(voicePhaseRef.current)) {
      return;
    }

    // Click Voice → listen immediately. No DictationGlow (that is a full-screen
    // overlay Listening pill — FloatingLauncher owns the one compact indicator).
    void startVoiceRecordingRef.current({ showGlow: false });
  };
  handleMenuVoiceRef.current = handleMenuVoice;

  const handleMenuCapture = async () => {
    if (isVoiceActivityPhase(voicePhaseRef.current) && voicePhaseRef.current !== 'listening') {
      // Do not start Capture over an active lesson — Stop first.
      return;
    }
    await handleStartRegionSelect();
  };
  handleMenuCaptureRef.current = handleMenuCapture;

  const handleMenuText = () => {
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    if (voicePhaseRef.current === 'previewing') {
      // Already in Chat preview — just focus.
      setFocusInputToken((n) => n + 1);
      return;
    }
    // Text always enters the real composer (never the welcome sheet).
    setPanelView('chat');
    panelViewRef.current = 'chat';
    void expandPanel().then(() => {
      if (isPanelExpandedRef.current) {
        setFocusInputToken((n) => n + 1);
      }
    });
  };
  handleMenuTextRef.current = handleMenuText;

  const handleMenuCanvas = () => {
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = true;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(true);
    // Window resize + launcher pin are applied by FloatingLauncher
    // (computeAnchorPreservingWindow) so the disc stays at the saved screen anchor.
  };

  const handleDemoReset = async () => {
    window.electronAPI.clearOverlay();
    clearResponse();
    clearScreenshot();
    resetTurns();
    setActiveLessonId('calculus_u_sub');
    setQuestion('');

    try {
      await fetch('http://localhost:4317/api/memory/user_123', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear user memory on demo reset:', err);
    }

    setBuddyState('idle');
  };

  const handleRestoreExplanation = (turnId: string, explanation: StoredExplanation) => {
    if (!explanation.text) return;

    visibleExplanationTurnIdRef.current = turnId;
    window.electronAPI.restoreExplanation({
      pointTarget: { x: explanation.anchorX, y: explanation.anchorY },
      text: explanation.text,
      dragOffsetX: explanation.dragOffsetX,
      dragOffsetY: explanation.dragOffsetY,
      showFullText: true,
    });
    updateTurnExplanation(turnId, { visible: true });

    if (!isPanelExpandedRef.current) {
      void expandPanel();
    }
  };

  return (
    <div className={`app-container ${isPanelExpanded ? 'expanded' : 'collapsed'}`}>
      {isPanelExpanded && (
        <div
          className={`panel-motion${isPanelClosing ? ' is-closing' : ''}`}
          style={
            {
              '--panel-origin': panelOrigin,
              '--panel-exit-ms': `${PANEL_EXIT_MS}ms`,
            } as CSSProperties
          }
        >
          {panelView === 'welcome' && (
            <WelcomeOnboarding
              onGetStarted={handleWelcomeGetStarted}
              onDismiss={() => handleWelcomeDismiss()}
              openedFromHelp={welcomeFromHelp}
            />
          )}
          {panelView === 'chat' && (
            <ChatPanel
              screenshot={screenshot}
              onClose={handlePanelClose}
              response={response}
              isLoading={isLoading}
              isStreaming={isStreaming}
              isResponseReady={isResponseReady}
              error={error}
              askQuestion={askQuestion}
              clearResponse={clearResponse}
              isRecordingVoice={isRecordingVoice}
              setIsRecordingVoice={setIsRecordingVoice}
              voiceDraft={voiceDraft}
              isSpeaking={isSpeaking}
              revealedSpokenText={revealedSpokenText}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              activeLessonId={activeLessonId}
              setActiveLessonId={setActiveLessonId}
              onStartVoiceRecording={startVoiceRecording}
              onStopVoiceRecording={stopVoiceRecordingAndSubmit}
              question={question}
              setQuestion={handleQuestionChange}
              onResetDemo={handleDemoReset}
              onAsk={handleAsk}
              chatTurns={chatTurns}
              activeTurnId={activeTurnId}
              startTurn={startTurn}
              onRestoreExplanation={handleRestoreExplanation}
              isRegionCapture={!!pendingRegion}
              isSelectingRegion={isSelectingRegion}
              onStartRegionSelect={handleStartRegionSelect}
              onClearRegion={handleClearRegion}
              focusInputToken={focusInputToken}
              guided={
                guidedAwaiting
                  ? { awaiting: guidedAwaiting, onNext: () => void continueGuided(), onEnd: endGuidedLesson }
                  : null
              }
            />
          )}
        </div>
      )}
      <FloatingLauncher
        state={buddyState}
        isExpanded={isPanelExpanded}
        isRecordingVoice={isRecordingVoice}
        demoVoiceMode={shouldBypassRealStt()}
        isSpeaking={isSpeaking}
        menuOpen={commandMenuOpen}
        onMenuOpenChange={handleMenuOpenChange}
        onMenuExitComplete={handleMenuExitComplete}
        onCollapsePanel={handlePanelClose}
        onVoice={handleMenuVoice}
        onCapture={handleMenuCapture}
        onText={handleMenuText}
        onCanvas={handleMenuCanvas}
        canvasControlsOpen={canvasControlsOpen}
        onCanvasControlsClose={() => {
          canvasControlsOpenRef.current = false;
          setCanvasControlsOpen(false);
          // Compact restore is performed by FloatingLauncher with anchor-preserving bounds.
        }}
        onClearAnnotations={() => window.electronAPI.clearOverlay()}
        voicePreviewHint={
          voicePreviewHint
            ? escapeAvailable
              ? voicePreviewHint
              : `${voicePreviewHint} · Esc unavailable — use ${
                  window.electronAPI?.platform === 'darwin' ? 'Cmd+Option+0' : 'Ctrl+Alt+0'
                }`
            : null
        }
      />
    </div>
  );
}
