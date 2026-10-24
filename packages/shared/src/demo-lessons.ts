/**
 * Bundled demo lessons for offline/mock-mode demo.
 *
 * Each lesson has:
 *  - id: stable key used by MockClaudeProvider to return deterministic responses
 *  - title: display name
 *  - category: grouping (Algebra | Calculus | Graphs | Code)
 *  - content: the rendered math/code string shown in the lesson card
 *  - description: one-line context
 *  - suggestedQuestions: ready-to-fire chips
 *  - defaultMode: TutorMode to pre-select when this lesson is loaded
 *  - pointHints: pixel hints (0–1 fractions) for where the mock AI should point
 */

export interface DemoLesson {
  id: string;
  title: string;
  category: 'Algebra' | 'Calculus' | 'Graphs' | 'Code';
  emoji: string;
  content: string;
  description: string;
  suggestedQuestions: Array<{ label: string; mode: string }>;
  defaultMode: string;
  /** Visual hint lines — shown as a mini canvas in the lesson card */
  contentLines: string[];
}

export const DEMO_LESSONS: DemoLesson[] = [
  {
    id: 'algebra_distributive',
    title: 'Distributive Property',
    category: 'Algebra',
    emoji: '✖️',
    content: '2(x + 3) = 2x + 6',
    description: 'Expanding a factor across parentheses',
    contentLines: ['2(x + 3)', '= 2·x + 2·3', '= 2x + 6'],
    defaultMode: 'explain',
    suggestedQuestions: [
      { label: 'Explain this step.', mode: 'explain' },
      { label: 'Why does the 2 multiply both terms?', mode: 'explain' },
      { label: 'Give me a hint.', mode: 'hint' },
      { label: 'Quiz me.', mode: 'quiz' },
    ],
  },
  {
    id: 'algebra_sqrt_mistake',
    title: 'Common Mistake: √(a+b)',
    category: 'Algebra',
    emoji: '⚠️',
    content: 'sqrt(a + b) = sqrt(a) + sqrt(b)',
    description: "Proposed student solution (incorrect)",
    contentLines: ['Proposed student solution:', 'sqrt(a + b) = sqrt(a) + sqrt(b)', '← Incorrect'],
    defaultMode: 'mistake',
    suggestedQuestions: [
      { label: 'What mistake did I make?', mode: 'mistake' },
      { label: 'Why is this wrong?', mode: 'explain' },
      { label: 'Give me a hint.', mode: 'hint' },
    ],
  },
  {
    id: 'calculus_chain_rule',
    title: 'Chain Rule',
    category: 'Calculus',
    emoji: '⛓️',
    content: 'd/dx sin(x^2) = cos(x^2) · 2x',
    description: 'Derivative of a composite function',
    contentLines: ['d/dx sin(x^2)', '= cos(x^2) · d/dx(x^2)', '= cos(x^2) · 2x'],
    defaultMode: 'explain',
    suggestedQuestions: [
      { label: 'Explain this derivative.', mode: 'explain' },
      { label: 'Where is the inner function?', mode: 'explain' },
      { label: 'Give me a hint.', mode: 'hint' },
    ],
  },
  {
    id: 'calculus_u_sub',
    title: 'u-Substitution',
    category: 'Calculus',
    emoji: '∫',
    content: '∫ 2x cos(x^2) dx, u = x^2, du = 2x dx, ∫ cos(u) du',
    description: 'Integral solved via substitution',
    contentLines: [
      '∫ 2x cos(x^2) dx',
      'u = x^2',
      'du = 2x dx',
      '∫ cos(u) du',
    ],
    defaultMode: 'explain',
    suggestedQuestions: [
      { label: 'Explain this integral.', mode: 'explain' },
      { label: 'Why did they choose u?', mode: 'explain' },
      { label: 'Give me a hint, not the answer.', mode: 'hint' },
      { label: 'Quiz me.', mode: 'quiz' },
    ],
  },
  {
    id: 'graph_interpretation',
    title: 'Graph Interpretation',
    category: 'Graphs',
    emoji: '📈',
    content: 'A curve with labeled slope, intercept, and increasing/decreasing regions.',
    description: 'Curve with labeled slope, intercept, and increasing/decreasing regions',
    contentLines: [
      'Curve analysis:',
      '- y-intercept: (0, 0)',
      '- Slope: negative when x < 0',
      '- Slope: positive when x > 0',
      '- Increasing/Decreasing regions',
    ],
    defaultMode: 'explain',
    suggestedQuestions: [
      { label: 'Explain this graph.', mode: 'explain' },
      { label: 'Where is the slope positive?', mode: 'explain' },
      { label: 'Quiz me.', mode: 'quiz' },
    ],
  },
  {
    id: 'code_error',
    title: 'Coding Error',
    category: 'Code',
    emoji: '🐛',
    content: 'Small JavaScript/Python function with an obvious bug and error message.',
    description: 'A function with a bug and its error message',
    contentLines: [
      'def sum_list(nums):',
      '    total = 0',
      '    for i in range(len(nums) + 1):  # BUG',
      '        total += nums[i]',
      '    return total',
      '',
      '# IndexError: list index out of range',
    ],
    defaultMode: 'mistake',
    suggestedQuestions: [
      { label: 'Explain this error.', mode: 'explain' },
      { label: 'What mistake did I make?', mode: 'mistake' },
      { label: 'Give me a hint.', mode: 'hint' },
    ],
  },
];

export function getLessonById(id: string): DemoLesson | undefined {
  return DEMO_LESSONS.find((l) => l.id === id);
}
