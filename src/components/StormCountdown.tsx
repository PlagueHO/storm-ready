interface StormCountdownProps {
  secondsRemaining: number;
  totalSeconds: number;
}

/** A shrinking bar and clock that build tension as the storm approaches. */
export function StormCountdown({ secondsRemaining, totalSeconds }: StormCountdownProps) {
  const fraction = totalSeconds > 0 ? secondsRemaining / totalSeconds : 0;
  const percent = Math.max(0, Math.min(100, fraction * 100));
  const isUrgent = secondsRemaining <= 10;

  return (
    <div className="countdown" aria-live="polite">
      <div className="countdown__header">
        <span className="countdown__label">Storm hits in</span>
        <span className={`countdown__clock${isUrgent ? ' countdown__clock--urgent' : ''}`}>
          {secondsRemaining}s
        </span>
      </div>
      <div
        className="countdown__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSeconds}
        aria-valuenow={secondsRemaining}
      >
        <div
          className={`countdown__fill${isUrgent ? ' countdown__fill--urgent' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
