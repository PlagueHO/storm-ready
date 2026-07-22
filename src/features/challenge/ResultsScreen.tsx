import type { Scenario, StormOutcome } from '../../types';

interface ResultsScreenProps {
  scenario: Scenario;
  outcome: StormOutcome;
  bestScore: number;
  isNewRecord: boolean;
  onPlayAgain: () => void;
  onChooseAnother: () => void;
}

/** The recap screen shown once the storm hits: grade, badges and next steps. */
export function ResultsScreen({
  scenario,
  outcome,
  bestScore,
  isNewRecord,
  onPlayAgain,
  onChooseAnother,
}: ResultsScreenProps) {
  return (
    <section className="results" aria-labelledby="results-heading">
      <div className={`results__grade results__grade--${outcome.grade.toLowerCase()}`}>
        {outcome.grade}
      </div>
      <h2 id="results-heading" className="results__headline">
        {outcome.headline}
      </h2>
      <p className="results__message">{outcome.message}</p>

      <dl className="results__stats">
        <div>
          <dt>Resilience score</dt>
          <dd>{outcome.score}</dd>
        </div>
        <div>
          <dt>Damage prevented</dt>
          <dd>{outcome.damagePrevented}%</dd>
        </div>
        <div>
          <dt>Personal best</dt>
          <dd>{bestScore}</dd>
        </div>
      </dl>

      {isNewRecord ? <p className="results__record">🎉 New personal best!</p> : null}

      {outcome.badges.length > 0 ? (
        <ul className="results__badges">
          {outcome.badges.map((badge) => (
            <li key={badge} className="badge">
              {badge}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="results__actions">
        <button type="button" className="button button--ghost" onClick={onChooseAnother}>
          Choose another storm
        </button>
        <button type="button" className="button button--primary" onClick={onPlayAgain}>
          Play {scenario.name} again
        </button>
      </footer>
    </section>
  );
}
