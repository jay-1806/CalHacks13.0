import {
  getCategoryPromptOverride,
  type TutorAgentName,
} from './tutor-system-prompt.js';

export type { TutorAgentName };

const MISCONCEPTION_PROMPT = `## Agent: Misconception Detector

Focus on finding and correcting the user's error in their work.

visualText rules:
1. Start with [DRAW:clear]
2. [DRAW:circle] or [DRAW:highlight] TIGHTLY around the incorrect step (w≤0.18, h≤0.15)
3. [DRAW:arrow] from the error to the corrected approach if helpful
4. [POINT] on the exact wrong symbol, sign, or line
5. Explain the misconception in 2–4 short lines`;

const QUIZ_PROMPT = `## Agent: Quiz Generator

Generate a brief quiz based on the screen content.

visualText rules:
1. Start with [DRAW:clear]
2. One [DRAW:rect] or [DRAW:highlight] around the topic region (w≤0.18, h≤0.15)
3. [POINT] on the concept being tested
4. Keep visualText short — quiz questions go in the quiz JSON field when possible`;

const REVIEW_PROMPT = `## Agent: Learning Plan / Review

Summarize weak concepts and study priorities from learner memory.

visualText rules:
1. [DRAW:clear] then optional [POINT:none] if no screen element to highlight
2. Minimal shapes — only highlight a relevant on-screen topic if visible
3. Focus spokenText on the study plan; keep visualText under 80 words`;

const RESEARCH_PROMPT = `## Agent: Research / Resource Finder

Connect on-screen content to external explanations.

visualText rules:
1. [DRAW:clear]
2. [POINT] on the on-screen concept being researched
3. One small [DRAW:highlight] on the relevant region (w≤0.18, h≤0.15)
4. spokenText may reference web findings; visualText stays tied to the screenshot`;

const HINT_MODE_ADDON = `## Mode: Hint

Do NOT give the full final answer in spokenText.
visualText: guide with 2–3 small steps, each with [POINT] on the next thing to examine.
Use [DRAW:circle] (r≤0.04) on the active step, not large highlights.`;

const MISTAKE_MODE_ADDON = `## Mode: Mistake Check

Identify whether the user's approach on screen is wrong.
[DRAW:highlight] only around the suspicious step (w≤0.15, h≤0.12).
State what is wrong and what to fix.`;

/** Per-agent prompt appended after the base tutor system prompt. */
export function getAgentPromptOverride(
  agentName: TutorAgentName,
  mode?: string
): string | undefined {
  const parts: string[] = [];

  switch (agentName) {
    case 'MathTutorAgent':
      parts.push(getCategoryPromptOverride('math'));
      break;
    case 'MisconceptionDetectorAgent':
      parts.push(MISCONCEPTION_PROMPT);
      break;
    case 'QuizGeneratorAgent':
      parts.push(QUIZ_PROMPT);
      break;
    case 'LearningPlanAgent':
      parts.push(REVIEW_PROMPT);
      break;
    case 'ResourceFinderAgent':
      parts.push(RESEARCH_PROMPT);
      break;
    default:
      break;
  }

  if (mode === 'hint') parts.push(HINT_MODE_ADDON);
  if (mode === 'mistake') parts.push(MISTAKE_MODE_ADDON);

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/** Category-based override when no specialist agent prompt applies. */
export function getRoutingPromptOverride(
  category: 'math' | 'code' | 'general',
  mode?: string
): string | undefined {
  const parts = [getCategoryPromptOverride(category)];
  if (mode === 'hint') parts.push(HINT_MODE_ADDON);
  if (mode === 'mistake') parts.push(MISTAKE_MODE_ADDON);
  return parts.join('\n\n');
}
