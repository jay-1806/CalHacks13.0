/**
 * Bundled math lessons to try the tutor on.
 *
 * Each lesson has:
 *  - id: stable key (also part of the response cache key)
 *  - title: display name
 *  - category: grouping (Algebra | Calculus | Graphs)
 *  - content: the math shown in the lesson card
 *  - description: one-line context
 *  - suggestedQuestions: ready-to-fire question chips
 */

export interface DemoLesson {
  id: string;
  title: string;
  category: 'Algebra' | 'Calculus' | 'Graphs';
  emoji: string;
  content: string;
  description: string;
  suggestedQuestions: Array<{ label: string }>;
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
    suggestedQuestions: [
      { label: 'Explain this step.' },
      { label: 'Why does the 2 multiply both terms?' },
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
    suggestedQuestions: [
      { label: 'Why is this wrong?' },
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
    suggestedQuestions: [
      { label: 'Explain this derivative.' },
      { label: 'Where is the inner function?' },
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
    suggestedQuestions: [
      { label: 'Explain this integral.' },
      { label: 'Why did they choose u?' },
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
    suggestedQuestions: [
      { label: 'Explain this graph.' },
      { label: 'Where is the slope positive?' },
    ],
  },
];

export function getLessonById(id: string): DemoLesson | undefined {
  return DEMO_LESSONS.find((l) => l.id === id);
}
