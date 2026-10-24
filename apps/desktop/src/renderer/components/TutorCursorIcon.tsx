import klarifaiLogo from '../klarifai_logo.png';

interface Props {
  size?: number;
  className?: string;
}

export default function TutorCursorIcon({ size = 28, className }: Props) {
  return (
    <img
      src={klarifaiLogo}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
      aria-hidden="true"
    />
  );
}
