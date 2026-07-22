import type { Scenario } from '../../types';
import { comboMultiplierForStreak } from '../../lib/scoring';
import { ResilienceGauge } from '../../components/ResilienceGauge';
import { StormCountdown } from '../../components/StormCountdown';
import { PrepTaskList } from '../../components/PrepTaskList';
import { FloodEscapeGame } from './FloodEscapeGame';

interface ChallengeScreenProps {
  scenario: Scenario;
  completedTaskIds: ReadonlySet<string>;
  secondsRemaining: number;
  score: number;
  currentStreak: number;
  onToggleTask: (taskId: string) => void;
  onFinish: () => void;
  onQuit: () => void;
}

/** The active gameplay screen: scenario interaction, live score and the countdown. */
export function ChallengeScreen({
  scenario,
  completedTaskIds,
  secondsRemaining,
  score,
  currentStreak,
  onToggleTask,
  onFinish,
  onQuit,
}: ChallengeScreenProps) {
  const isFlood = scenario.type === 'flood';
  const multiplier = comboMultiplierForStreak(currentStreak);
  const showCombo = currentStreak >= 2;

  return (
    <section
      className={`challenge${isFlood ? ' challenge--flood' : ''}`}
      aria-labelledby="challenge-heading"
    >
      <header className="challenge__header">
        <div>
          <h2 id="challenge-heading" className="challenge__title">
            <span aria-hidden="true">{scenario.emoji}</span> {scenario.name}
          </h2>
          <p className="challenge__tagline">{scenario.tagline}</p>
        </div>
        <ResilienceGauge score={score} />
      </header>

      {showCombo && (
        <div
          className="challenge__combo"
          role="status"
          aria-live="polite"
          aria-label={`${currentStreak} in a row — combo multiplier ${multiplier}×`}
        >
          <span className="challenge__combo-fire" aria-hidden="true">🔥</span>
          <span className="challenge__combo-text">
            {currentStreak} in a row
          </span>
          <span className="challenge__combo-multiplier">×{multiplier.toFixed(2)}</span>
        </div>
      )}

      <StormCountdown secondsRemaining={secondsRemaining} totalSeconds={scenario.durationSeconds} />

      {isFlood ? (
        <FloodEscapeGame
          tasks={scenario.tasks}
          completedTaskIds={completedTaskIds}
          secondsRemaining={secondsRemaining}
          totalSeconds={scenario.durationSeconds}
          onCompleteTask={onToggleTask}
          onFinish={onFinish}
        />
      ) : (
        <PrepTaskList
          tasks={scenario.tasks}
          completedTaskIds={completedTaskIds}
          onToggle={onToggleTask}
        />
      )}

      <footer className="challenge__actions">
        <button type="button" className="button button--ghost" onClick={onQuit}>
          Quit
        </button>
        {isFlood ? (
          <p className="challenge__finish-hint">Complete the mission by moving onto high ground.</p>
        ) : (
          <button type="button" className="button button--primary" onClick={onFinish}>
            Brace for impact
          </button>
        )}
      </footer>
    </section>
  );
}
