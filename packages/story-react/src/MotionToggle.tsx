import { Pause, Play } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { motionToggleStyles as styles } from './classes.js';

/**
 * The play/pause control for everything in a story that loops on its own (WCAG
 * 2.2.2): loops and the hero card all offer the same
 * button in the same corner of the moving thing, the same size whichever
 * state it shows. The parent must be positioned.
 */
export function MotionToggle({
  paused,
  onClick,
  label,
}: {
  /** The motion is stopped, so the button offers Play. */
  paused: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  /** What moves, usually the media's alt: read after "Play:" or "Pause:" in
   *  the accessible name. */
  label: string;
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={onClick}
      aria-label={`${paused ? 'Play' : 'Pause'}: ${label}`}
      title={paused ? 'Play animation' : 'Pause animation'}
    >
      {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
    </button>
  );
}

export default MotionToggle;
