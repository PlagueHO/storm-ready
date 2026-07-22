interface ResilienceGaugeProps {
  /** Current resilience score, 0-100. */
  score: number;
}

/**
 * A circular gauge that visualises the live resilience score.
 * Built with inline SVG so there is no charting dependency to run locally.
 */
export function ResilienceGauge({ score }: ResilienceGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="gauge" role="img" aria-label={`Resilience score ${clamped} out of 100`}>
      <svg viewBox="0 0 120 120" className="gauge__svg">
        <circle className="gauge__track" cx="60" cy="60" r={radius} />
        <circle
          className="gauge__value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="gauge__readout">
        <span className="gauge__score">{clamped}</span>
        <span className="gauge__label">Resilience</span>
      </div>
    </div>
  );
}
