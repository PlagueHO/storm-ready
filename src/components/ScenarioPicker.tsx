import type { Scenario } from '../types';
import { SCENARIOS } from '../data/scenarios';
import { getBestScore } from '../lib/storage';

interface ScenarioPickerProps {
  onPick: (scenario: Scenario) => void;
}

/** Landing screen: choose which storm to prepare for. */
export function ScenarioPicker({ onPick }: ScenarioPickerProps) {
  return (
    <section className="picker" aria-labelledby="picker-heading">
      <h2 id="picker-heading" className="picker__heading">
        Choose your storm
      </h2>
      <p className="picker__subtitle">
        A storm is on the way. Pick a scenario and race the clock to get your home ready.
      </p>
      <ul className="picker__grid">
        {SCENARIOS.map((scenario) => {
          const best = getBestScore(scenario.id);
          return (
            <li key={scenario.id}>
              <button
                type="button"
                className={`scenario-card scenario-card--${scenario.type}`}
                onClick={() => onPick(scenario)}
              >
                <span className="scenario-card__emoji" aria-hidden="true">
                  {scenario.emoji}
                </span>
                <span className="scenario-card__name">{scenario.name}</span>
                <span className="scenario-card__tagline">{scenario.tagline}</span>
                <span className="scenario-card__meta">
                  {scenario.durationSeconds}s · {scenario.tasks.length} tasks
                  {best > 0 ? ` · best ${best}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
