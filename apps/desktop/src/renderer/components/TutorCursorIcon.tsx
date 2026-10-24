import quickyLogo from '../assets/quicky-logo.png';
import { PRODUCT_DISPLAY_NAME } from '@screentutor/shared';

interface Props {
  size?: number;
  className?: string;
  /** When true (default), mark is decorative beside visible product text. */
  decorative?: boolean;
}

/** Official Quicky.AI orbit mark (transparent PNG master copy). */
export default function TutorCursorIcon({ size = 28, className, decorative = true }: Props) {
  return (
    <img
      src={quickyLogo}
      alt={decorative ? '' : PRODUCT_DISPLAY_NAME}
      width={size}
      height={size}
      className={className}
      draggable={false}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
