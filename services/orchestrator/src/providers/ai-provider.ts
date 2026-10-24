import type { TutorInput, TutorResponse, TutorStreamStep } from '@screentutor/shared';

export interface AIProvider {
  readonly name: string;
  analyzeScreenAndQuestion(
    input: TutorInput,
    /** Called with each finished step while the rest of the answer is still being written */
    onStep?: (step: TutorStreamStep) => void,
    systemPromptOverride?: string
  ): Promise<TutorResponse>;
}
