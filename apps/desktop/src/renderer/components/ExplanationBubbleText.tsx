import { formatMathText, isEquationLine, isStepLabelLine } from '@screentutor/shared';

interface Props {
  text: string;
}

export default function ExplanationBubbleText({ text }: Props) {
  const lines = text.split('\n');

  return (
    <div className="bubble-text-inner">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={index} />;

        const formatted = formatMathText(trimmed);

        if (isStepLabelLine(trimmed)) {
          return (
            <span key={index} className="step-label">
              {formatted}
            </span>
          );
        }

        if (isEquationLine(trimmed)) {
          return (
            <div key={index} className="equation-block">
              {formatted}
            </div>
          );
        }

        return (
          <div key={index} className="bubble-line">
            {formatted}
          </div>
        );
      })}
    </div>
  );
}
