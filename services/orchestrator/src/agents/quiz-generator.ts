import type { TutorInput, TutorResponse, QuizItem } from '@screentutor/shared';
import type { SpecialistAgent } from './agent-router.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { getAgentPromptOverride } from '../prompts/agent-prompts.js';

export class QuizGeneratorAgent implements SpecialistAgent {
  name = 'QuizGeneratorAgent';

  constructor(private aiProvider: AIProvider) {}

  async execute(input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<TutorResponse> {
    const response = await this.aiProvider.analyzeScreenAndQuestion(
      input,
      onDelta,
      getAgentPromptOverride('QuizGeneratorAgent', input.mode)
    );

    const q = input.question.toLowerCase();
    const concept = response.concept || 'algebra';

    let quiz: QuizItem[] = [];

    if (response.quiz && response.quiz.length > 0) {
      quiz = response.quiz;
    } else if (concept === 'chain_rule' || q.includes('derivative') || q.includes('chain rule')) {
      quiz = [
        { id: 'q1', difficulty: 'easy', question: 'What is the derivative of x^2?', answer: '2x', explanation: 'Use the power rule: d/dx(x^n) = n*x^(n-1).' },
        { id: 'q2', difficulty: 'medium', question: 'What is the derivative of sin(2x)?', answer: '2cos(2x)', explanation: 'Apply chain rule: d/dx[f(g(x))] = f\'(g(x)) * g\'(x).' },
        { id: 'q3', difficulty: 'conceptual', question: 'When do you use the chain rule?', answer: 'When differentiating composed functions (a function inside a function).', explanation: 'For example, sin(x^2) or (3x+1)^5.' }
      ];
    } else {
      // Default algebra quiz
      quiz = [
        { id: 'q1', difficulty: 'easy', question: 'Solve for x: 2x = 10', answer: 'x = 5', explanation: 'Divide both sides by 2.' },
        { id: 'q2', difficulty: 'medium', question: 'Solve for x: 3x + 4 = 19', answer: 'x = 5', explanation: 'Subtract 4, then divide by 3.' },
        { id: 'q3', difficulty: 'conceptual', question: 'What does a variable represent in an equation?', answer: 'An unknown numerical value.', explanation: 'It is a placeholder for a value we want to find.' }
      ];
    }

    response.quiz = quiz;
    
    // Ensure summary mentions Pop Quiz
    response.summary = `${response.summary} (I generated a Pop Quiz for you!)`;
    response.spokenText = `${response.spokenText} Let's try a quick quiz to test your understanding!`;

    return response;
  }
}
