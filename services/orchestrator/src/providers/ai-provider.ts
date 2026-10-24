import type { TutorInput, TutorResponse } from '@screentutor/shared';

export interface AIProvider {
  readonly name: string;
  analyzeScreenAndQuestion(
    input: TutorInput,
    onDelta?: (text: string) => void,
    systemPromptOverride?: string
  ): Promise<TutorResponse>;
}
